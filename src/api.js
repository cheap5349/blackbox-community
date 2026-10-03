// 请求封装：统一处理认证头、错误、401 会话失效（与 store 解耦，通过回调通知）
import { DEMO_MODE, demoApi } from './demo.js'

let invalidator = null
export const setUnauthorizedHandler = (fn) => {
  invalidator = fn
}

export async function api(url, options = {}) {
  // 静态演示版（GitHub Pages 等无后端环境）：走内置示例数据，读得到、写不了
  if (DEMO_MODE) return demoApi(url, options)
  const headers = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  if (localStorage.token) headers.Authorization = `Bearer ${localStorage.token}`
  const res = await fetch(`/api${url}`, { ...options, headers })
  const data = await res.json().catch(() => ({ message: '服务器返回异常' }))
  if (!res.ok) {
    // 401 且非登录/注册表单：token 过期或无效，清理本地会话（提示由调用方按 err.status 处理）
    const isAuthForm = url.startsWith('/auth/login') || url.startsWith('/auth/register')
    if (res.status === 401 && !isAuthForm && localStorage.token) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('expiresAt')
      invalidator?.()
    }
    const err = new Error(data.message || '请求失败')
    err.status = res.status
    // 透传服务端的结构化字段：页面据此区分「被封禁」「被禁言」等状态，
    // 而不是靠匹配提示文案。
    err.code = data.code
    err.mutedUntil = data.mutedUntil
    err.blocked = data.blocked
    throw err
  }
  return data
}
