// 实时性能徽标：折叠态展示帧率与延迟，点击展开细节，键盘可达。
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { perf } = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return {
    perf: {
      fps: ref(60),
      latency: ref(32),
      quality: ref('good'),
      samples: ref([30, 34]),
      supported: ref(true),
      start: vi.fn(),
      stop: vi.fn(),
    },
  }
})

vi.mock('../composables/usePerformance.js', () => ({ usePerformance: () => perf }))

import PerfBadge from '../components/PerfBadge.vue'

beforeEach(() => vi.clearAllMocks())

describe('PerfBadge', () => {
  it('折叠态显示帧率与延迟', () => {
    const wrapper = mount(PerfBadge)
    expect(wrapper.text()).toContain('60')
    expect(wrapper.text()).toContain('32 ms')
    expect(wrapper.find('button[aria-label*="性能"]').exists()).toBe(true)
  })

  it('点击展开细节面板，再点收起', async () => {
    const wrapper = mount(PerfBadge)
    const toggle = wrapper.find('button[aria-label*="性能"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.perf-detail').exists()).toBe(true)
    expect(wrapper.text()).toContain('帧率')
    await toggle.trigger('click')
    expect(wrapper.find('.perf-detail').exists()).toBe(false)
  })

  it('延迟缺失时显示占位符而不是 NaN', () => {
    perf.latency.value = null
    perf.quality.value = 'unknown'
    const wrapper = mount(PerfBadge)
    expect(wrapper.text()).toContain('—')
    expect(wrapper.text()).not.toContain('NaN')
    perf.latency.value = 32
    perf.quality.value = 'good'
  })

  it('挂载时开始采样，卸载时停止采样', () => {
    const wrapper = mount(PerfBadge)
    expect(perf.start).toHaveBeenCalled()
    wrapper.unmount()
    expect(perf.stop).toHaveBeenCalled()
  })
})
