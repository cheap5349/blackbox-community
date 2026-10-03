import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PreloadScreen from '../components/PreloadScreen.vue'
import { INTRO_FPS } from '../intro.js'

let wrapper
let currentFrame = 0
beforeEach(() => {
  vi.useFakeTimers()
  currentFrame = 0
  wrapper = mount(PreloadScreen, { props: { ready: false } })
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

// 累加推进到**绝对帧号**。组件从 rAF 回调时间戳推导帧号，首帧建立基准时
// 天然滞后一个帧间隔，所以断言取“该帧已经生效”之后的帧号，避免卡在边界上。
function toFrame(frame) {
  const delta = (frame - currentFrame) * (1000 / INTRO_FPS)
  if (delta > 0) vi.advanceTimersByTime(delta)
  currentFrame = frame
}

const styleOf = (sel) => wrapper.find(sel).element.style

describe('PreloadScreen 五幕开场', () => {
  it('第一幕打出 COMMUNITY ACCESS REQUIRED', () => {
    toFrame(47)
    expect(wrapper.attributes('data-stage')).toBe('signal')
    expect(wrapper.find('.intro-signal').text()).toBe('COMMUNITY ACCESS REQUIRED')
    expect(styleOf('.intro-signal').opacity).toBe('1')
  })

  it('第二幕切出标志，描边按 pathLength 归一化推进', () => {
    toFrame(51)
    expect(wrapper.attributes('data-stage')).toBe('logo')
    // 第一幕在边界帧立即归零（硬切，无交叉淡化）
    expect(styleOf('.intro-signal').opacity).toBe('0')
    expect(styleOf('.intro-mark').opacity).toBe('1')

    // 圆环描边在第 50~88 帧推进，中途应读到 0~1 的分数而不是整段
    toFrame(61)
    const midDash = styleOf('.intro-mark-circle').strokeDasharray
    const midProgress = parseFloat(midDash)
    expect(midProgress).toBeGreaterThan(0)
    expect(midProgress).toBeLessThan(1)

    // 字母在第 88~118 帧逐字打出，推到第二幕尾段才能读全
    toFrame(121)
    expect(styleOf('.intro-mark-circle').strokeDasharray).toBe('1 0')
    expect(styleOf('.intro-mark-hex').strokeDasharray).toBe('1 0')
    expect(wrapper.find('.intro-mark-text').text()).toBe('HEIBOX')
  })

  it('第三幕逐行打出认证消息', () => {
    // 第三幕从第 120 帧起，认证面板到第 126 帧才亮
    toFrame(129)
    expect(wrapper.attributes('data-stage')).toBe('auth')
    expect(styleOf('.intro-auth').opacity).toBe('1')

    // 三条消息错峰打字，到第 187 帧全部落定
    toFrame(187)
    const lines = wrapper.findAll('.intro-auth-lines span')
    expect(lines[0].text()).toBe('IDENTITY CONFIRMED')
    expect(lines[1].text()).toBe('OPERATOR : ANONYMOUS')
    expect(lines[2].text()).toBe('ESTABLISHING LINK')
  })

  it('毛刺帧叠出错位方块，非毛刺帧清空', () => {
    toFrame(153)
    expect(wrapper.find('.intro-auth-glitch').text().length).toBeGreaterThan(0)
    expect(wrapper.find('.intro-auth').classes()).toContain('is-glitch')

    toFrame(155)
    expect(wrapper.find('.intro-auth-glitch').text()).toBe('')
    expect(wrapper.find('.intro-auth').classes()).not.toContain('is-glitch')
  })

  it('第四幕扫描环半径由 JS 直接驱动 r 属性', () => {
    toFrame(195)
    expect(wrapper.attributes('data-stage')).toBe('scan')
    const early = Number(wrapper.find('.intro-scan-arc').attributes('r'))
    expect(early).toBeGreaterThan(800)

    // 长尾收拢：半径落到 300 以内
    toFrame(253)
    const late = Number(wrapper.find('.intro-scan-arc').attributes('r'))
    expect(early).toBeGreaterThan(late)
    expect(late).toBeLessThan(300)

    // 权限文字用字距收拢，而不是整体缩放
    expect(wrapper.find('.intro-permission').text()).toBe('PERMISSION AUTHORIZED')
    expect(styleOf('.intro-permission').letterSpacing).not.toBe('')
  })

  it('第五幕呈现欢迎标题并推进高亮遮罩', () => {
    toFrame(250)
    expect(wrapper.attributes('data-stage')).toBe('welcome')
    expect(wrapper.find('.intro-welcome-title').text()).toContain('WELCOME TO HEIBOX')
    expect(Number(styleOf('.intro-welcome-title').opacity)).toBeGreaterThan(0)

    const before = parseFloat(styleOf('.intro-welcome-highlight').width) || 0
    toFrame(296)
    expect(parseFloat(styleOf('.intro-welcome-highlight').width)).toBeGreaterThan(before)
  })

  it('结尾把白闪推到全白', () => {
    toFrame(308)
    expect(styleOf('.intro-flash').opacity).toBe('1')
  })

  it('在资源就绪前停在最后一帧，不放行', () => {
    toFrame(400)
    expect(wrapper.emitted('done')).toBeUndefined()
    expect(styleOf('.intro-flash').opacity).toBe('1')
  })

  it('资源就绪后完成开场', async () => {
    await wrapper.setProps({ ready: true })
    toFrame(320)
    expect(wrapper.emitted('done')?.length).toBe(1)
  })

  it('动画播完后才就绪，仍能完成收尾（循环不会永久停住）', async () => {
    // 先让动画走完，此时 ready 还是 false，循环进入等待
    toFrame(400)
    expect(wrapper.emitted('done')).toBeUndefined()

    // 之后再就绪：等待期的低频重试必须能把它收掉。
    // 曾经这里直接 return 且不再调度 rAF，循环永久停止后
    // ready 变成 true 也没有任何人来收尾，用户永久停在开场屏。
    await wrapper.setProps({ ready: true })
    vi.advanceTimersByTime(600)
    expect(wrapper.emitted('done')?.length).toBe(1)
  })

  it('提供可访问的跳过入口并立即完成', async () => {
    await wrapper.find('button[aria-label="跳过开场动画"]').trigger('click')
    expect(wrapper.emitted('skip')?.length).toBe(1)
    expect(wrapper.emitted('done')?.length).toBe(1)
  })
})
