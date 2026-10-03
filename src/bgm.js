// 背景音乐：曲目清单解析与播放偏好。
// 音乐文件由使用者自行放进 public/audio/，所以解析必须对残缺输入足够宽容——
// 清单缺失、字段写错、目录为空，都应该安静降级成"没有曲目"。
export const BGM_STORAGE_KEY = 'heibox.bgm.v1'
export const BGM_VOLUME_KEY = 'heibox.bgm.volume'
export const BGM_DEFAULT_VOLUME = 0.5

// 曲目来源：使用者自己往 public/audio/ 里放文件。
// 路径带上 Vite 的 BASE_URL，子路径部署（GitHub Pages 的 /<repo>/）才不会 404。
const BASE = import.meta.env?.BASE_URL || '/'
export const PLAYLIST_URL = `${BASE}audio/playlist.json`
export const AUDIO_DIR_HINT = 'public/audio'
export const FALLBACK_TRACK = { title: '黑盒电台', src: `${BASE}audio/bgm.mp3` }

/** 音量夹在 0 ~ 1；非法输入回落到默认音量。 */
export function clampVolume(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return BGM_DEFAULT_VOLUME
  return Math.min(1, Math.max(0, n))
}

/** 曲目名兜底：没有标题时按序号生成，避免面板出现空白行。 */
export function trackLabel(track, index = 0) {
  const title = track && typeof track.title === 'string' ? track.title.trim() : ''
  return title || `曲目 ${index + 1}`
}

/**
 * 规范化曲目清单。接受三种写法：
 *   { tracks: [{ title, src }] } / [{ title, src }] / ['/audio/a.mp3']
 * 任何解析不出的条目都会被丢掉，绝不把坏数据带进播放器。
 */
export function normalizeTracks(payload) {
  const raw = Array.isArray(payload) ? payload : Array.isArray(payload && payload.tracks) ? payload.tracks : []
  const tracks = []
  for (const item of raw) {
    const src = typeof item === 'string' ? item : item && typeof item.src === 'string' ? item.src : ''
    if (!src.trim()) continue
    const title = item && typeof item === 'object' && typeof item.title === 'string' ? item.title.trim() : ''
    tracks.push({ title: title || `曲目 ${tracks.length + 1}`, src: src.trim() })
  }
  return tracks
}

/**
 * 进入页面就自动播放：只有用户**显式暂停过**（记录为 off）才不自动播。
 * 读不到偏好（首次访问、隐私模式）一律按"要播"处理——默认开着比默认静音更符合预期。
 * 注意浏览器仍会拦截"没有用户手势"的播放，那一层由 useBgm 的手势续播兜底。
 */
export function shouldAutoPlay(storage) {
  try {
    return storage?.getItem?.(BGM_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

/** 秒 → m:ss。时长未知时给 0:00，绝不让 NaN 出现在进度条上。 */
export function formatTime(seconds) {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total <= 0) return '0:00'
  const whole = Math.floor(total)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/* 循环接缝淡化：短音频循环时两端各留一段淡出/淡入，避免每次回到开头都"啪"一下。
   使用者往往只放一段几十秒的循环素材，硬切回开头最容易被听成"音乐又重放了一遍"。 */
export const LOOP_FADE_SECONDS = 1.8

/**
 * 循环接缝的增益包络（0~1）：开头一段淡入 → 中间满音量 → 结尾一段淡出。
 * 时长未知（duration 还没解析出来）或片段短到装不下两段淡化时一律返回 1，
 * 免得整首曲子都在淡入淡出。
 */
export function loopGain(currentTime, duration, fade = LOOP_FADE_SECONDS) {
  if (!Number.isFinite(duration) || duration <= 0) return 1
  if (!Number.isFinite(fade) || fade <= 0 || duration <= fade * 2) return 1

  const at = Number.isFinite(currentTime) ? Math.min(Math.max(currentTime, 0), duration) : 0
  if (at < fade) return at / fade
  if (duration - at < fade) return (duration - at) / fade
  return 1
}

/** 读回上次的音量，异常一律回落到默认值。 */ export function readVolume(storage) {
  try {
    const raw = storage?.getItem?.(BGM_VOLUME_KEY)
    if (raw === null || raw === undefined || raw === '') return BGM_DEFAULT_VOLUME
    return clampVolume(Number(raw))
  } catch {
    return BGM_DEFAULT_VOLUME
  }
}

export function writeVolume(storage, volume) {
  try {
    storage?.setItem?.(BGM_VOLUME_KEY, String(clampVolume(volume)))
  } catch {
    /* 隐私模式 / 存储被禁用时静默忽略 */
  }
}
