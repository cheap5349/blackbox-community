import jwt from 'jsonwebtoken'
import { config } from '../config.js'
// 可选登录：有合法 token 就挂上 req.user，没有/失效也放行（用于读接口返回"我是否已点赞"）
export function optionalAuth(req, res, next) {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), config.jwtSecret)
  } catch {
    /* 未登录 */
  }
  next()
}
