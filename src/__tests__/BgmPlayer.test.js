// 左下角背景音乐播放器：默认收起，点击向右滑出面板；无曲目时给出放置说明。
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { bgm } = await vi.hoisted(async () => {
  const { computed, ref } = await import('vue')
  const tracks = ref([{ title: '夜航', src: '/audio/bgm.mp3' }])
  const duration = ref(200)
  return {
    bgm: {
      tracks,
      current: computed(() => tracks.value[0] || null),
      index: ref(0),
      playing: ref(false),
      volume: ref(0.5),
      ready: ref(true),
      error: ref(''),
      currentTime: ref(0),
      duration,
      progress: computed(() => 0),
      load: vi.fn(),
      toggle: vi.fn(),
      next: vi.fn(),
      prev: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      releaseAudio: vi.fn(),
    },
  }
})

vi.mock('../composables/useBgm.js', () => ({ useBgm: () => bgm }))

import BgmPlayer from '../components/BgmPlayer.vue'

beforeEach(() => {
  vi.clearAllMocks()
  bgm.tracks.value = [{ title: '夜航', src: '/audio/bgm.mp3' }]
  bgm.ready.value = true
  bgm.error.value = ''
  bgm.playing.value = false
})

describe('BgmPlayer', () => {
  it('默认只有一个左下角入口，面板收起', () => {
    const wrapper = mount(BgmPlayer)
    const toggle = wrapper.find('button[aria-label*="背景音乐"]')
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.bgm-panel').exists()).toBe(false)
  })

  it('点击入口向右滑出播放面板', async () => {
    const wrapper = mount(BgmPlayer)
    const toggle = wrapper.find('button[aria-label*="背景音乐"]')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.bgm-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('夜航')
  })

  it('面板里的播放按钮驱动播放状态', async () => {
    const wrapper = mount(BgmPlayer)
    await wrapper.find('button[aria-label*="背景音乐"]').trigger('click')
    await wrapper.find('.bgm-play').trigger('click')
    expect(bgm.toggle).toHaveBeenCalled()
  })

  it('没有曲目时给出放置说明而不是空白面板', async () => {
    bgm.tracks.value = []
    bgm.ready.value = false
    const wrapper = mount(BgmPlayer)
    await wrapper.find('button[aria-label*="背景音乐"]').trigger('click')
    expect(wrapper.text()).toContain('public/audio')
  })

  it('挂载时加载曲目清单', () => {
    mount(BgmPlayer)
    expect(bgm.load).toHaveBeenCalled()
  })

  it('入口是唱片机造型：黑胶唱片 + 中心标签 + 唱臂', () => {
    const wrapper = mount(BgmPlayer)
    const disc = wrapper.find('.bgm-disc')

    expect(disc.exists()).toBe(true)
    expect(disc.find('.bgm-label').exists()).toBe(true)
    expect(wrapper.find('.bgm-arm').exists()).toBe(true)
    // 唱片本身就是入口按钮的内容，不要再套一个嵌套按钮
    expect(disc.element.closest('button')).toBe(wrapper.find('button[aria-label*="背景音乐"]').element)
  })

  it('播放中给唱盘打上转动标记，暂停时移除', async () => {
    const wrapper = mount(BgmPlayer)

    expect(wrapper.find('.bgm-player').classes()).not.toContain('is-playing')

    bgm.playing.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.bgm-player').classes()).toContain('is-playing')

    bgm.playing.value = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.bgm-player').classes()).not.toContain('is-playing')
  })

  it('展开后的面板有封面缩略、当前曲目区与进度时间', async () => {
    const wrapper = mount(BgmPlayer)
    await wrapper.find('button[aria-label*="背景音乐"]').trigger('click')

    expect(wrapper.find('.bgm-now').exists()).toBe(true)
    expect(wrapper.find('.bgm-cover').exists()).toBe(true)
    expect(wrapper.find('.bgm-progress').exists()).toBe(true)
    expect(wrapper.text()).toContain('0:00')
    expect(wrapper.text()).toContain('3:20')
  })

  it('拖动进度条定位播放位置', async () => {
    const wrapper = mount(BgmPlayer)
    await wrapper.find('button[aria-label*="背景音乐"]').trigger('click')

    await wrapper.find('.bgm-progress').setValue('500')

    expect(bgm.seek).toHaveBeenCalled()
  })
})
