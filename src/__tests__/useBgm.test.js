// 背景音乐状态机：进入页面即尝试自动播放；被浏览器自动播放策略拦截时，
// 等第一次用户手势立刻续播；单曲用 audio.loop 连续循环，不靠 ended 手动重播。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const instances = []
let rejectPlays = false

class FakeAudio {
  constructor() {
    this.src = ''
    this.volume = 1
    this.loop = false
    this.preload = ''
    this.currentTime = 0
    this.duration = 0
    this.paused = true
    this.playCalls = 0
    this.listeners = {}
    instances.push(this)
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = []
    this.listeners[type].push(handler)
  }

  play() {
    this.playCalls += 1
    if (rejectPlays) return Promise.reject(new Error('NotAllowedError'))
    this.paused = false
    return Promise.resolve()
  }

  pause() {
    this.paused = true
  }

  emit(type) {
    for (const handler of this.listeners[type] || []) handler()
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function freshBgm({ playlist = null, rejectPlay = false, keepStorage = false } = {}) {
  vi.resetModules()
  instances.length = 0
  rejectPlays = rejectPlay
  if (!keepStorage) localStorage.clear()

  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: playlist !== null,
      json: async () => playlist,
    })
  )

  const { useBgm } = await import('../composables/useBgm.js')
  const bgm = useBgm()

  return { bgm }
}

beforeEach(() => {
  rejectPlays = false
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useBgm 自动播放', () => {
  it('进入页面加载完曲目即尝试播放，首次访问也不需要先点一下', async () => {
    const { bgm } = await freshBgm()

    await bgm.load()
    await flush()

    expect(instances).toHaveLength(1)
    expect(instances[0].playCalls).toBe(1)
    expect(bgm.playing.value).toBe(true)
  })

  it('被浏览器拦截时不报错，等首次用户手势立刻续播', async () => {
    const { bgm } = await freshBgm({ rejectPlay: true })

    await bgm.load()
    await flush()

    const audio = instances[0]
    const attempts = audio.playCalls

    expect(bgm.playing.value).toBe(false)
    expect(bgm.error.value).toBe('')

    rejectPlays = false
    window.dispatchEvent(new Event('pointerdown'))
    await flush()

    expect(audio.playCalls).toBeGreaterThan(attempts)
    expect(bgm.playing.value).toBe(true)
  })

  it('用户手动暂停后记住偏好，下次进入不再自动播放', async () => {
    const first = await freshBgm()
    await first.bgm.load()
    await flush()
    expect(first.bgm.playing.value).toBe(true)

    first.bgm.pause()
    expect(localStorage.getItem('heibox.bgm.v1')).toBe('off')

    const second = await freshBgm({ keepStorage: true })
    await second.bgm.load()
    await flush()

    expect(instances).toHaveLength(0)
    expect(second.bgm.playing.value).toBe(false)
  })
})

describe('useBgm 曲目与循环', () => {
  it('单曲时交给 audio.loop 无缝循环，ended 不再手动重播', async () => {
    const { bgm } = await freshBgm()

    await bgm.load()
    await flush()

    const audio = instances[0]
    const attempts = audio.playCalls

    expect(audio.loop).toBe(true)

    audio.emit('ended')
    await flush()

    expect(audio.playCalls).toBe(attempts)
  })

  it('多曲时关闭 loop，一首放完切下一首', async () => {
    const { bgm } = await freshBgm({
      playlist: {
        tracks: [
          { title: 'A', src: '/audio/a.mp3' },
          { title: 'B', src: '/audio/b.mp3' },
        ],
      },
    })

    await bgm.load()
    await flush()

    const audio = instances[0]

    expect(audio.loop).toBe(false)
    expect(bgm.index.value).toBe(0)

    audio.emit('ended')
    await flush()

    expect(bgm.index.value).toBe(1)
  })
})

describe('useBgm 进度与释放', () => {
  it('读取时长与当前位置，并支持拖动定位', async () => {
    const { bgm } = await freshBgm()

    await bgm.load()
    await flush()

    const audio = instances[0]
    audio.duration = 200
    audio.emit('loadedmetadata')
    audio.currentTime = 50
    audio.emit('timeupdate')

    expect(bgm.duration.value).toBe(200)
    expect(bgm.currentTime.value).toBe(50)
    expect(bgm.progress.value).toBeCloseTo(0.25, 3)

    bgm.seek(0.5)
    expect(audio.currentTime).toBe(100)
  })

  it('重载/热更新前释放旧音轨，避免两路音乐同时响', async () => {
    const { bgm } = await freshBgm()

    await bgm.load()
    await flush()

    const audio = instances[0]

    bgm.releaseAudio()

    expect(audio.paused).toBe(true)
    expect(bgm.playing.value).toBe(false)
  })
})

describe('useBgm 循环接缝淡化', () => {
  it('临近结尾把音量淡出，回到开头再淡入，避免每次都硬切回开头', async () => {
    const { bgm } = await freshBgm()

    await bgm.load()
    await flush()

    const audio = instances[0]
    audio.duration = 27
    audio.emit('loadedmetadata')

    audio.currentTime = 13
    audio.emit('timeupdate')
    const steady = audio.volume

    audio.currentTime = 26.6
    audio.emit('timeupdate')

    expect(steady).toBeGreaterThan(0)
    expect(audio.volume, '循环接缝处应该已经淡下去了').toBeLessThan(steady)
  })
})
