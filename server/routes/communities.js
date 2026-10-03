import { Router } from 'express'
import { pool } from '../db.js'
import { auth } from '../middleware/auth.js'
import { optionalAuth } from '../middleware/optionalAuth.js'
import { deleteMediaFiles } from './posts.js'
const r = Router()
const TREEHOLE_NAME = '讨论区'
const hideInTreehole = (rows, isTreehole) =>
  isTreehole ? rows.map((x) => ({ ...x, author: '匿名', author_avatar: null })) : rows
const statsCols = (me) =>
  `(SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) like_count,(SELECT COUNT(*) FROM comments cm WHERE cm.post_id=p.id) comment_count,(SELECT COUNT(*) FROM likes l2 WHERE l2.post_id=p.id AND l2.user_id=${Number(me?.id) || 0}) liked`

r.get('/', async (req, res) => {
  try {
    const ownerId = req.query.ownerId ? Number(req.query.ownerId) : null
    const where = ownerId ? 'WHERE c.owner_id=?' : ''
    const params = ownerId ? [ownerId] : []
    const [x] = await pool.query(
      `SELECT c.*,u.name owner_name,COUNT(p.id) postCount FROM communities c LEFT JOIN users u ON u.id=c.owner_id LEFT JOIN posts p ON p.community_id=c.id ${where} GROUP BY c.id ORDER BY c.created_at DESC`,
      params
    )
    res.json(x)
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.get('/:id', async (req, res) => {
  try {
    const [x] = await pool.query(
      'SELECT c.*,u.name owner_name,COUNT(p.id) postCount FROM communities c LEFT JOIN users u ON u.id=c.owner_id LEFT JOIN posts p ON p.community_id=c.id WHERE c.id=? GROUP BY c.id',
      [req.params.id]
    )
    if (!x[0]) return res.status(404).json({ message: '社区不存在' })
    res.json(x[0])
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.get('/:id/posts', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const [[treehole]] = await pool.query('SELECT name FROM communities WHERE id=?', [req.params.id])
    const isTreehole = treehole?.name === TREEHOLE_NAME
    const [x] = await pool.query(
      `SELECT p.*,u.name author,u.avatar author_avatar,${statsCols(req.user)} FROM posts p JOIN users u ON u.id=p.user_id WHERE p.community_id=? ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [req.params.id, limit, offset]
    )
    res.json(hideInTreehole(x, isTreehole))
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body
    if (!name || !name.trim()) return res.status(400).json({ message: '社区名称不能为空' })
    if (name.trim().length > 80) return res.status(400).json({ message: '社区名称最长 80 个字符' })
    const [x] = await pool.query('INSERT INTO communities(name,description,owner_id) VALUES(?,?,?)', [
      name.trim(),
      (description || '').slice(0, 500),
      req.user.id,
    ])
    const [fresh] = await pool.query(
      'SELECT c.*,u.name owner_name,0 postCount FROM communities c LEFT JOIN users u ON u.id=c.owner_id WHERE c.id=?',
      [x.insertId]
    )
    res.json(fresh[0])
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.put('/:id', auth, async (req, res) => {
  try {
    const { name, description } = req.body
    const [rows] = await pool.query('SELECT * FROM communities WHERE id=?', [req.params.id])
    const community = rows[0]
    if (!community) return res.status(404).json({ message: '社区不存在' })
    const isAdmin = req.user?.role === 'admin'
    if (community.owner_id !== req.user.id && !isAdmin)
      return res.status(403).json({ message: '只能编辑自己创建的社区' })
    if (!name || !name.trim()) return res.status(400).json({ message: '社区名称不能为空' })
    if (name.trim().length > 80) return res.status(400).json({ message: '社区名称最长 80 个字符' })
    await pool.query('UPDATE communities SET name=?,description=? WHERE id=?', [
      name.trim(),
      (description || '').slice(0, 500),
      community.id,
    ])
    const [fresh] = await pool.query(
      'SELECT c.*,u.name owner_name,COUNT(p.id) postCount FROM communities c LEFT JOIN users u ON u.id=c.owner_id LEFT JOIN posts p ON p.community_id=c.id WHERE c.id=? GROUP BY c.id',
      [community.id]
    )
    res.json(fresh[0])
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.delete('/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM communities WHERE id=?', [req.params.id])
    const community = rows[0]
    if (!community) return res.status(404).json({ message: '社区不存在' })
    const isAdmin = req.user?.role === 'admin'
    if (community.owner_id !== req.user.id && !isAdmin)
      return res.status(403).json({ message: '只能删除自己创建的社区' })
    const [posts] = await pool.query('SELECT id,media FROM posts WHERE community_id=?', [community.id])
    for (const p of posts) {
      await pool.query('DELETE FROM posts WHERE id=?', [p.id])
      await deleteMediaFiles(p.media)
    }
    await pool.query('DELETE FROM communities WHERE id=?', [community.id])
    res.json({ ok: true, message: '社区已删除' })
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

export default r
