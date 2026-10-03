// 背景音乐播放器状态：全站共用一支 <audio>，单例。
// 音乐文件由使用者自行放进 public/audio/：优先读 playlist.json，
// 没有清单就退回到约定的 bgm.mp3。任何一步失败都安静降级，绝不影响页面其余部分。
//
// 自动播放的两层策略：
//   1) 页面数据加载完立刻尝试播放（用户上次显式暂停过就跳过）；
//   2) 浏览器若以"没有用户手势"为由拒绝，就静默等着——用户第一次点击/按键/触摸时立刻续播。
// 单曲用 audio.loop 连续循环，多曲才在 ended 时切下一首，避免整首歌被打断重来；
// 循环接缝两端再做一次柔和的淡出/淡入（loopGain），让短音频反复回到开头时不那么突兀。
import { computed, ref } from 'vue'
import {
  AUDIO_DIR_HINT,
  BGM_DEFAULT_VOLUME,
  BGM_STORAGE_KEY,
  clampVolume,
  FALLBACK_TRACK,
  loopGain,
  normalizeTracks,
  PLAYLIST_URL,
  readVolume,
  shouldAutoPlay,
  writeVolume,
} from '../bgm.js'

// 常量定义在 src/bgm.js（纯数据），这里 re-export 方便组件只 import 一个模块
export { AUDIO_DIR_HINT, FALLBACK_TRACK, PLAYLIST_URL }

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart']

const tracks = ref([])
const index = ref(0)
const playing = ref(false)
const volume = ref(BGM_DEFAULT_VOLUME)
const ready = ref(false)
const error = ref('')
const currentTime = ref(0)
const duration = ref(0)

const current = computed(() => tracks.value[index.value] || null)
const hasTracks = computed(() => tracks.value.length > 0)
const progress = computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0))

let audio = null
let loadedOnce = false
let gestureHandler = null

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function rememberPlaying(on) {
  try {
    storage()?.setItem(BGM_STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    /* 隐私模式：静默忽略 */
  }
}

/** 只有一首曲子时由 audio.loop 负责循环，多曲才需要手动切歌。 */
function singleTrack() {
  return tracks.value.length < 2
}

/**
 * 把主音量乘上循环接缝包络后写到 <audio> 上。
 * timeupdate 只有约 4Hz，接缝处会听出阶梯，所以播放时另有一条 rAF 补帧（startGainLoop）。
 */
function applyLoopGain() {
  if (!audio) return
  const target = clampVolume(volume.value) * loopGain(audio.currentTime, audio.duration)
  if (audio.volume !== target) audio.volume = target
}

let gainRaf = 0

function startGainLoop() {
  if (gainRaf || typeof requestAnimationFrame !== 'function') return
  const tick = () => {
    gainRaf = 0
    if (!audio || audio.paused) return
    applyLoopGain()
    gainRaf = requestAnimationFrame(tick)
  }
  gainRaf = requestAnimationFrame(tick)
}

function stopGainLoop() {
  if (!gainRaf) return
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(gainRaf)
  gainRaf = 0
}

function ensureAudio() {
  if (audio) return audio
  if (typeof Audio !== 'function') return null
  audio = new Audio()
  audio.preload = 'auto'
  audio.loop = singleTrack()
  applyLoopGain()
  audio.addEventListener('ended', () => {
    // 单曲的循环交给 audio.loop：无缝、不丢播放位置，也不会因为重新 play() 而被打断
    if (!singleTrack()) next()
  })
  audio.addEventListener('error', () => {
    playing.value = false
    stopGainLoop()
    if (audio) audio.volume = clampVolume(volume.value)
    error.value = '音频加载失败：确认文件已放进 public/audio/，且格式浏览器可解码'
  })
  audio.addEventListener('loadedmetadata', () => {
    duration.value = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
    applyLoopGain()
  })
  audio.addEventListener('timeupdate', () => {
    currentTime.value = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
    applyLoopGain()
  })
  return audio
}

function syncSrc() {
  const a = ensureAudio()
  if (!a || !current.value) return null
  const base = typeof location === 'undefined' ? 'http://localhost/' : location.href
  const wanted = new URL(current.value.src, base).href
  if (a.src !== wanted) {
    a.src = wanted
    currentTime.value = 0
    duration.value = 0
  }
  a.loop = singleTrack()
  return a
}

/** 把首次用户手势当作"允许播放"的授权：浏览器只接受手势之后的播放请求。 */
function armGesture() {
  if (gestureHandler || typeof window === 'undefined') return
  gestureHandler = () => {
    disarmGesture()
    if (!playing.value && current.value && shouldAutoPlay(storage())) void play()
  }
  for (const type of GESTURE_EVENTS) {
    window.addEventListener(type, gestureHandler, { once: true, passive: true })
  }
}

function disarmGesture() {
  if (!gestureHandler) return
  for (const type of GESTURE_EVENTS) {
    window.removeEventListener(type, gestureHandler)
  }
  gestureHandler = null
}

async function play() {
  if (!current.value) return
  const a = syncSrc()
  if (!a) return
  try {
    await a.play()
    playing.value = true
    error.value = ''
    rememberPlaying(true)
    disarmGesture()
    applyLoopGain()
    startGainLoop()
  } catch {
    // 浏览器会拦截"没有用户交互"的播放：降级成等第一次手势，不当成错误
    playing.value = false
    armGesture()
  }
}

function pause() {
  disarmGesture()
  stopGainLoop()
  audio?.pause()
  if (audio) audio.volume = clampVolume(volume.value)
  playing.value = false
  rememberPlaying(false)
}

async function toggle() {
  if (!hasTracks.value) return
  if (playing.value) pause()
  else await play()
}

function step(delta) {
  if (tracks.value.length < 2) return
  index.value = (index.value + delta + tracks.value.length) % tracks.value.length
  syncSrc()
  if (playing.value) void play()
}

const next = () => step(1)
const prev = () => step(-1)

function setVolume(value) {
  volume.value = clampVolume(value)
  applyLoopGain()
  writeVolume(storage(), volume.value)
}

/** 进度条定位：ratio 为 0~1，非法值忽略。 */
function seek(ratio) {
  if (!audio || !duration.value) return
  const n = Number(ratio)
  if (!Number.isFinite(n)) return
  const target = Math.min(1, Math.max(0, n)) * duration.value
  audio.currentTime = target
  currentTime.value = target
  applyLoopGain()
}

/** 释放当前音轨：页面热更新/卸载前调用，避免新旧两路音乐同时响。 */
function releaseAudio() {
  disarmGesture()
  stopGainLoop()
  if (audio) audio.pause()
  audio = null
  loadedOnce = false
  playing.value = false
  currentTime.value = 0
  duration.value = 0
}

/** 只加载一次：清单 → 失败/为空则单曲兜底 → 默认自动播放（用户暂停过则跳过）。 */
async function load() {
  if (loadedOnce) return
  loadedOnce = true
  volume.value = readVolume(storage())

  let list = []
  try {
    if (typeof fetch === 'function') {
      const res = await fetch(PLAYLIST_URL, { cache: 'no-store' })
      if (res?.ok) list = normalizeTracks(await res.json())
    }
  } catch {
    /* 没有清单文件就走单曲兜底 */
  }

  tracks.value = list.length ? list : [FALLBACK_TRACK]
  index.value = 0
  ready.value = true

  // 进入页面即尝试播放：被浏览器拦截时 play() 内部会挂上"首次手势续播"的兜底
  if (shouldAutoPlay(storage())) void play()
}

export function useBgm() {
  return {
    tracks,
    current,
    index,
    playing,
    volume,
    ready,
    error,
    currentTime,
    duration,
    progress,
    hasTracks,
    load,
    toggle,
    play,
    pause,
    next,
    prev,
    seek,
    setVolume,
    releaseAudio,
  }
}

// 开发期热更新：先停掉旧音轨，否则旧 <audio> 会继续响，而新模块又从头播一遍
if (import.meta.hot) {
  import.meta.hot.dispose(() => releaseAudio())
}
