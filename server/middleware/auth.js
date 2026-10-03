import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { pool } from '../db.js'

const tokenOf = (h = '') => (h.startsWith('Bearer ') ? h.slice(7) : h)

export function auth(req, res, next) {
  const t = tokenOf(req.headers.authorization)
  if (!t) return res.status(401).json({ message: '请先登录' })
  try {
    req.user = jwt.verify(t, config.jwtSecret)
    next()
  } catch (e) {
    // 过期 token 与伪造/无效 token 分开提示，前端据此触发重新登录
    res.status(401).json({ message: e?.name === 'TokenExpiredError' ? '登录已过期，请重新登录' : '请先登录' })
  }
}

/**
 * 账号状态闸门：封禁 / 禁言。
 *
 * 为什么不能只信 token：JWT 是无状态的，签发后到过期前都无法撤销。
 * 如果不额外查库，被封禁的用户只要留着旧 token 就能继续用满 7 天。
 * 所以这里在**每次需要写权限的请求**上回查一次 users 表：
 *   - status='banned'         → 403，拒绝一切操作
 *   - muted_until > NOW()     → 挂上 req.muted，由各路由决定是否拦截
 * 为了不让每个读接口都多一次查询，只挂在需要鉴权的路由上。
 */
export async function userState(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT id, name, role, status, muted_until FROM users WHERE id=? LIMIT 1', [
      req.user.id,
    ])
    const row = rows[0]
    // token 合法但用户已被删除：当作登录失效处理
    if (!row) return res.status(401).json({ message: '账号不存在，请重新登录' })
    if (row.status === 'banned') {
      return res.status(403).json({ message: '账号已被封禁，如有疑问请联系管理员', code: 'ACCOUNT_BANNED' })
    }
    // 角色以数据库为准：管理员被降权后旧 token 不应继续拥有后台权限
    req.user.role = row.role
    req.user.name = row.name
    const mutedUntil = row.muted_until ? new Date(row.muted_until) : null
    req.muted = Boolean(mutedUntil && mutedUntil.getTime() > Date.now())
    req.mutedUntil = req.muted ? mutedUntil : null
    next()
  } catch {
    res.status(503).json({ message: '数据库未连接，请检查 .env 和 MySQL' })
  }
}

/**
 * 禁言拦截：挂在「发帖 / 评论 / 编辑」这类写接口上。
 * 单独抽出来是为了让读接口不受影响——被禁言仍然可以浏览。
 */
export function requireNotMuted(req, res, next) {
  if (req.muted) {
    const until = req.mutedUntil ? req.mutedUntil.toLocaleString('zh-CN') : ''
    return res.status(403).json({
      message: until ? `你已被禁言，解禁时间：${until}` : '你已被禁言',
      code: 'ACCOUNT_MUTED',
      mutedUntil: req.mutedUntil ? req.mutedUntil.toISOString() : null,
    })
  }
  next()
}
