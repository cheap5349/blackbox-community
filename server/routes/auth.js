import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { pool } from '../db.js'
import { auth } from '../middleware/auth.js'
import { rateLimit } from '../security.js'
import { sniffFile } from '../media-utils.js'
import { config } from '../config.js'
import { uploadFile, deleteFile, isS3 } from '../storage.js'

const r = Router()
const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const token = (user) =>
  jwt.sign({ id: user.id, name: user.name, role: user.role || 'user' }, config.jwtSecret, { expiresIn: '7d' })
const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatar: user.avatar || '',
  bio: user.bio || '',
  role: user.role || 'user',
  created_at: user.created_at,
})
/* 7 天有效期：签发 token 并附到期时间（epoch 秒），前端据此处理过期登录态 */
const session = (user) => {
  const t = token(user)
  const decoded = jwt.decode(t)
  return { token: t, user, expires_at: decoded?.exp || Math.floor(Date.now() / 1000) + 7 * 24 * 3600 }
}

/* 登录 / 注册限流：同一 IP 15 分钟内最多 10 次，防止暴力撞库 */
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: '操作过于频繁，请 15 分钟后再试' })

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 12)
      cb(null, crypto.randomBytes(16).toString('hex') + ext)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true)
    const e = new Error('仅支持图片文件')
    e.status = 400
    cb(e, false)
  },
})
/* 包装 multer：把文件过大/格式错误转成准确的 JSON 响应 */
const uploadAvatar = (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: '头像图片请控制在 5 MB 以内' })
      return res.status(err.status || 400).json({ message: err.message || '头像上传失败' })
    }
    next()
  })
}

r.post('/register', authLimit, async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ message: '请填写完整信息' })
    if (String(password).length < 6) return res.status(400).json({ message: '密码至少需要 6 位' })
    const hash = await bcrypt.hash(password, 10)
    const [result] = await pool.query('INSERT INTO users(name,email,password) VALUES(?,?,?)', [
      name.trim(),
      email.trim().toLowerCase(),
      hash,
    ])
    const user = {
      id: result.insertId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      avatar: '',
      bio: '',
      role: 'user',
      created_at: new Date().toISOString(),
    }
    res.json(session(user))
  } catch (error) {
    res.status(400).json({ message: error.code === 'ER_DUP_ENTRY' ? '邮箱已注册' : '注册失败' })
  }
})

r.post('/login', authLimit, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email=?', [req.body.email])
    const user = rows[0]
    if (!user || !(await bcrypt.compare(req.body.password, user.password)))
      return res.status(401).json({ message: '邮箱或密码错误' })
    // 被封禁的账号即使密码正确也不放行，否则封禁只对已登录会话有效
    if (user.status === 'banned')
      return res.status(403).json({ message: '账号已被封禁，如有疑问请联系管理员', code: 'ACCOUNT_BANNED' })
    res.json(session(publicUser(user)))
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

/* 头像上传：压缩后的小图以文件形式落库（S3 或本地），避免 base64 撑爆数据库 */
r.post('/avatar', auth, uploadAvatar, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '请选择图片文件' })
    if (!sniffFile(path.join(uploadsDir, req.file.filename))) {
      try {
        fs.unlinkSync(path.join(uploadsDir, req.file.filename))
      } catch {
        /* 忽略清理失败 */
      }
      return res.status(400).json({ message: '文件内容校验失败，仅支持图片文件' })
    }
    const buffer = fs.readFileSync(path.join(uploadsDir, req.file.filename))
    const { url } = await uploadFile({ key: req.file.filename, buffer, contentType: req.file.mimetype })
    if (isS3()) {
      try {
        fs.unlinkSync(path.join(uploadsDir, req.file.filename))
      } catch {
        /* 忽略清理失败 */
      }
    }
    res.json({ avatar: url })
  } catch (error) {
    res.status(503).json({ message: '上传失败，请稍后重试' })
  }
})

r.get('/me', auth, async (req, res) => {
  try {
    // 回查数据库而不是直接回 token 里的内容：角色变更、封禁、禁言
    // 都要能立刻反映到前端，不能被 7 天有效的 token 缓存住。
    const [rows] = await pool.query(
      'SELECT id,name,email,avatar,bio,role,status,muted_until,created_at,(muted_until IS NOT NULL AND muted_until > NOW()) AS muted FROM users WHERE id=?',
      [req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ message: '用户不存在' })
    if (rows[0].status === 'banned')
      return res.status(403).json({ message: '账号已被封禁，如有疑问请联系管理员', code: 'ACCOUNT_BANNED' })
    res.json(rows[0])
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
})

r.put('/me', auth, async (req, res) => {
  try {
    const { name, avatar, bio, currentPassword, newPassword } = req.body
    const [rows] = await pool.query('SELECT * FROM users WHERE id=?', [req.user.id])
    const user = rows[0]
    if (!user) return res.status(404).json({ message: '用户不存在' })
    if (newPassword) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password)))
        return res.status(400).json({ message: '当前密码不正确' })
      if (newPassword.length < 6) return res.status(400).json({ message: '新密码至少需要 6 位' })
      user.password = await bcrypt.hash(newPassword, 10)
    }
    if (name?.trim()) user.name = name.trim().slice(0, 40)
    if (typeof avatar === 'string') {
      if (avatar && !/^(data:image\/|\/uploads\/)/.test(avatar))
        return res.status(400).json({ message: '头像格式不正确' })
      // 旧头像若为文件（本地 /uploads/ 或对象存储 URL）且被替换，清理孤儿文件
      if (
        user.avatar &&
        avatar !== user.avatar &&
        (user.avatar.startsWith('/uploads/') || /^https?:\/\//.test(user.avatar))
      ) {
        await deleteFile(user.avatar)
      }
      user.avatar = avatar.slice(0, 2_000_000)
    }
    if (typeof bio === 'string') user.bio = bio.slice(0, 200)
    await pool.query('UPDATE users SET name=?,avatar=?,bio=?,password=? WHERE id=?', [
      user.name,
      user.avatar || null,
      user.bio || null,
      user.password,
      user.id,
    ])
    res.json(session(publicUser(user)))
  } catch (error) {
    console.error('资料更新失败:', error?.message || error)
    const dbDown = /ECONNREFUSED|ETIMEDOUT|PROTOCOL_CONNECTION_LOST|ENOTFOUND/.test(String(error?.message || ''))
    res.status(503).json({ message: dbDown ? '数据库未连接，请检查 .env 和 MySQL' : '资料保存失败，请稍后重试' })
  }
})

export default r
