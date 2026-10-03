// 实时性能指标的纯计算：帧率换算、延迟统计、分级与格式化。
// 刻意与 DOM / 定时器分离，这样这些数学可以被单测直接验证。

export const FPS_CEILING = 240 // 高刷屏与采样抖动下的合理上限
export const FPS_FLOOR = 5 // 低于此值基本等于页面卡死，不再往下报
export const LATENCY_GOOD = 120 // ms 以内算顺滑
export const LATENCY_FAIR = 350 // ms 以内算可用

/** 帧数与耗时 → 整数帧率。耗时非法时返回 0，绝不产生 Infinity / NaN。 */
export function fpsFromFrames(frames, elapsedMs) {
  const f = Number(frames)
  const ms = Number(elapsedMs)
  if (!Number.isFinite(f) || !Number.isFinite(ms) || f <= 0 || ms <= 0) return 0
  const value = Math.round((f * 1000) / ms)
  if (!Number.isFinite(value)) return 0
  return Math.min(FPS_CEILING, Math.max(0, value))
}

/** 延迟分级：给 UI 上色用。没有样本时是 unknown。 */
export function latencyGrade(ms) {
  if (ms === null || ms === undefined || ms === '') return 'unknown' // Number(null) 是 0，这里必须先挡住
  const value = Number(ms)
  if (!Number.isFinite(value) || value < 0) return 'unknown'
  if (value < LATENCY_GOOD) return 'good'
  if (value < LATENCY_FAIR) return 'fair'
  return 'poor'
}

export function formatLatency(ms) {
  if (ms === null || ms === undefined || ms === '') return '—' // 同上：别把"没样本"渲染成 0 ms
  const value = Number(ms)
  if (!Number.isFinite(value) || value < 0) return '—'
  return `${Math.round(value)} ms`
}

export function formatFps(fps) {
  const value = Number(fps)
  if (!Number.isFinite(value) || value <= 0) return '—'
  return String(Math.round(value))
}

/** 取最近若干次延迟的均值；忽略非法样本。 */
export function averageLatency(samples) {
  if (!Array.isArray(samples)) return null
  const valid = samples.filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
  if (!valid.length) return null
  return Math.round(valid.reduce((sum, n) => sum + n, 0) / valid.length)
}

/**
 * 测量一次请求的往返耗时。注入 fetcher / now 是为了让测试能确定性地断言。
 * 失败返回 null——性能徽标不该因为一次网络抖动而报错。
 */
export async function measureLatency(fetcher, url, now = () => performance.now()) {
  const started = now()
  try {
    await fetcher(url, { cache: 'no-store', credentials: 'same-origin' })
    const elapsed = now() - started
    return Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : null
  } catch {
    return null
  }
}
