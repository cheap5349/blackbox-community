// Express 应用构建：只组装中间件/路由/静态托管，不 listen、不 seed（供 index.js 与测试复用）
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import auth from './routes/auth.js'
import communities from './routes/communities.js'
import posts from './routes/posts.js'
import admin from './routes/admin.js'
import notifications from './routes/notifications.js'
import { config } from './config.js'
import { securityHeaders, rateLimit } from './security.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const app = express()
export const VIDEOS_DIR = process.env.VIDEOS_DIR || path.join(__dirname, '..', 'public', 'videos')

app.use(cors({ origin: config.corsOrigins, credentials: true }))
app.use(securityHeaders)
app.use(express.json({ limit: '6mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use('/videos', express.static(VIDEOS_DIR))

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, message: '请求过于频繁，请稍后再试' }))
app.use('/api/auth', auth)
app.use('/api/communities', communities)
app.use('/api/posts', posts)
app.use('/api/admin', admin)
app.use('/api/notifications', notifications)

app.use((err, _req, res, _next) => {
  console.error(err)
  if (err.type === 'entity.too.large') return res.status(413).json({ message: '上传内容过大，请压缩图片或分次保存' })
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: '单个文件不能超过 50 MB' })
  res
    .status(err.status || 500)
    .json({ message: err.status ? err.message : '服务器暂时不可用，请检查 MySQL 与 .env 配置' })
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

/* 列出个人卡片背景视频文件夹里的媒体文件，前端随机选一个播放 */
app.get('/api/videos', (_req, res) => {
  try {
    if (!fs.existsSync(VIDEOS_DIR)) return res.json({ videos: [] })
    const exts = ['.mp4', '.webm', '.ogg', '.mov', '.jpg', '.jpeg', '.png', '.gif']
    const videos = fs
      .readdirSync(VIDEOS_DIR)
      .filter((f) => exts.includes(path.extname(f).toLowerCase()))
      .map((f) => '/videos/' + f)
    res.json({ videos })
  } catch (e) {
    res.status(500).json({ message: '读取视频文件夹失败' })
  }
})

/* 生产环境：托管前端构建产物 dist，并为 SPA 提供 fallback（仅非 /api 的 GET 请求） */
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (
      req.method === 'GET' &&
      !req.path.startsWith('/api') &&
      !req.path.startsWith('/uploads') &&
      !req.path.startsWith('/videos')
    ) {
      return res.sendFile(path.join(distDir, 'index.html'))
    }
    next()
  })
}
