import { describe, expect, it } from 'vitest'
import { INTRO_DURATION, INTRO_FPS, INTRO_STORAGE_KEY, introMotion, shouldShowIntro, track, typed } from '../intro.js'

// 加一点 epsilon：introMotion 会把时间向下取整到 25fps 网格，
// 直接传 f/25 会因为浮点误差落回上一帧，边界断言就会偶发失败。
const frameAt = (frame) => introMotion(frame / INTRO_FPS + 1e-9)

describe('track 单调三次插值', () => {
  it('端点外取边界值，不越界外推', () => {
    const keys = [
      [0, 10],
      [10, 0],
    ]
    expect(track(keys, -5)).toBe(10)
    expect(track(keys, 99)).toBe(0)
  })

  it('在每个关键帧上精确命中该帧的值', () => {
    const keys = [
      [0, 200],
      [10, 100],
      [20, 80],
    ]
    for (const [frame, value] of keys) expect(track(keys, frame)).toBeCloseTo(value, 6)
  })

  it('保持单调，不在关键帧之间过冲', () => {
    // 参考实现特意用单调插值：逐段缓动会在每个关键帧处速度归零，
    // 这里断言的是“全程不回弹”，也就是长尾手感的来源。
    const keys = [
      [0, 100],
      [5, 60],
      [10, 20],
      [20, 4],
      [40, 0],
    ]
    let previous = Infinity
    for (let f = 0; f <= 40; f += 0.5) {
      const value = track(keys, f)
      expect(value).toBeLessThanOrEqual(previous + 1e-9)
      expect(value).toBeGreaterThanOrEqual(0)
      previous = value
    }
  })

  it('跨越关键帧时速度连续（相邻帧差不会突变到 0）', () => {
    const keys = [
      [0, 1000],
      [10, 400],
      [20, 120],
      [30, 20],
      [60, 0],
    ]
    // 取每个关键帧前后的速度，二者不应出现数量级跳变
    for (const [frame] of keys.slice(1, -1)) {
      const before = track(keys, frame) - track(keys, frame - 0.5)
      const after = track(keys, frame + 0.5) - track(keys, frame)
      expect(Math.abs(after)).toBeGreaterThan(0)
      expect(Math.abs(before)).toBeGreaterThan(0)
    }
  })

  it('空轨道与单帧轨道不抛错', () => {
    expect(track([], 3)).toBe(0)
    expect(track([[4, 7]], 1)).toBe(7)
  })
})

describe('typed 整数帧打字', () => {
  it('起始帧之前为空，结束帧之后为全量', () => {
    expect(typed('HEIBOX', 9, 10, 20)).toBe('')
    expect(typed('HEIBOX', 20, 10, 20)).toBe('HEIBOX')
  })

  it('按帧推进，同一帧内结果稳定（不随刷新率抖动）', () => {
    expect(typed('HEIBOX', 10, 10, 20)).toBe('H')
    expect(typed('HEIBOX', 10.9, 10, 20)).toBe('H')
    const mid = typed('HEIBOX', 15, 10, 20)
    expect(mid.length).toBeGreaterThan(1)
    expect(mid.length).toBeLessThan(6)
    expect('HEIBOX'.startsWith(mid)).toBe(true)
  })
})

describe('introMotion 五幕时间轴', () => {
  it('按硬切边界切换幕，不做交叉淡化', () => {
    expect(frameAt(0).stage).toBe('signal')
    expect(frameAt(20).stage).toBe('signal')
    expect(frameAt(48).stage).toBe('logo')
    expect(frameAt(119).stage).toBe('logo')
    expect(frameAt(120).stage).toBe('auth')
    expect(frameAt(189).stage).toBe('auth')
    expect(frameAt(190).stage).toBe('scan')
    expect(frameAt(235).stage).toBe('scan')
    expect(frameAt(236).stage).toBe('welcome')
    expect(frameAt(306).stage).toBe('welcome')
  })

  it('边界帧上前后两幕互斥可见', () => {
    // 第 47 帧仍是第一幕，第 48 帧已切到第二幕，且第一幕立即归零
    expect(frameAt(47).signalOpacity).toBe(1)
    expect(frameAt(48).signalOpacity).toBe(0)
    expect(frameAt(48).logo.opacity).toBe(1)
    expect(frameAt(47).logo.opacity).toBe(0)

    // 第三幕完全退出后第四幕才起（第 190 帧是扫描环起手帧，透明度尚为 0，
    // 但环元素已经就位，所以按半径断言而不是按透明度）
    expect(frameAt(190).auth.opacity).toBe(0)
    expect(frameAt(190).scan.ringRadius).toBeGreaterThan(1000)
    expect(frameAt(189).scan.ringRadius).toBeGreaterThan(1000)
    expect(frameAt(196).scan.opacity).toBeGreaterThan(0)
  })

  it('第一幕逐字打出 COMMUNITY ACCESS REQUIRED', () => {
    expect(frameAt(4).signalText).toBe('')
    expect(frameAt(25).signalText.length).toBeGreaterThan(0)
    expect('COMMUNITY ACCESS REQUIRED'.startsWith(frameAt(25).signalText)).toBe(true)
    expect(frameAt(45).signalText).toBe('COMMUNITY ACCESS REQUIRED')
  })

  it('第二幕打出 HEIBOX 并在结束帧前完成', () => {
    expect(frameAt(88).logo.letters).toBe('H')
    expect(frameAt(118).logo.letters).toBe('HEIBOX')
    expect(frameAt(117).logo.lettersOpacity).toBe(1)
    expect(frameAt(120).logo.lettersOpacity).toBe(0)
  })

  it('扫描环半径长尾收拢到 275 附近', () => {
    const start = frameAt(190).scan.ringRadius
    const end = frameAt(258).scan.ringRadius
    expect(start).toBeGreaterThan(1000)
    expect(end).toBeLessThan(300)
    // 前 40 帧必须吃掉绝大部分位移，这是“长尾”的判据
    const atForty = frameAt(230).scan.ringRadius
    expect(atForty - end).toBeLessThan((start - end) * 0.05)
  })

  it('扫描环毛刺帧出现单帧放大与模糊', () => {
    expect(frameAt(204).scan.scale).toBeGreaterThan(1.5)
    expect(frameAt(204).scan.blur).toBeGreaterThan(0)
    expect(frameAt(206).scan.scale).toBe(1)
    expect(frameAt(206).scan.blur).toBe(0)
  })

  it('权限文字字距从松收到 0', () => {
    expect(frameAt(240).tracking).toBeGreaterThan(15)
    expect(frameAt(262).tracking).toBe(0)
    expect(frameAt(258).permissionText).toBe('PERMISSION AUTHORIZED')
  })

  it('第五幕欢迎标题落位并推进高亮扫过', () => {
    expect(frameAt(236).welcome.visible).toBe(true)
    expect(frameAt(260).welcome.brandOpacity).toBeGreaterThan(0.9)
    // 墨迹落位：偏移量单调收敛到 0
    expect(frameAt(240).welcome.x).toBeGreaterThan(frameAt(260).welcome.x)
    expect(frameAt(275).welcome.x).toBe(0)
    // 高亮带宽度持续推进
    expect(frameAt(280).welcome.highlight).toBeGreaterThan(frameAt(276).welcome.highlight)
    expect(frameAt(299).welcome.highlight).toBeGreaterThan(300)
  })

  it('结尾白闪把画面推到全白', () => {
    expect(frameAt(298).exit.white).toBe(0)
    expect(frameAt(306).exit.white).toBe(1)
    expect(frameAt(306).exit.contentOpacity).toBe(0)
  })

  it('对异常时间输入返回有限值，不产生 NaN', () => {
    for (const input of [-10, 0, Number.NaN, Number.POSITIVE_INFINITY, 999]) {
      const state = introMotion(input)
      expect(Number.isFinite(state.t)).toBe(true)
      expect(Number.isFinite(state.f)).toBe(true)
      expect(Number.isFinite(state.scan.ringRadius)).toBe(true)
      expect(Number.isFinite(state.logo.ringProgress)).toBe(true)
      expect(Number.isFinite(state.exit.white)).toBe(true)
      expect(Number.isFinite(state.welcome.highlight)).toBe(true)
      expect(Number.isFinite(state.tracking)).toBe(true)
    }
  })

  it('所有可见性取值都落在 0~1', () => {
    for (let f = 0; f <= 310; f += 1) {
      const s = frameAt(f)
      for (const value of [
        s.signalOpacity,
        s.gridOpacity,
        s.logo.opacity,
        s.logo.ringOpacity,
        s.logo.markOpacity,
        s.auth.opacity,
        s.scan.opacity,
        s.permissionOpacity,
        s.welcome.panelFlash,
        s.welcome.brandOpacity,
        s.welcome.communityOpacity,
        s.exit.white,
        s.exit.contentOpacity,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('shouldShowIntro', () => {
  it('只在首次访问且未减少动态效果时播放', () => {
    const values = new Map()
    const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) }
    expect(shouldShowIntro({ storage, reducedMotion: false })).toBe(true)
    storage.setItem(INTRO_STORAGE_KEY, '1')
    expect(shouldShowIntro({ storage, reducedMotion: false })).toBe(false)
    expect(shouldShowIntro({ storage, reducedMotion: true })).toBe(false)
  })

  it('总时长与帧率一致', () => {
    expect(INTRO_DURATION).toBeCloseTo(306 / INTRO_FPS, 6)
    expect(introMotion(INTRO_DURATION).f).toBe(306)
  })
})
