import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const router = { push: vi.fn() }
const store = { user: null, openDiscussions: vi.fn(), openSearch: vi.fn(), startWrite: vi.fn(), initials: () => '社' }

vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/' }), useRouter: () => router }))
vi.mock('../store.js', () => ({ useStore: () => store }))
vi.mock('../composables/useTheme.js', () => ({ useTheme: () => ({ theme: { value: 'light' }, toggleTheme: vi.fn() }) }))
vi.mock('../composables/useScrollUi.js', () => ({
  useScrollUi: () => ({ headerScrolled: { value: false }, headerHidden: { value: false } }),
}))
// 性能徽标内部的采样定时器与真实 fetch 不该由导航栏测试承担
vi.mock('../composables/usePerformance.js', () => ({
  usePerformance: () => ({
    fps: { value: 60 },
    latency: { value: 24 },
    quality: { value: 'good' },
    supported: { value: true },
    start: vi.fn(),
    stop: vi.fn(),
  }),
}))

import HeaderBar from '../components/HeaderBar.vue'

describe('HeaderBar', () => {
  it('提供重播开场控制并向应用外壳发出事件', async () => {
    const wrapper = mount(HeaderBar)
    await wrapper.find('button[aria-label="重播开场动画"]').trigger('click')
    expect(wrapper.emitted('replay-intro')?.length).toBe(1)
  })

  it('导航与操作按钮都用矢量图标，不再依赖字体符号', () => {
    const wrapper = mount(HeaderBar)
    // 品牌 + 三个导航项 + 重播 + 搜索 + 性能徽标，至少 6 枚
    expect(wrapper.findAll('svg.app-icon').length).toBeGreaterThanOrEqual(6)
    expect(wrapper.text()).not.toContain('⌁')
    expect(wrapper.text()).not.toContain('◌')
    expect(wrapper.text()).not.toContain('▢')
    expect(wrapper.text()).not.toContain('🔔')
  })

  it('右上角常驻性能徽标，显示帧率与延迟', () => {
    const wrapper = mount(HeaderBar)
    expect(wrapper.find('.header-actions .perf-badge').exists()).toBe(true)
    expect(wrapper.find('button[aria-label*="性能"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('FPS')
  })
})
