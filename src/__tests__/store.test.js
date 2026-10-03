// store 状态流转测试：拆分后所有页面数据收敛于 store.js，这里覆盖核心路径
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
const apiMock = vi.fn()

vi.mock('../api.js', () => ({
  setUnauthorizedHandler: vi.fn(),
  api: (...args) => apiMock(...args),
}))

vi.mock('../router.js', () => ({
  router: { push: (...args) => pushMock(...args), currentRoute: { value: { path: '/' } } },
}))

import { useStore } from '../store.js'

beforeEach(() => {
  localStorage.clear()
  pushMock.mockClear()
  apiMock.mockReset()
  // store 是模块级单例，测试间必须重置被改动的状态，否则会互相污染
  const store = useStore()
  store.user = JSON.parse(localStorage.user || 'null')
  store.error = ''
  store.posts = []
  store.postTotal = 0
  store.treeholePosts = []
  store.treeholeTag = ''
  store.communities = []
  store.form = { name: '', email: '', password: '' }
  store.authRedirect = ''
  store.editingPost = null
  store.post = { title: '', content: '', communityId: '', images: [], video: null }
  store.writeFrom = 'home'
  store.selectedPost = null
  store.feedSort = 'latest'
  store.showNotifications = false
  store.notifications = []
  store.notificationTotal = 0
  store.notificationUnread = 0
  store.adminUsers = []
  store.adminPosts = []
  store.adminStats = { posts: 0, communities: 0, users: 0, reports: 0, banned: 0, muted: 0 }
})

describe('认证', () => {
  it('登录成功写入会话并跳转首页', async () => {
    apiMock.mockResolvedValue({ token: 't1', user: { id: 1, name: '测试', role: 'user' }, expires_at: null })
    const store = useStore()
    store.mode = 'login'
    store.form = { name: '', email: 'a@b.c', password: '123456' }
    await store.submitAuth()
    expect(localStorage.token).toBe('t1')
    expect(store.user.name).toBe('测试')
    expect(pushMock).toHaveBeenCalledWith('/')
  })

  it('受保护页面登录后回跳原目标（redirect）', async () => {
    apiMock.mockResolvedValue({ token: 't2', user: { id: 2, name: '写手', role: 'user' }, expires_at: null })
    const store = useStore()
    store.authRedirect = '/write'
    await store.submitAuth()
    expect(pushMock).toHaveBeenCalledWith('/write')
    expect(store.authRedirect).toBe('')
  })

  it('登录失败保留错误信息不跳转', async () => {
    apiMock.mockRejectedValue(Object.assign(new Error('密码错误'), { status: 401 }))
    const store = useStore()
    await store.submitAuth()
    expect(store.error).toBe('密码错误')
    expect(pushMock).not.toHaveBeenCalled()
  })
})

describe('登录态守卫', () => {
  it('未登录点赞提示登录并跳转 /login', async () => {
    const store = useStore()
    await store.toggleLike({ id: 1 })
    expect(pushMock).toHaveBeenCalledWith('/login')
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('已登录点赞成功后同步所有列表的计数', async () => {
    const store = useStore()
    store.user = { id: 7, name: '赞主', role: 'user' } // store.user 是模块级单例，需直接赋值
    const p = { id: 9, liked: false, like_count: 2 }
    store.posts = [p]
    store.treeholePosts = [{ id: 9, liked: true, like_count: 99 }]
    apiMock.mockResolvedValue({ liked: true, likeCount: 3 })
    await store.toggleLike(p)
    expect(apiMock).toHaveBeenCalledWith('/posts/9/like', { method: 'POST' })
    expect(p.liked).toBe(true)
    expect(p.like_count).toBe(3)
    expect(store.treeholePosts[0].like_count).toBe(3)
  })
})

describe('讨论区过滤', () => {
  it('filteredPosts 按标签过滤标题/内容/社区', () => {
    const store = useStore()
    store.treeholePosts = [
      { id: 1, title: '心事一', content: '', community: '讨论区' },
      { id: 2, title: '无关', content: '晚饭吃什么', community: '讨论区' },
    ]
    store.treeholeTag = ''
    expect(store.filteredPosts.length).toBe(2)
    store.treeholeTag = '心事'
    expect(store.filteredPosts.map((x) => x.id)).toEqual([1])
  })
})

describe('派生统计', () => {
  it('onlineMembers / totalPostCount 随数据变化', () => {
    const store = useStore()
    store.postTotal = 1
    store.communities = [{ postCount: 2 }, { postCount: 3 }]
    expect(store.totalPostCount).toBe(5)
    expect(store.onlineMembers).toBe(15)
  })
})

describe('排序切换', () => {
  it('切换排序会带上 sort 参数并重置列表', async () => {
    const store = useStore()
    store.posts = [{ id: 1 }]
    apiMock.mockResolvedValue({ posts: [{ id: 2 }], total: 1 })
    await store.switchFeedSort('hot')
    expect(store.feedSort).toBe('hot')
    // offset 必须是 0（重置），否则会接着旧列表翻页
    expect(apiMock).toHaveBeenCalledWith('/posts?limit=10&offset=0&sort=hot')
    expect(store.posts.map((p) => p.id)).toEqual([2])
  })

  it('点击当前排序不做重复请求', async () => {
    const store = useStore()
    store.feedSort = 'latest'
    await store.switchFeedSort('latest')
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('默认请求带 latest，保证首屏与后端默认一致', async () => {
    const store = useStore()
    apiMock.mockResolvedValue({ posts: [], total: 0 })
    await store.loadFeed(true)
    expect(apiMock).toHaveBeenCalledWith('/posts?limit=10&offset=0&sort=latest')
  })
})

describe('站内通知', () => {
  it('未登录不请求未读数，直接归零', async () => {
    const store = useStore()
    store.user = null
    store.notificationUnread = 5
    await store.loadUnreadCount()
    expect(apiMock).not.toHaveBeenCalled()
    expect(store.notificationUnread).toBe(0)
  })

  it('未登录点通知跳登录页', async () => {
    const store = useStore()
    store.user = null
    await store.openNotifications()
    expect(pushMock).toHaveBeenCalledWith('/login')
    expect(store.showNotifications).toBe(false)
  })

  it('打开通知会拉第一页并同步未读数', async () => {
    const store = useStore()
    store.user = { id: 1, name: '我', role: 'user' }
    apiMock.mockResolvedValue({
      notifications: [{ id: 11, type: 'like', is_read: 0, post_id: 5 }],
      total: 1,
      unread: 1,
    })
    await store.openNotifications()
    expect(store.showNotifications).toBe(true)
    expect(store.notifications.length).toBe(1)
    expect(store.notificationUnread).toBe(1)
    expect(apiMock).toHaveBeenCalledWith('/notifications?limit=20&offset=0')
  })

  it('全部已读把列表内所有通知标记为已读', async () => {
    const store = useStore()
    store.user = { id: 1, name: '我', role: 'user' }
    store.notifications = [
      { id: 1, is_read: 0 },
      { id: 2, is_read: 0 },
    ]
    store.notificationUnread = 2
    apiMock.mockResolvedValue({ unread: 0 })
    await store.markNotificationsRead()
    expect(apiMock).toHaveBeenCalledWith('/notifications/read', { method: 'POST', body: JSON.stringify({}) })
    expect(store.notifications.every((n) => n.is_read === 1)).toBe(true)
    expect(store.notificationUnread).toBe(0)
  })

  it('点单条通知：标记已读、关闭浮层并跳到帖子', async () => {
    const store = useStore()
    store.user = { id: 1, name: '我', role: 'user' }
    store.notifications = [{ id: 7, is_read: 0, post_id: 42, post_deleted: false }]
    store.showNotifications = true
    apiMock.mockResolvedValue({ unread: 0 })
    store.openNotification(store.notifications[0])
    expect(store.showNotifications).toBe(false)
    expect(pushMock).toHaveBeenCalledWith('/post/42')
  })

  it('内容已删除的通知不跳转', async () => {
    const store = useStore()
    store.user = { id: 1, name: '我', role: 'user' }
    apiMock.mockResolvedValue({ unread: 0 })
    store.openNotification({ id: 8, is_read: 0, post_id: 42, post_deleted: true })
    expect(pushMock).not.toHaveBeenCalledWith('/post/42')
  })
})

describe('用户治理', () => {
  it('确认后按 action 调用治理接口并就地更新该行', async () => {
    const store = useStore()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    store.adminUsers = [{ id: 3, name: '目标', status: 'active', muted: 0 }]
    apiMock.mockImplementation((url) => {
      if (url === '/admin/stats')
        return Promise.resolve({ posts: 0, communities: 0, users: 1, reports: 0, banned: 1, muted: 0 })
      return Promise.resolve({
        ok: true,
        message: '已封禁该用户',
        user: { id: 3, name: '目标', status: 'banned', muted: 0 },
      })
    })
    await store.setUserState(store.adminUsers[0], 'ban')
    expect(apiMock).toHaveBeenCalledWith('/admin/users/3/state', {
      method: 'POST',
      body: JSON.stringify({ action: 'ban' }),
    })
    expect(store.adminUsers[0].status).toBe('banned')
    window.confirm.mockRestore()
  })

  it('取消确认则不发请求', async () => {
    const store = useStore()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await store.setUserState({ id: 3, name: '目标' }, 'ban')
    expect(apiMock).not.toHaveBeenCalled()
    window.confirm.mockRestore()
  })

  it('禁言会带上时长参数', async () => {
    const store = useStore()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    store.adminUsers = [{ id: 4, name: '目标', status: 'active', muted: 0 }]
    apiMock.mockImplementation((url) => {
      if (url === '/admin/stats') return Promise.resolve({})
      return Promise.resolve({ ok: true, message: '已禁言 24 小时', user: { id: 4, muted: 1 } })
    })
    await store.setUserState(store.adminUsers[0], 'mute', 24)
    expect(apiMock).toHaveBeenCalledWith('/admin/users/4/state', {
      method: 'POST',
      body: JSON.stringify({ action: 'mute', hours: 24 }),
    })
    expect(store.adminUsers[0].muted).toBe(1)
    window.confirm.mockRestore()
  })
})

describe('帖子运营', () => {
  it('置顶开关取反并同步各列表的标记', async () => {
    const store = useStore()
    const p = { id: 6, pinned: 0, featured: 0 }
    store.adminPosts = [p]
    store.posts = [{ id: 6, pinned: 0, featured: 0 }]
    apiMock.mockResolvedValue({ ok: true, post: { id: 6, pinned: 1, featured: 0 } })
    await store.togglePostFlag(p, 'pinned')
    expect(apiMock).toHaveBeenCalledWith('/admin/posts/6/flags', {
      method: 'POST',
      body: JSON.stringify({ pinned: true }),
    })
    expect(store.adminPosts[0].pinned).toBe(1)
    expect(store.posts[0].pinned).toBe(1)
  })

  it('已置顶的帖子再次点击会取消置顶', async () => {
    const store = useStore()
    const p = { id: 6, pinned: 1, featured: 0 }
    store.adminPosts = [p]
    apiMock.mockResolvedValue({ ok: true, post: { id: 6, pinned: 0, featured: 0 } })
    await store.togglePostFlag(p, 'pinned')
    expect(apiMock).toHaveBeenCalledWith('/admin/posts/6/flags', {
      method: 'POST',
      body: JSON.stringify({ pinned: false }),
    })
    expect(p.pinned).toBe(0)
  })
})

describe('发帖', () => {
  it('编辑模式：PUT 更新后跳回来源页', async () => {
    const store = useStore()
    store.editingPost = { id: 5 }
    store.post = { title: '新题', content: '新内容', communityId: 1, images: [], video: null }
    store.writeFrom = 'post'
    store.selectedPost = { id: 5 }
    apiMock.mockResolvedValue({ id: 5, title: '新题', content: '新内容' })
    store.loadFeed = vi.fn().mockResolvedValue()
    store.loadCommunities = vi.fn().mockResolvedValue()
    store.loadMyPosts = vi.fn().mockResolvedValue()
    store.loadCommunityFeed = vi.fn().mockResolvedValue()
    await store.publish()
    expect(apiMock).toHaveBeenCalledWith('/posts/5', {
      method: 'PUT',
      body: JSON.stringify({ title: '新题', content: '新内容', communityId: 1 }),
    })
    expect(pushMock).toHaveBeenCalledWith('/post/5')
    expect(store.editingPost).toBeNull()
  })
})
