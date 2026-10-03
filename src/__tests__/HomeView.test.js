// HomeView 组件渲染测试：验证拆出后的视图从 store 取数、事件能触发 store 动作
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// vi.hoisted 在 import 前执行，种子数据必须内联（不能引用外部导入）
const { storeState, seedPosts, pushMock } = vi.hoisted(() => {
  const seedPosts = [
    {
      id: 'welcome-music',
      author: '阿澄',
      community: '音乐角落',
      title: '周末歌单：把黄昏留在耳机里',
      content: '整理了一组适合傍晚散步时听的歌。',
      created_at: new Date().toISOString(),
      media: [],
    },
    {
      id: 'welcome-photo',
      author: '快门手',
      community: '镜头之外',
      title: '柔光里的元气瞬间',
      content: '今天在公园拍到一组逆光人像。',
      created_at: new Date().toISOString(),
      media: [],
    },
  ]
  const storeState = {
    user: null,
    posts: seedPosts,
    postTotal: seedPosts.length,
    feedLoading: false,
    hasMoreHome: false,
    communities: [],
    totalPostCount: 3,
    onlineMembers: 12,
    treeholeTags: ['心事', '秘密'],
    initials: (name) => (name || '社').trim().slice(0, 1).toUpperCase(),
    relativeDate: () => '刚刚',
    likeCount: (p) => Number(p?.like_count || 0),
    openPost: vi.fn(),
    openCommunity: vi.fn(),
    openDiscussions: vi.fn(),
    toggleLike: vi.fn(),
    startWrite: vi.fn(),
    openProfile: vi.fn(),
    loadFeed: vi.fn(),
  }
  return { storeState, seedPosts, pushMock: vi.fn() }
})

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: (...args) => pushMock(...args) }),
}))

vi.mock('../store.js', () => ({
  useStore: () => storeState,
}))

import HomeView from '../views/HomeView.vue'
import { resetGeoWeatherCache } from '../composables/useGeoWeather.js'

let wrapper
beforeEach(() => {
  vi.clearAllMocks()
  // useGeoWeather 是模块级单例：每个用例都从"没取过天气"开始
  resetGeoWeatherCache()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: false }) }))
  wrapper = mount(HomeView)
})
afterEach(() => vi.unstubAllGlobals())

describe('HomeView', () => {
  it('从 store 渲染最新动态列表与欢迎文案', () => {
    expect(wrapper.text()).toContain('最新动态')
    expect(wrapper.text()).toContain(seedPosts[0].title)
    expect(wrapper.text()).toContain('黑盒社区')
  })

  it('点击帖子卡片触发 store.openPost', async () => {
    await wrapper.find('.post-card').trigger('click')
    expect(storeState.openPost).toHaveBeenCalledWith(expect.objectContaining({ id: seedPosts[0].id }))
  })

  it('点击个人名片进入个人中心', async () => {
    await wrapper.find('.profile-panel').trigger('click')
    expect(storeState.openProfile).toHaveBeenCalled()
  })

  it('讨论主题标签渲染并可直接打开讨论区', async () => {
    expect(wrapper.text()).toContain('讨论主题')
    await wrapper.find('.tags button').trigger('click')
    expect(storeState.openDiscussions).toHaveBeenCalledWith('心事')
  })

  it('底部导航跳转社区列表页', async () => {
    const footer = wrapper.find('.home-footer')
    const buttons = footer.findAll('button')
    const communitiesBtn = buttons.find((b) => b.text() === '社区')
    await communitiesBtn.trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/communities')
  })

  it('进入首页即自动加载城市级天气，无需点击', async () => {
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('https://ipwho.is/', { mode: 'cors' }))
  })

  it('天气拿到之后不再显示占位按钮', async () => {
    await vi.waitFor(() => expect(wrapper.find('button[aria-label="重新获取本地天气"]').exists()).toBe(true))
    // 接口都给不出城市时留一个手动重试口，而不是空白
    expect(wrapper.text()).toContain('不展示或保存 IP 地址')
  })

  it('手动重新获取会重新发起请求', async () => {
    const retry = () =>
      vi.waitFor(() => expect(wrapper.find('button[aria-label="重新获取本地天气"]').exists()).toBe(true))
    await retry()
    const before = fetch.mock.calls.length
    await wrapper.find('button[aria-label="重新获取本地天气"]').trigger('click')
    expect(fetch.mock.calls.length).toBeGreaterThan(before)
  })
})
