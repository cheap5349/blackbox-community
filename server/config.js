// 集中配置：JWT 密钥 / CORS 白名单 / 环境判断
// 弱默认密钥仅允许在开发环境使用；生产环境缺失或弱密钥一律拒绝启动，防止 token 被伪造。
import 'dotenv/config'

const DEV_DEFAULTS = new Set(['dev-secret', 'change-this-secret'])
const isProd = process.env.NODE_ENV === 'production'
let jwtSecret = process.env.JWT_SECRET || ''

if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET 未配置：生产环境禁止启动，请在 .env 中设置强随机密钥')
  jwtSecret = 'dev-secret'
  console.warn('[config] JWT_SECRET 未配置，开发环境临时使用内置 dev-secret。生产环境必须设置强随机密钥。')
} else if (DEV_DEFAULTS.has(jwtSecret)) {
  if (isProd) throw new Error('生产环境禁止使用默认 JWT_SECRET，请在 .env 中设置强随机密钥')
  console.warn('[config] 检测到默认 JWT_SECRET，生产环境请改为强随机密钥（例如：openssl rand -hex 32）')
}

// CORS 白名单：默认放行本地开发端口，其余来源一律拒绝
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const config = {
  jwtSecret,
  isProd,
  corsOrigins,
}
