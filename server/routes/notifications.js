// 站内通知：列表 / 未读数 / 标记已读，以及给其他路由复用的建通知辅助函数。
//
// 几条刻意的规则：
//   1. 不给自己发通知（自己点赞/评论自己的帖子只增计数，不进通知流）；
//   2. 讨论区（树洞）的互动不产生通知——那类内容的语义就是「不留痕迹」，
//      把互动推给作者会直接破坏匿名性；
//   3. 同一人对同一目标只保留最新一条，先查后写做去重，避免反复点赞刷屏；
//   4. 通知里存发起人的**名字快照**，用户改名或注销后历史通知仍可读。
import { Router } from 'express'
import { pool } from '../db.js'
import { auth, userState } from '../middleware/auth.js'

const r = Router()

const TREEHOLE_NAME = '讨论区'

/** 通知类型白名单，防止前端传任意字符串进库 */
export const NOTIFICATION_TYPES = ['like', 'comment', 'reply', 'report_handled', 'system']

/**
 * 建通知。失败只记录日志，绝不向上抛——
 * 通知是副产物，它坏了不应该让点赞/评论这些主流程失败。
 */
export async function createNotification({
  userId,
  actorId = null,
  actorName = null,
  type,
  postId = null,
  commentId = null,
  body = '',
}) {
  try {
    const target = Number(userId)
    if (!Number.isInteger(target) || target <= 0) return
    // 规则 1：不给自己发
    if (actorId && Number(actorId) === target) return
    if (!NOTIFICATION_TYPES.includes(type)) return

    const post = postId === null || postId === undefined ? null : Number(postId)

    // 规则 2：讨论区互动不通知
    if (post) {
      const [rows] = await pool.query(
        'SELECT c.name FROM posts p JOIN communities c ON c.id=p.community_id WHERE p.id=? LIMIT 1',
        [post]
      )
      // 帖子已不存在（例如刚被删除）则不发通知
      if (!rows[0]) return
      if (rows[0].name === TREEHOLE_NAME) return
    }

    // 规则 3：同一 actor 对同一 (类型,目标) 只留一条最新，有则更新并重新置为未读
    const [existing] = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id=? AND type=?
         AND (actor_id <=> ?) AND (post_id <=> ?) AND (comment_id <=> ?)
       LIMIT 1`,
      [target, type, actorId ? Number(actorId) : null, post, commentId ? Number(commentId) : null]
    )

    if (existing[0]) {
      await pool.query(
        'UPDATE notifications SET actor_name=?, body=?, is_read=0, created_at=CURRENT_TIMESTAMP WHERE id=?',
        [actorName, String(body || '').slice(0, 200), existing[0].id]
      )
      return
    }

    await pool.query(
      `INSERT INTO notifications(user_id,actor_id,actor_name,type,post_id,comment_id,body,is_read)
       VALUES(?,?,?,?,?,?,?,0)`,
      [
        target,
        actorId ? Number(actorId) : null,
        actorName,
        type,
        post,
        commentId ? Number(commentId) : null,
        String(body || '').slice(0, 200),
      ]
    )
  } catch (error) {
    console.warn('写入通知失败：', error?.message || error)
  }
}

/** 给全部管理员建通知（举报类事件走这条） */
export async function notifyAdmins({ actorId = null, actorName = null, type, postId = null, body = '' }) {
  try {
    const [admins] = await pool.query("SELECT id FROM users WHERE role='admin'")
    for (const admin of admins) {
      await createNotification({ userId: admin.id, actorId, actorName, type, postId, body })
    }
  } catch (error) {
    console.warn('通知管理员失败：', error?.message || error)
  }
}

/* ===== 未读数（角标） ===== */
r.get('/unread', auth, userState, async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0', [
      req.user.id,
    ])
    res.json({ unread: row.c })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

/* ===== 通知列表 ===== */
r.get('/', auth, userState, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const [rows] = await pool.query(
      `SELECT n.id,n.type,n.post_id,n.comment_id,n.body,n.is_read,n.actor_name,n.created_at,
              p.title post_title,
              u.name author
       FROM notifications n
       LEFT JOIN posts p ON p.id=n.post_id
       LEFT JOIN users u ON u.id=n.actor_id
       WHERE n.user_id=?
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    )
    const [[count]] = await pool.query('SELECT COUNT(*) c FROM notifications WHERE user_id=?', [req.user.id])
    const [[unread]] = await pool.query('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0', [
      req.user.id,
    ])
    res.json({
      notifications: rows.map((row) => ({
        ...row,
        // 帖子可能已被删除：前端据此显示「内容已删除」而不是给一个死链
        post_deleted: row.post_id !== null && row.post_title === null,
        // 发起人可能已注销，退回快照里的名字
        actor_name: row.author || row.actor_name || '有人',
      })),
      total: count.c,
      unread: unread.c,
    })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

/* ===== 标记已读：单条 / 全部 ===== */
r.post('/read', auth, userState, async (req, res) => {
  try {
    const id = Number(req.body?.id)
    if (Number.isInteger(id) && id > 0) {
      await pool.query('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [id, req.user.id])
    } else {
      await pool.query('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.id])
    }
    const [[row]] = await pool.query('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0', [
      req.user.id,
    ])
    res.json({ ok: true, unread: row.c })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

export default r
