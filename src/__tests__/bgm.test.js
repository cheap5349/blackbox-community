// 背景音乐：曲目清单解析、音量夹取与偏好读写。
// 音乐文件由使用者自行放入 public/audio/，因此解析必须对残缺输入足够宽容。
import { describe, expect, it } from 'vitest'
import {
  BGM_STORAGE_KEY,
  BGM_VOLUME_KEY,
  clampVolume,
  formatTime,
  LOOP_FADE_SECONDS,
  loopGain,
  normalizeTracks,
  shouldAutoPlay,
  trackLabel,
} from '../bgm.js'

const makeStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    dump: () => Object.fromEntries(values),
  }
}

describe('normalizeTracks', () => {
  it('接受 { tracks: [...] } 结构', () => {
    const tracks = normalizeTracks({ tracks: [{ title: '夜航', src: '/audio/a.mp3' }] })
    expect(tracks).toEqual([{ title: '夜航', src: '/audio/a.mp3' }])
  })

  it('接受裸数组，并把字符串当成地址', () => {
    expect(normalizeTracks(['/audio/a.mp3'])).toEqual([{ title: '曲目 1', src: '/audio/a.mp3' }])
  })

  it('过滤掉没有地址的条目', () => {
    const tracks = normalizeTracks({ tracks: [{ title: '空' }, null, { src: '/audio/ok.mp3' }, 42] })
    expect(tracks).toHaveLength(1)
    expect(tracks[0].src).toBe('/audio/ok.mp3')
  })

  it('缺标题时按序号补一个可读名称', () => {
    expect(normalizeTracks([{ src: '/a.mp3' }, { src: '/b.mp3' }]).map((t) => t.title)).toEqual(['曲目 1', '曲目 2'])
  })

  it('输入不是清单时返回空数组，绝不抛错', () => {
    expect(normalizeTracks(null)).toEqual([])
    expect(normalizeTracks('nope')).toEqual([])
    expect(normalizeTracks(undefined)).toEqual([])
  })
})

describe('clampVolume', () => {
  it('夹在 0 ~ 1 之间', () => {
    expect(clampVolume(0.5)).toBe(0.5)
    expect(clampVolume(-1)).toBe(0)
    expect(clampVolume(2)).toBe(1)
    expect(clampVolume('0.25')).toBe(0.25)
  })

  it('非法值回落到默认音量', () => {
    expect(clampVolume(NaN)).toBe(0.5)
    expect(clampVolume(undefined)).toBe(0.5)
  })
})

describe('偏好读写', () => {
  it('默认自动播放：只有用户显式暂停过（off）才不自动播', () => {
    expect(shouldAutoPlay(makeStorage()), '首次访问没有记录时应该自动播放').toBe(true)
    expect(shouldAutoPlay(makeStorage({ [BGM_STORAGE_KEY]: 'on' }))).toBe(true)
    expect(shouldAutoPlay(makeStorage({ [BGM_STORAGE_KEY]: 'off' }))).toBe(false)
    expect(shouldAutoPlay(null)).toBe(true)
  })

  it('存储实现异常时仍按自动播放处理（读不到偏好不等于用户关掉了音乐）', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    expect(shouldAutoPlay(broken)).toBe(true)
  })

  it('存储键名稳定，避免升级后用户偏好莫名丢失', () => {
    expect(BGM_STORAGE_KEY).toBe('heibox.bgm.v1')
    expect(BGM_VOLUME_KEY).toBe('heibox.bgm.volume')
  })
})

describe('formatTime', () => {
  it('把秒数格式化成 m:ss，用于进度条两侧的时间', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(9)).toBe('0:09')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(600)).toBe('10:00')
  })

  it('时长未知或非法时回落到 0:00，绝不显示 NaN', () => {
    expect(formatTime(null)).toBe('0:00')
    expect(formatTime(undefined)).toBe('0:00')
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(-5)).toBe('0:00')
    expect(formatTime(Infinity)).toBe('0:00')
  })
})

describe('trackLabel', () => {
  it('有标题用标题，无标题按序号兜底', () => {
    expect(trackLabel({ title: '夜航' }, 0)).toBe('夜航')
    expect(trackLabel({}, 2)).toBe('曲目 3')
    expect(trackLabel(null, 0)).toBe('曲目 1')
  })
})

describe('loopGain', () => {
  it('接缝两端淡出淡入，中间段保持满音量', () => {
    const fade = LOOP_FADE_SECONDS

    expect(loopGain(0, 27)).toBe(0)
    expect(loopGain(fade / 2, 27)).toBeCloseTo(0.5, 3)
    expect(loopGain(13, 27)).toBe(1)
    expect(loopGain(27 - fade / 2, 27)).toBeCloseTo(0.5, 3)
  })

  it('片段太短或时长未知时不做淡化，免得整首都在淡入淡出', () => {
    expect(loopGain(1, LOOP_FADE_SECONDS * 2)).toBe(1)
    expect(loopGain(1, 3)).toBe(1)
    expect(loopGain(1, 0)).toBe(1)
    expect(loopGain(1, null)).toBe(1)
    expect(loopGain(1, undefined)).toBe(1)
  })

  it('位置非法时按开头处理，绝不返回 NaN', () => {
    expect(loopGain(NaN, 27)).toBe(0)
    expect(loopGain(-3, 27)).toBe(0)
    expect(loopGain(Infinity, 27)).toBe(0)
    expect(loopGain(999, 27)).toBe(0)
  })
})
