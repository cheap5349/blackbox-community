// App 外壳衔接测试：锁住「白场遮罩永久盖住主界面」这个白屏缺陷。
//
// 缺陷回顾：bootExit 曾恒初始为 true，而遮罩的消失只依赖 onBootDone。
// 跳过开场时（localStorage 已标记看过）onBootDone 永远不会触发，
// 于是 #f6f3ef 的遮罩一直盖在最上层——表现为打开即全屏空白。
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const { storeState, pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  storeState: {
    user: null,
    error: '',
    showSearch: false,
    searchQ: '',
    searchResults: [],
    searchLoading: false,
    reportTarget: null,
    reportReasons: [],
    reportReason: '',
    reportCustom: '',
    reportSending: false,
    showNotifications: false,
    notificationUnread: 0,
    notifications: [],
    notificationTotal: 0,
    notificationLoading: false,
    load: vi.fn(() => Promise.resolve()),
    refreshMe: vi.fn(),
    loadUnreadCount: vi.fn(() => Promise.resolve()),
    loadNotifications: vi.fn(() => Promise.resolve()),
    markNotificationsRead: vi.fn(),
    openNotifications: vi.fn(),
    closeNotifications: vi.fn(),
    openNotification: vi.fn(),
    openSearch: vi.fn(),
    closeSearch: vi.fn(),
    runSearch: vi.fn(),
    pickSearch: vi.fn(),
    closeReport: vi.fn(),
    submitReport: vi.fn(),
    relativeDate: () => '刚刚',
    initials: () => '黑',
    startWrite: vi.fn(),
    openProfile: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: (...args) => pushMock(...args), afterEach: vi.fn() }),
  useRoute: () => ({ path: '/' }),
}))

vi.mock('../store.js', () => ({ useStore: () => storeState }))

vi.mock('../composables/useTheme.js', () => ({
  useTheme: () => ({ theme: ref('light'), applyTheme: vi.fn(), toggleTheme: vi.fn() }),
}))
vi.mock('../composables/useScrollUi.js', () => ({
  useScrollUi: () => ({
    headerScrolled: ref(false),
    headerHidden: ref(false),
    setupScroll: vi.fn(),
    teardownScroll: vi.fn(),
  }),
}))
vi.mock('../composables/useProfileBg.js', () => ({
  useProfileBg: () => ({
    profileBg: ref(''),
    profileBgIsVideo: ref(false),
    profileBgVisible: ref(false),
    loadProfileBg: vi.fn(),
  }),
}))
vi.mock('../composables/useReveal.js', () => ({
  useReveal: () => ({ refresh: vi.fn(), teardown: vi.fn() }),
}))

import App from '../App.vue'
// 用真实的 intro.js，测的就是「是否播放开场」这条真实判断
import { INTRO_STORAGE_KEY } from '../intro.js'

const mountApp = () => mount(App, { global: { stubs: { RouterView: true } } })

let wrapper
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.clearAllMocks()
  // jsdom 不实现 matchMedia，而主题/动效相关的组件会调用它
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('App 开场衔接', () => {
  it('首次访问：渲染开场屏，白场遮罩此时不参与', () => {
    wrapper = mountApp()
    expect(wrapper.find('.preload-screen').exists()).toBe(true)
    // loading 为 true → 遮罩条件 !loading 为假 → 不应存在
    expect(wrapper.find('.boot-fade-overlay').exists()).toBe(false)
    // 开场期间不放行主界面
    expect(wrapper.find('.community-page').exists()).toBe(false)
  })

  it('已看过开场：不渲染遮罩 —— 否则它会永久盖住主界面（白屏）', () => {
    localStorage.setItem(INTRO_STORAGE_KEY, '1')
    wrapper = mountApp()
    expect(wrapper.find('.preload-screen').exists()).toBe(false)
    // 关键回归点：跳过开场时 onBootDone 永不触发，
    // 遮罩必须从一开始就不存在，否则没有任何东西能关掉它。
    expect(wrapper.find('.boot-fade-overlay').exists()).toBe(false)
  })

  it('已看过开场：主界面立即可见', () => {
    localStorage.setItem(INTRO_STORAGE_KEY, '1')
    wrapper = mountApp()
    expect(wrapper.find('.community-page').exists()).toBe(true)
  })

  it('跳过开场：放行主界面并把白场遮罩淡出', async () => {
    wrapper = mountApp()
    expect(wrapper.find('.preload-screen').exists()).toBe(true)

    await wrapper.find('button[aria-label="跳过开场动画"]').trigger('click')
    await nextTick()
    expect(wrapper.find('.community-page').exists()).toBe(true)

    // 遮罩离场过渡 0.55s，推进足够时间让它被移除
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(wrapper.find('.boot-fade-overlay').exists()).toBe(false)
    expect(wrapper.find('.preload-screen').exists()).toBe(false)
  })

  it('数据始终未就绪时，硬兜底也会放行主界面（绝不永久卡在开场层）', async () => {
    wrapper = mountApp()
    // 不点击跳过、也不让 store.load 就绪，直接推进到硬兜底时限之后
    vi.advanceTimersByTime(20000)
    await nextTick()
    expect(wrapper.find('.community-page').exists()).toBe(true)
  })
})
