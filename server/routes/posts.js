import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { pool } from '../db.js'
import { auth, userState, requireNotMuted } from '../middleware/auth.js'
import { optionalAuth } from '../middleware/optionalAuth.js'
import { sniffFile } from '../media-utils.js'
import { uploadFile, deleteFile, isS3 } from '../storage.js'
import { inspectText, SENSITIVE_RULE_MESSAGE } from '../sensitive-filter.js'
import { createNotification, notifyAdmins } from './notifications.js'
const r = Router()
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../uploads')
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
const upload = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 12)
      cb(null, crypto.randomBytes(16).toString('hex') + ext)
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//.test(file.mimetype) || /^video\//.test(file.mimetype)
    if (ok) return cb(null, true)
    const e = new Error('仅支持图片或视频文件')
    e.status = 400
    cb(e, false)
  },
})

/* ===== 讨论区匿名：社区名为「讨论区」时，作者一律显示为「匿名」 ===== */
const TREEHOLE_NAME = '讨论区'
const hideInTreehole = (rows, isTreehole) =>
  isTreehole ? rows.map((x) => ({ ...x, author: '匿名', author_avatar: null })) : rows

export const mediaUrl = (p) => {
  if (Array.isArray(p.media)) return p
  try {
    p.media = p.media ? JSON.parse(p.media) : []
  } catch {
    p.media = []
  }
  return p
}

export async function deleteMediaFiles(media) {
  let items = []
  try {
    items = Array.isArray(media) ? media : JSON.parse(media || '[]')
  } catch {
    items = []
  }
  for (const item of items) {
    if (typeof item === 'string') {
      await deleteFile(item)
      continue
    }
    if (item?.url) await deleteFile(item.url, item.key)
  }
}

/* 上传一个临时文件到存储层（S3 或本地），返回落库用的 {url,type,key} */
const uploadMediaItem = async (file) => {
  const buffer = fs.readFileSync(path.join(dir, file.filename))
  const { url, key } = await uploadFile({ key: file.filename, buffer, contentType: file.mimetype })
  return { url, type: /^video\//.test(file.mimetype) ? 'video' : 'image', key }
}
/* S3 模式下临时文件已上传对象存储，清理本地残留 */
const cleanupTemps = (files) => {
  if (isS3()) {
    for (const f of files || []) {
      try {
        fs.unlinkSync(path.join(dir, f.filename))
      } catch {}
    }
  }
}

/* 帖子行附加统计列：like_count / comment_count / liked(当前用户是否点过赞) */
const statsCols = (me) =>
  `(SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) like_count,(SELECT COUNT(*) FROM comments cm WHERE cm.post_id=p.id) comment_count,(SELECT COUNT(*) FROM likes l2 WHERE l2.post_id=p.id AND l2.user_id=${Number(me?.id) || 0}) liked`

/* 列表排序：白名单映射，绝不把请求参数直接拼进 ORDER BY。
   置顶帖在所有模式下都排最前；热门按点赞 + 2×评论做时间衰减。 */
const SORTS = {
  latest: 'p.pinned DESC, p.created_at DESC',
  hot: 'p.pinned DESC, ((SELECT COUNT(*) FROM likes l3 WHERE l3.post_id=p.id) + 2*(SELECT COUNT(*) FROM comments cm3 WHERE cm3.post_id=p.id)) / POW(TIMESTAMPDIFF(HOUR, p.created_at, NOW()) + 2, 1.5) DESC, p.created_at DESC',
  featured: 'p.pinned DESC, p.featured DESC, p.created_at DESC',
}

r.get('/', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const communityId = req.query.communityId ? Number(req.query.communityId) : null
    const userId = req.query.userId ? Number(req.query.userId) : null
    const q = String(req.query.q || '').trim()
    const sort = SORTS[String(req.query.sort || 'latest')] || SORTS.latest
    const where = []
    const filterParams = []
    if (communityId) {
      where.push('p.community_id=?')
      filterParams.push(communityId)
    }
    if (userId) {
      where.push('p.user_id=?')
      filterParams.push(userId)
    }
    if (req.query.featured === '1') where.push('p.featured=1')
    if (q) {
      where.push('(p.title LIKE ? OR p.content LIKE ? OR u.name LIKE ? OR c.name LIKE ?)')
      filterParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const join = 'FROM posts p JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id'
    const [x] = await pool.query(
      `SELECT p.*,u.name author,u.avatar author_avatar,c.name community,${statsCols(req.user)} ${join} ${whereSql} ORDER BY ${sort} LIMIT ? OFFSET ?`,
      [...filterParams, limit, offset]
    )
    const [countRows] = await pool.query(`SELECT COUNT(*) AS count ${join} ${whereSql}`, filterParams)
    res.json({
      posts: x.map((p) => hideInTreehole([mediaUrl(p)], p.community === TREEHOLE_NAME)[0]),
      total: countRows[0].count,
    })
  } catch (e) {
    console.error(e)
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.get('/:id', optionalAuth, async (req, res) => {
  try {
    const me = Number(req.user?.id) || 0
    const [x] = await pool.query(
      `SELECT p.*,u.name author,u.avatar author_avatar,c.name community,${statsCols(req.user)},(SELECT COUNT(*) FROM reports rp WHERE rp.post_id=p.id AND rp.user_id=${me} AND rp.status='pending') reported FROM posts p JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id WHERE p.id=?`,
      [req.params.id]
    )
    if (!x[0]) return res.status(404).json({ message: '帖子不存在' })
    res.json(hideInTreehole([mediaUrl(x[0])], x[0].community === TREEHOLE_NAME)[0])
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

/* ===== 点赞 / 取消点赞（登录） ===== */
r.post('/:id/like', auth, userState, requireNotMuted, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id,user_id,title FROM posts WHERE id=?', [req.params.id])
    if (!rows[0]) return res.status(404).json({ message: '帖子不存在' })
    const [ins] = await pool.query('INSERT IGNORE INTO likes(post_id,user_id) VALUES(?,?)', [
      req.params.id,
      req.user.id,
    ])
    const [[c]] = await pool.query('SELECT COUNT(*) c FROM likes WHERE post_id=?', [req.params.id])
    /* affectedRows 为 0 说明本来就点过赞（INSERT IGNORE 没有新增），此时不重复通知 */
    if (ins.affectedRows > 0)
      await createNotification({
        userId: rows[0].user_id,
        actorId: req.user.id,
        actorName: req.user.name,
        type: 'like',
        postId: rows[0].id,
        body: `赞了你的帖子《${rows[0].title}》`,
      })
    res.json({ ok: true, liked: true, likeCount: c.c })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.delete('/:id/like', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM likes WHERE post_id=? AND user_id=?', [req.params.id, req.user.id])
    const [[c]] = await pool.query('SELECT COUNT(*) c FROM likes WHERE post_id=?', [req.params.id])
    res.json({ ok: true, liked: false, likeCount: c.c })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

/* ===== 举报：提交 / 详情页返回"我是否已举报" ===== */
r.post('/:id/report', auth, userState, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id,user_id,title FROM posts WHERE id=?', [req.params.id])
    const post = rows[0]
    if (!post) return res.status(404).json({ message: '帖子不存在' })
    if (post.user_id === req.user.id) return res.status(400).json({ message: '不能举报自己的帖子' })
    const reason = String(req.body?.reason || '').trim()
    if (!reason) return res.status(400).json({ message: '请选择举报理由' })
    if (reason.length > 200) return res.status(400).json({ message: '举报理由最长 200 字' })
    const [dup] = await pool.query("SELECT id FROM reports WHERE post_id=? AND user_id=? AND status='pending'", [
      req.params.id,
      req.user.id,
    ])
    if (dup[0]) return res.status(400).json({ message: '你已举报过该帖子，请等待处理' })
    await pool.query('INSERT INTO reports(post_id,user_id,reason) VALUES(?,?,?)', [req.params.id, req.user.id, reason])
    /* 通知管理员有待处理举报 */
    await notifyAdmins({
      actorId: req.user.id,
      actorName: req.user.name,
      type: 'report_handled',
      postId: post.id,
      body: `举报了《${post.title}》：${reason}`,
    })
    res.json({ ok: true, message: '举报已提交，我们会尽快处理' })
  } catch (error) {
    if (error?.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ message: '帖子不存在' })
    console.error('举报失败:', error?.message || error)
    res.status(503).json({ message: '提交失败，请稍后重试' })
  }
})

/* ===== 评论：列表 / 发表 / 删除 ===== */
r.get('/:id/comments', optionalAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT p.id,c.name community FROM posts p JOIN communities c ON c.id=p.community_id WHERE p.id=?',
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: '帖子不存在' })
    const [x] = await pool.query(
      'SELECT cm.*,u.name author,u.avatar author_avatar FROM comments cm JOIN users u ON u.id=cm.user_id WHERE cm.post_id=? ORDER BY cm.created_at ASC',
      [req.params.id]
    )
    const [[c]] = await pool.query('SELECT COUNT(*) c FROM comments WHERE post_id=?', [req.params.id])
    res.json({ comments: hideInTreehole(x, rows[0].community === TREEHOLE_NAME), total: c.c })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.post('/:id/comments', auth, userState, requireNotMuted, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT p.id,p.community_id,p.user_id,p.title,c.name community FROM posts p JOIN communities c ON c.id=p.community_id WHERE p.id=?',
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ message: '帖子不存在' })
    /* 敏感词：block 类直接拒绝，mask 类打码后落库 */
    const check = inspectText(String(req.body?.content || '').trim())
    if (!check.ok) return res.status(400).json({ message: SENSITIVE_RULE_MESSAGE, blocked: check.blocked })
    const content = check.text[0]
    if (!content) return res.status(400).json({ message: '评论内容不能为空' })
    if (content.length > 500) return res.status(400).json({ message: '评论最长 500 字' })
    const [x] = await pool.query('INSERT INTO comments(post_id,user_id,content) VALUES(?,?,?)', [
      req.params.id,
      req.user.id,
      content,
    ])
    const [fresh] = await pool.query(
      'SELECT cm.*,u.name author,u.avatar author_avatar FROM comments cm JOIN users u ON u.id=cm.user_id WHERE cm.id=?',
      [x.insertId]
    )
    const [[c]] = await pool.query('SELECT COUNT(*) c FROM comments WHERE post_id=?', [req.params.id])
    /* 通知帖主（讨论区帖由 createNotification 内部判定后跳过） */
    await createNotification({
      userId: rows[0].user_id,
      actorId: req.user.id,
      actorName: req.user.name,
      type: 'comment',
      postId: rows[0].id,
      commentId: x.insertId,
      body: `评论了你的帖子《${rows[0].title}》`,
    })
    const anon =
      rows[0].community === TREEHOLE_NAME
        ? hideInTreehole(
            [{ author: fresh[0].author, author_avatar: fresh[0].author_avatar, user_id: fresh[0].user_id }],
            true
          )
        : []
    res.json({
      comment: { ...fresh[0], ...(anon[0] ? { author: anon[0].author, author_avatar: null } : {}) },
      total: c.c,
      masked: check.masked,
    })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.delete('/comments/:id', auth, userState, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM comments WHERE id=?', [req.params.id])
    const comment = rows[0]
    if (!comment) return res.status(404).json({ message: '评论不存在' })
    const isAdmin = req.user?.role === 'admin'
    if (comment.user_id !== req.user.id && !isAdmin) return res.status(403).json({ message: '只能删除自己的评论' })
    await pool.query('DELETE FROM comments WHERE id=?', [comment.id])
    const [[c]] = await pool.query('SELECT COUNT(*) c FROM comments WHERE post_id=?', [comment.post_id])
    res.json({ ok: true, total: c.c })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

/* 写盘后二次校验：读取文件头确认真实类型，任一非法文件则清理本请求全部已写文件 */
const validateUploadedFiles = (files) => {
  const all = [...(files?.images || []), ...(files?.video || [])]
  const invalid = all.filter((f) => !sniffFile(path.join(dir, f.filename)))
  if (invalid.length) {
    for (const f of all) {
      try {
        fs.unlinkSync(path.join(dir, f.filename))
      } catch {}
    }
    return false
  }
  return true
}

r.post(
  '/',
  auth,
  userState,
  requireNotMuted,
  upload.fields([
    { name: 'images', maxCount: 9 },
    { name: 'video', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, content, communityId } = req.body
      if (!title || !content || !communityId) {
        for (const f of [...(req.files?.images || []), ...(req.files?.video || [])]) {
          try {
            fs.unlinkSync(path.join(dir, f.filename))
          } catch {}
        }
        return res.status(400).json({ message: '标题、内容和社区不能为空' })
      }
      /* 敏感词：先判后写盘，避免违规内容留下孤儿文件 */
      const check = inspectText(String(title), String(content))
      if (!check.ok) {
        for (const f of [...(req.files?.images || []), ...(req.files?.video || [])]) {
          try {
            fs.unlinkSync(path.join(dir, f.filename))
          } catch {}
        }
        return res.status(400).json({ message: SENSITIVE_RULE_MESSAGE, blocked: check.blocked })
      }
      if (!validateUploadedFiles(req.files))
        return res.status(400).json({ message: '文件内容校验失败，仅支持图片或视频文件' })
      const items = []
      for (const f of req.files?.images || []) items.push(await uploadMediaItem(f))
      for (const f of req.files?.video || []) items.push(await uploadMediaItem(f))
      cleanupTemps([...(req.files?.images || []), ...(req.files?.video || [])])
      const [x] = await pool.query('INSERT INTO posts(title,content,media,community_id,user_id) VALUES(?,?,?,?,?)', [
        check.text[0].trim().slice(0, 160),
        check.text[1],
        JSON.stringify(items),
        communityId,
        req.user.id,
      ])
      const [fresh] = await pool.query(
        'SELECT p.*,u.name author,c.name community FROM posts p JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id WHERE p.id=?',
        [x.insertId]
      )
      res.json(mediaUrl(fresh[0]))
    } catch (error) {
      if (error?.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: '所选社区不存在' })
      res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
    }
  }
)

r.put('/:id', auth, userState, requireNotMuted, async (req, res) => {
  try {
    const { title, content, communityId } = req.body
    const [rows] = await pool.query('SELECT * FROM posts WHERE id=?', [req.params.id])
    const post = rows[0]
    if (!post) return res.status(404).json({ message: '帖子不存在' })
    const isAdmin = req.user?.role === 'admin'
    if (post.user_id !== req.user.id && !isAdmin) return res.status(403).json({ message: '只能编辑自己的帖子' })
    if (!title || !title.trim()) return res.status(400).json({ message: '标题不能为空' })
    const check = inspectText(String(title), String(content ?? ''))
    if (!check.ok) return res.status(400).json({ message: SENSITIVE_RULE_MESSAGE, blocked: check.blocked })
    const newCommunityId = communityId ? Number(communityId) : post.community_id
    if (!newCommunityId) return res.status(400).json({ message: '请选择社区' })
    await pool.query('UPDATE posts SET title=?,content=?,community_id=? WHERE id=?', [
      check.text[0].trim().slice(0, 160),
      check.text[1],
      newCommunityId,
      post.id,
    ])
    const [fresh] = await pool.query(
      'SELECT p.*,u.name author,u.avatar author_avatar,c.name community FROM posts p JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id WHERE p.id=?',
      [post.id]
    )
    res.json(mediaUrl(fresh[0]))
  } catch (error) {
    if (error?.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: '所选社区不存在' })
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.delete('/:id', auth, userState, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM posts WHERE id=?', [req.params.id])
    const post = rows[0]
    if (!post) return res.status(404).json({ message: '帖子不存在' })
    const isAdmin = req.user?.role === 'admin'
    if (post.user_id !== req.user.id && !isAdmin) return res.status(403).json({ message: '只能删除自己的帖子' })
    await pool.query('DELETE FROM posts WHERE id=?', [post.id])
    await deleteMediaFiles(post.media)
    res.json({ ok: true, message: '帖子已删除' })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

export default r
