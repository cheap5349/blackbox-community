// 轻量安全中间件：安全响应头 + 内存限流（单实例适用；多实例/生产建议升级为 helmet + Redis 限流）
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://ipwho.is https://ipapi.co https://api.open-meteo.com",
  "frame-ancestors 'none'",
].join('; ')

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', CSP)
  next()
}

// 内存限流：按 IP 计数，窗口内超过 max 次返回 429
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 100, message = '请求过于频繁，请稍后再试' } = {}) {
  const hits = new Map()
  // 测试专用逃生口：测试要连续注册几十个账号，必然超过面向真实用户的
  // 登录/注册阈值（10 次/15 分钟）。与其在测试里放宽生产阈值，不如给一个
  // 显式的开关——生产配置里不会设置这个变量，限流行为完全不变。
  if (process.env.RATE_LIMIT_DISABLED === '1') return (_req, _res, next) => next()
  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown'
    const now = Date.now()
    const rec = hits.get(key)
    if (!rec || now - rec.start > windowMs) {
      hits.set(key, { start: now, count: 1 })
      // 顺带清理过期条目，防止内存无限增长
      if (hits.size > 2000) {
        for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k)
      }
      return next()
    }
    rec.count++
    if (rec.count > max) return res.status(429).json({ message })
    next()
  }
}
