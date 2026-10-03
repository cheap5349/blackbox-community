import { Router } from 'express'
import { pool } from '../db.js'
import { auth, userState } from '../middleware/auth.js'
import { mediaUrl, deleteMediaFiles } from './posts.js'
import { createNotification } from './notifications.js'
const r = Router()

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: '需要管理员权限' })
  next()
}
// userState 先回查数据库确认封禁/角色，adminOnly 再据此判权：
// 被降权的管理员必须立刻失去后台权限，不能靠旧 token 继续操作。
r.use(auth, userState, adminOnly)

r.get('/stats', async (_req, res) => {
  try {
    const [posts] = await pool.query('SELECT COUNT(*) c FROM posts')
    const [communities] = await pool.query('SELECT COUNT(*) c FROM communities')
    const [users] = await pool.query('SELECT COUNT(*) c FROM users')
    const [reports] = await pool.query("SELECT COUNT(*) c FROM reports WHERE status='pending'")
    const [banned] = await pool.query("SELECT COUNT(*) c FROM users WHERE status='banned'")
    const [muted] = await pool.query(
      'SELECT COUNT(*) c FROM users WHERE muted_until IS NOT NULL AND muted_until > NOW()'
    )
    res.json({
      posts: posts[0].c,
      communities: communities[0].c,
      users: users[0].c,
      reports: reports[0].c,
      banned: banned[0].c,
      muted: muted[0].c,
    })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.get('/posts', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const q = String(req.query.q || '').trim()
    const where = q ? 'WHERE p.title LIKE ? OR p.content LIKE ? OR u.name LIKE ? OR c.name LIKE ?' : ''
    const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : []
    const [x] = await pool.query(
      `SELECT p.*,u.name author,c.name community FROM posts p JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    const [countRows] = await pool.query(
      `SELECT COUNT(*) c FROM posts p JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id ${where}`,
      params
    )
    res.json({ posts: x.map(mediaUrl), total: countRows[0].c })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.get('/communities', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const q = String(req.query.q || '').trim()
    const where = q ? 'WHERE c.name LIKE ? OR c.description LIKE ? OR u.name LIKE ?' : ''
    const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []
    const [x] = await pool.query(
      `SELECT c.*,u.name owner_name,COUNT(p.id) postCount FROM communities c LEFT JOIN users u ON u.id=c.owner_id LEFT JOIN posts p ON p.community_id=c.id ${where} GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    const [countRows] = await pool.query(
      `SELECT COUNT(*) c FROM communities c LEFT JOIN users u ON u.id=c.owner_id ${where}`,
      params
    )
    res.json({ communities: x, total: countRows[0].c })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

/* ===== 用户管理：列表 / 该用户的帖子（含讨论区匿名帖） / 该用户的评论 ===== */
r.get('/users', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const q = String(req.query.q || '').trim()
    const status = String(req.query.status || '')
    const where = []
    const params = []
    if (q) {
      where.push('(u.name LIKE ? OR u.email LIKE ?)')
      params.push(`%${q}%`, `%${q}%`)
    }
    if (['active', 'banned'].includes(status)) {
      where.push('u.status=?')
      params.push(status)
    }
    /* muted 是派生状态（看 muted_until 是否过期），不能直接当列筛，单独处理 */
    if (status === 'muted') where.push('(u.muted_until IS NOT NULL AND u.muted_until > NOW())')
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const [x] = await pool.query(
      `SELECT u.id,u.name,u.email,u.role,u.bio,u.status,u.muted_until,u.created_at,
  (u.muted_until IS NOT NULL AND u.muted_until > NOW()) AS muted,
  (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id) post_count,
  (SELECT COUNT(*) FROM comments c WHERE c.user_id=u.id) comment_count,
  (SELECT COUNT(*) FROM likes l WHERE l.user_id=u.id) like_count
  FROM users u ${whereSql} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    const [countRows] = await pool.query(`SELECT COUNT(*) c FROM users u ${whereSql}`, params)
    res.json({ users: x, total: countRows[0].c })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

/* ===== 用户治理：封禁 / 解封 / 禁言 / 解禁 / 角色 =====
   所有操作都留痕（管理员 id 落在响应里由前端提示），并做自锁保护：
   管理员不能封禁自己、不能撤销自己的管理员身份——否则可能把后台锁死。 */
r.post('/users/:id/state', async (req, res) => {
  try {
    const targetId = Number(req.params.id)
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ message: '无效的用户' })
    const [rows] = await pool.query('SELECT id,name,role,status FROM users WHERE id=?', [targetId])
    const target = rows[0]
    if (!target) return res.status(404).json({ message: '用户不存在' })
    const { action } = req.body || {}
    if (targetId === req.user.id && ['ban', 'demote'].includes(action))
      return res.status(400).json({ message: '不能对自己执行该操作' })
    let message = ''
    if (action === 'ban') {
      await pool.query("UPDATE users SET status='banned' WHERE id=?", [targetId])
      message = '已封禁该用户'
    } else if (action === 'unban') {
      await pool.query("UPDATE users SET status='active' WHERE id=?", [targetId])
      message = '已解除封禁'
    } else if (action === 'promote') {
      await pool.query("UPDATE users SET role='admin' WHERE id=?", [targetId])
      message = '已设为管理员'
    } else if (action === 'demote') {
      if (target.role !== 'admin') return res.status(400).json({ message: '该用户不是管理员' })
      await pool.query("UPDATE users SET role='user' WHERE id=?", [targetId])
      message = '已撤销管理员身份'
    } else if (action === 'mute') {
      const hours = Number(req.body?.hours)
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365)
        return res.status(400).json({ message: '禁言时长无效' })
      await pool.query('UPDATE users SET muted_until=DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id=?', [
        Math.round(hours),
        targetId,
      ])
      message = `已禁言 ${Math.round(hours)} 小时`
    } else if (action === 'unmute') {
      await pool.query('UPDATE users SET muted_until=NULL WHERE id=?', [targetId])
      message = '已解除禁言'
    } else return res.status(400).json({ message: '无效的操作' })
    /* 治理结果回执给当事人，让他知道发生了什么、为什么不能发言 */
    if (action !== 'promote' && action !== 'demote')
      await createNotification({ userId: targetId, type: 'system', body: message })
    const [fresh] = await pool.query(
      'SELECT id,name,email,role,status,muted_until,(muted_until IS NOT NULL AND muted_until > NOW()) AS muted FROM users WHERE id=?',
      [targetId]
    )
    res.json({ ok: true, message, user: fresh[0] })
  } catch (error) {
    console.error('用户治理失败:', error?.message || error)
    res.status(503).json({ message: '操作失败，请稍后重试' })
  }
})

/* ===== 帖子运营：置顶 / 加精 ===== */
r.post('/posts/:id/flags', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: '无效的帖子' })
    const fields = []
    const params = []
    if (typeof req.body?.pinned === 'boolean') {
      fields.push('pinned=?')
      params.push(req.body.pinned ? 1 : 0)
    }
    if (typeof req.body?.featured === 'boolean') {
      fields.push('featured=?')
      params.push(req.body.featured ? 1 : 0)
    }
    if (!fields.length) return res.status(400).json({ message: '没有需要更新的标记' })
    params.push(id)
    const [result] = await pool.query(`UPDATE posts SET ${fields.join(',')} WHERE id=?`, params)
    if (!result.affectedRows) return res.status(404).json({ message: '帖子不存在' })
    const [rows] = await pool.query('SELECT id,title,pinned,featured FROM posts WHERE id=?', [id])
    res.json({ ok: true, post: rows[0] })
  } catch {
    res.status(503).json({ message: '操作失败，请稍后重试' })
  }
})

r.get('/users/:id/posts', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const [x] = await pool.query(
      'SELECT p.*,u.name author,c.name community FROM posts p JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT ? OFFSET ?',
      [req.params.id, limit, offset]
    )
    res.json({ posts: x.map(mediaUrl).map((p) => ({ ...p, is_treehole: p.community === '讨论区' })) })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.get('/users/:id/comments', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const [x] = await pool.query(
      'SELECT cm.id,cm.content,cm.created_at,u.name author,p.title post_title,c.name community FROM comments cm JOIN users u ON u.id=cm.user_id JOIN posts p ON p.id=cm.post_id JOIN communities c ON c.id=p.community_id WHERE cm.user_id=? ORDER BY cm.created_at DESC LIMIT ? OFFSET ?',
      [req.params.id, limit, offset]
    )
    res.json({ comments: x })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

/* ===== 举报管理：列表（status 过滤/搜索/分页）/ 处置（忽略 or 删除帖子） ===== */
r.get('/reports', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const status = String(req.query.status || '')
    const q = String(req.query.q || '').trim()
    const where = []
    const params = []
    if (['pending', 'dismissed', 'taken_down'].includes(status)) {
      where.push('r.status=?')
      params.push(status)
    }
    if (q) {
      where.push('(p.title LIKE ? OR p.content LIKE ? OR u.name LIKE ? OR au.name LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const join =
      'FROM reports r JOIN posts p ON p.id=r.post_id JOIN users u ON u.id=r.user_id JOIN users au ON au.id=p.user_id JOIN communities c ON c.id=p.community_id'
    const [x] = await pool.query(
      `SELECT r.*,p.title post_title,u.name reporter_name,au.name post_author,c.name community ${join} ${whereSql} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    const [countRows] = await pool.query(`SELECT COUNT(*) c ${join} ${whereSql}`, params)
    res.json({ reports: x, total: countRows[0].c })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.post('/reports/:id/resolve', async (req, res) => {
  try {
    const action = req.body?.action
    if (action !== 'dismiss' && action !== 'delete') return res.status(400).json({ message: '无效的处理方式' })
    const [rows] = await pool.query('SELECT * FROM reports WHERE id=?', [req.params.id])
    const report = rows[0]
    if (!report) return res.status(404).json({ message: '举报不存在' })
    if (report.status !== 'pending') return res.status(400).json({ message: '该举报已处理' })
    if (action === 'delete') {
      const [posts] = await pool.query('SELECT * FROM posts WHERE id=?', [report.post_id])
      const post = posts[0]
      if (post) {
        await pool.query('DELETE FROM posts WHERE id=?', [post.id])
        await deleteMediaFiles(post.media)
      }
    }
    await pool.query('UPDATE reports SET status=?,handled_at=NOW(),handled_by=? WHERE id=?', [
      action === 'delete' ? 'taken_down' : 'dismissed',
      req.user.id,
      report.id,
    ])
    res.json({ ok: true, message: action === 'delete' ? '已删除帖子并结案' : '已忽略该举报' })
  } catch {
    res.status(503).json({ message: '处理失败，请稍后重试' })
  }
})

export default r
