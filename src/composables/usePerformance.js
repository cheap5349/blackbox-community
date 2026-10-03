// 实时性能采样：帧率（rAF 计数）与接口往返延迟（定时 ping /api/health）。
// 单例：页面上可能同时有多个入口读同一份采样，计数器保证只跑一套定时器。
import { ref } from 'vue'
import { averageLatency, fpsFromFrames, latencyGrade, measureLatency } from '../performance.js'

export const LATENCY_PING_URL = '/api/health'
const FPS_TICK_MS = 1000
const LATENCY_INTERVAL_MS = 5000
const LATENCY_SAMPLES = 8

const fps = ref(0)
const latency = ref(null)
const samples = ref([])
const quality = ref('unknown')
const supported = ref(true)

let rafId = null
let fpsTimer = null
let latencyTimer = null
let frames = 0
let windowStart = 0
let consumers = 0

async function pingLatency() {
  const ms = await measureLatency(fetch, LATENCY_PING_URL)
  if (ms === null) return
  latency.value = ms
  const next = [...samples.value, ms].slice(-LATENCY_SAMPLES)
  samples.value = next
  // 用近期均值分级：单次抖动不该把指示灯从"顺滑"打成"拥堵"
  quality.value = latencyGrade(averageLatency(next) ?? ms)
}

function start() {
  consumers += 1
  if (consumers > 1 || rafId !== null) return
  if (typeof requestAnimationFrame !== 'function' || typeof performance === 'undefined') {
    supported.value = false
    quality.value = 'unknown'
    return
  }
  windowStart = performance.now()
  frames = 0
  const loop = () => {
    frames += 1
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
  fpsTimer = window.setInterval(() => {
    const now = performance.now()
    fps.value = fpsFromFrames(frames, now - windowStart)
    windowStart = now
    frames = 0
  }, FPS_TICK_MS)
  void pingLatency()
  latencyTimer = window.setInterval(() => {
    // 页面在后台时不测延迟：请求本身没有意义，还会污染样本
    if (!document.hidden) void pingLatency()
  }, LATENCY_INTERVAL_MS)
}

function stop() {
  consumers = Math.max(0, consumers - 1)
  if (consumers > 0 || rafId === null) return
  cancelAnimationFrame(rafId)
  window.clearInterval(fpsTimer)
  window.clearInterval(latencyTimer)
  rafId = null
  fpsTimer = null
  latencyTimer = null
  frames = 0
}

export function usePerformance() {
  return { fps, latency, samples, quality, supported, start, stop }
}
