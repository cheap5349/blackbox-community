// 全局状态 store：承接 App.vue 全部数据逻辑，组件经 useStore() 访问
// 路由懒加载让 router.js 不静态依赖 views，store → router 的导入不构成循环
import { reactive } from 'vue'
import { router } from './router.js'
import { api, setUnauthorizedHandler } from './api.js'
import { useToasts } from './composables/useToasts.js'
import { useReveal } from './composables/useReveal.js'
import {
  starterPosts,
  starterCommunities,
  treeholeTags,
  reportReasons,
  mediaOf,
  initials,
  relativeDate,
  joinDate,
  likeCount,
} from './utils.js'

const { toast } = useToasts()
const { refresh: refreshReveals } = useReveal()

const store = reactive({
  /* ===== 基础 ===== */
  user: JSON.parse(localStorage.user || 'null'),
  error: '',

  /* ===== 发现页 ===== */
  posts: [],
  postTotal: starterPosts.length,
  feedLoading: false,
  // 排序：latest 最新 / hot 热门（点赞+2×评论，带时间衰减）/ featured 精华
  feedSort: 'latest',

  /* ===== 站内通知 ===== */
  showNotifications: false,
  notifications: [],
  notificationTotal: 0,
  notificationUnread: 0,
  notificationLoading: false,

  /* ===== 讨论区 ===== */
  treeholePosts: [],
  treeholeTotal: 0,
  treeholeLoading: false,
  treeholeTag: '',

  /* ===== 社区 ===== */
  communities: starterCommunities,
  selectedCommunity: null,
  communityPosts: [],
  communityFeedLoading: false,
  communityHasMore: false,

  /* ===== 认证 ===== */
  mode: 'login',
  form: { name: '', email: '', password: '' },
  authRedirect: '', // 受保护页面跳转登录后，登录成功回跳的目标路径
  profileDraft: {
    name: (JSON.parse(localStorage.user || 'null') || {}).name || '',
    avatar: '',
    bio: '',
    currentPassword: '',
    newPassword: '',
  },
  profileMessage: '',

  /* ===== 发帖 / 编辑 ===== */
  post: { title: '', content: '', communityId: '', images: [], video: null },
  postMessage: '',
  editingPost: null,
  writeFrom: 'home',
  postBack: '/',

  /* ===== 帖子详情 ===== */
  selectedPost: null,
  comments: [],
  commentTotal: 0,
  commentDraft: '',
  commentLoading: false,
  commentSending: false,

  /* ===== 我的 ===== */
  myPosts: [],
  myCommunities: [],

  /* ===== 社区创建 ===== */
  communityDraft: { name: '', description: '' },
  communityMessage: '',

  /* ===== 举报 ===== */
  reportTarget: null,
  reportReason: '',
  reportCustom: '',
  reportSending: false,

  /* ===== 搜索 ===== */
  showSearch: false,
  searchQ: '',
  searchResults: [],
  searchLoading: false,
  searchTotal: 0,

  /* ===== 管理后台 ===== */
  adminSub: 'posts',
  adminPosts: [],
  adminCommunities: [],
  adminUsers: [],
  adminReports: [],
  adminReportStatus: 'pending',
  adminTotal: 0,
  adminStats: { posts: 0, communities: 0, users: 0, reports: 0 },
  adminQ: '',
  adminLoading: false,
  adminHasMore: false,
  adminEdit: null,
  adminEditDraft: { title: '', content: '', communityId: '', name: '', description: '' },
  adminDeleteTarget: null,
  selectedUser: null,
  userPosts: [],
  userComments: [],
  userDetailTab: 'posts',
  userDetailLoading: false,

  /* ===== 派生状态 ===== */
  get onlineMembers() {
    return Math.max(12, Math.min(99, store.postTotal * 3 + 12))
  },
  get totalPostCount() {
    return store.communities.reduce((sum, item) => sum + Number(item.postCount || 0), 0)
  },
  get hasMoreHome() {
    return store.posts.length < store.postTotal
  },
  get hasMoreTreehole() {
    return store.treeholePosts.length < store.treeholeTotal
  },
  get hasMoreCommunity() {
    return store.communityHasMore
  },
  get isAdmin() {
    return store.user?.role === 'admin'
  },
  get filteredPosts() {
    if (!store.treeholeTag) return store.treeholePosts
    return store.treeholePosts.filter((p) =>
      `${p.title || ''}${p.content || ''}${p.community || ''}`.includes(store.treeholeTag)
    )
  },
  get treeholeCommunity() {
    return store.communities.find((c) => c.name === '讨论区') || null
  },
  get treeholeTags() {
    return treeholeTags
  },
  get reportReasons() {
    return reportReasons
  },
  get initials() {
    return initials
  },
  get relativeDate() {
    return relativeDate
  },
  get joinDate() {
    return joinDate
  },
  get likeCount() {
    return likeCount
  },

  /* ===== 点赞 ===== */
  applyLikeState(id, liked, count) {
    const patch = (x) => {
      if (x && x.id === id) {
        x.liked = liked
        x.like_count = count
      }
    }
    store.posts.forEach(patch)
    store.treeholePosts.forEach(patch)
    store.communityPosts.forEach(patch)
    store.myPosts.forEach(patch)
    if (store.selectedPost) patch(store.selectedPost)
  },
  async toggleLike(p) {
    if (!p?.id) return
    if (!store.user) {
      router.push('/login')
      toast('登录后才能点赞', 'error')
      return
    }
    const willLike = !p.liked
    try {
      const data = await api(`/posts/${p.id}/like`, { method: willLike ? 'POST' : 'DELETE' })
      store.applyLikeState(p.id, data.liked, data.likeCount)
    } catch (e) {
      toast(e.message, 'error')
    }
  },

  /* ===== 评论 ===== */
  applyCommentCount(id, total) {
    const patch = (x) => {
      if (x && x.id === id) x.comment_count = total
    }
    store.posts.forEach(patch)
    store.treeholePosts.forEach(patch)
    store.communityPosts.forEach(patch)
    store.myPosts.forEach(patch)
    if (store.selectedPost) patch(store.selectedPost)
  },
  async loadComments() {
    if (!store.selectedPost) return
    try {
      store.commentLoading = true
      const data = await api(`/posts/${store.selectedPost.id}/comments`)
      store.comments = data.comments || []
      store.commentTotal = data.total || 0
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      store.commentLoading = false
    }
  },
  async submitComment() {
    const content = store.commentDraft.trim()
    if (!content) return
    if (!store.user) {
      router.push('/login')
      toast('登录后才能评论', 'error')
      return
    }
    try {
      store.commentSending = true
      const data = await api(`/posts/${store.selectedPost.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      store.comments.push(data.comment)
      store.commentTotal = data.total
      store.commentDraft = ''
      store.applyCommentCount(store.selectedPost.id, data.total)
      toast('评论已发布')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      store.commentSending = false
    }
  },
  async removeComment(c) {
    if (!window.confirm('确定删除这条评论吗？')) return
    try {
      const data = await api(`/posts/comments/${c.id}`, { method: 'DELETE' })
      store.comments = store.comments.filter((x) => x.id !== c.id)
      store.commentTotal = data.total
      store.applyCommentCount(store.selectedPost.id, data.total)
      toast('评论已删除')
    } catch (e) {
      toast(e.message, 'error')
    }
  },

  /* ===== 数据加载 ===== */
  async loadFeed(reset = false) {
    try {
      store.feedLoading = true
      const sort = store.feedSort || 'latest'
      const data = await api(
        `/posts?limit=10&offset=${reset ? 0 : store.posts.length}&sort=${encodeURIComponent(sort)}`
      )
      const list = (data.posts || []).map((p) => ({ ...p, media: mediaOf(p) }))
      if (reset && !list.length && !data.total) {
        store.posts = [...starterPosts]
        store.postTotal = starterPosts.length
      } else {
        store.posts = reset ? list : [...store.posts, ...list]
        store.postTotal = data.total || 0
      }
    } catch (e) {
      if (!store.posts.length) {
        store.posts = [...starterPosts]
        store.postTotal = starterPosts.length
      }
      store.error = e.message
    } finally {
      store.feedLoading = false
      refreshReveals()
    }
  },
  /* 切换排序：重置列表并重新拉第一页 */
  switchFeedSort(sort) {
    if (store.feedSort === sort) return
    store.feedSort = sort
    return store.loadFeed(true)
  },
  async loadTreeholeFeed(reset = false) {
    const cid = store.treeholeCommunity?.id
    if (!cid) {
      store.treeholePosts = []
      store.treeholeTotal = 0
      return
    }
    try {
      store.treeholeLoading = true
      const data = await api(`/posts?limit=10&offset=${reset ? 0 : store.treeholePosts.length}&communityId=${cid}`)
      const list = (data.posts || []).map((p) => ({ ...p, media: mediaOf(p) }))
      store.treeholePosts = reset ? list : [...store.treeholePosts, ...list]
      store.treeholeTotal = data.total || 0
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      store.treeholeLoading = false
      refreshReveals()
    }
  },
  async loadCommunities() {
    try {
      store.communities = await api('/communities')
    } catch {
      /* 保留欢迎数据 */
    }
  },
  async load() {
    try {
      await Promise.all([store.loadFeed(true), store.loadCommunities()])
    } catch {
      /* 数据库未就绪时保留欢迎数据 */
    }
  },

  /* ===== 认证 ===== */
  async submitAuth() {
    try {
      store.error = ''
      const data = await api(store.mode === 'register' ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(store.form),
      })
      localStorage.token = data.token
      localStorage.user = JSON.stringify(data.user)
      if (data.expires_at) localStorage.expiresAt = data.expires_at
      store.user = data.user
      store.form = { name: '', email: '', password: '' }
      router.push(store.authRedirect || '/')
      store.authRedirect = ''
      toast(store.mode === 'register' ? '注册成功，欢迎加入黑盒' : '欢迎回来')
    } catch (e) {
      store.error = e.message
    }
  },
  logout() {
    localStorage.clear()
    store.user = null
    store.myPosts = []
    store.myCommunities = []
    router.push('/')
  },
  async loadMyPosts() {
    if (!store.user) {
      store.myPosts = []
      return
    }
    try {
      const data = await api(`/posts?userId=${store.user.id}&limit=20`)
      store.myPosts = (data.posts || []).map((p) => ({ ...p, media: mediaOf(p) }))
    } catch {}
  },
  async loadMyCommunities() {
    if (!store.user) {
      store.myCommunities = []
      return
    }
    try {
      store.myCommunities = await api(`/communities?ownerId=${store.user.id}`)
    } catch {}
  },
  async openProfile() {
    if (!store.user) {
      router.push('/login')
      return
    }
    store.profileDraft = {
      name: store.user.name,
      avatar: store.user.avatar || '',
      bio: store.user.bio || '',
      currentPassword: '',
      newPassword: '',
    }
    store.profileMessage = ''
    router.push('/profile')
    await Promise.all([store.loadMyPosts(), store.loadMyCommunities()])
  },
  async saveProfile() {
    try {
      store.profileMessage = ''
      const data = await api('/auth/me', { method: 'PUT', body: JSON.stringify(store.profileDraft) })
      localStorage.token = data.token
      localStorage.user = JSON.stringify(data.user)
      if (data.expires_at) localStorage.expiresAt = data.expires_at
      store.user = data.user
      store.profileDraft = {
        name: data.user.name,
        avatar: data.user.avatar || '',
        bio: data.user.bio || '',
        currentPassword: '',
        newPassword: '',
      }
      store.profileMessage = ''
      toast('资料已保存')
    } catch (e) {
      store.profileMessage = e.message
    }
  },
  async refreshMe() {
    if (!localStorage.token) return
    try {
      const me = await api('/auth/me')
      localStorage.user = JSON.stringify(me)
      store.user = me
    } catch (e) {
      // 被封禁：服务端明确告知，清理本地会话并给出可执行的提示，
      // 而不是含糊地说「登录已过期」——用户会一直重试登录。
      if (e.code === 'ACCOUNT_BANNED' || (e.status === 403 && /封禁/.test(e.message))) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        localStorage.removeItem('expiresAt')
        store.user = null
        store.notificationUnread = 0
        toast('你的账号已被封禁，如有疑问请联系管理员', 'error')
        return
      }
      // token 过期：api() 已清理会话，这里补一条可见提示
      if (e.status === 401) toast('登录已过期，请重新登录', 'error')
    }
  },
  chooseAvatar(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      store.profileMessage = '请选择图片文件'
      return
    }
    if (file.size > 5_000_000) {
      store.profileMessage = '头像图片请控制在 5 MB 以内'
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 512
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        // 压缩后转 Blob 上传为文件，避免把 base64 写进数据库
        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              store.profileMessage = '图片处理失败，请重试'
              return
            }
            const form = new FormData()
            form.append('avatar', blob, 'avatar.jpg')
            try {
              store.profileMessage = '正在上传头像…'
              const data = await api('/auth/avatar', { method: 'POST', body: form })
              store.profileDraft.avatar = data.avatar
              store.profileMessage = '新头像已准备好，保存后生效'
            } catch (e) {
              store.profileMessage = e.message
            }
          },
          'image/jpeg',
          0.85
        )
      }
      img.onerror = () => {
        store.profileMessage = '无法读取该图片，请换一张试试'
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  },

  /* ===== 发帖 / 编辑 ===== */
  async publish() {
    try {
      store.postMessage = ''
      if (store.editingPost) {
        const saved = await api(`/posts/${store.editingPost.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: store.post.title,
            content: store.post.content,
            communityId: store.post.communityId,
          }),
        })
        store.editingPost = null
        store.post = { title: '', content: '', communityId: '', images: [], video: null }
        await Promise.all([store.loadFeed(true), store.loadCommunities(), store.loadMyPosts()])
        if (store.writeFrom === 'post' && store.selectedPost) {
          store.selectedPost = { ...saved, media: mediaOf(saved) }
          router.push('/post/' + saved.id)
        } else if (store.writeFrom === 'community' && store.selectedCommunity) {
          router.push('/community/' + store.selectedCommunity.id)
          await store.loadCommunityFeed(true)
        } else {
          router.push(store.writeFrom === 'profile' ? '/profile' : '/')
        }
        store.writeFrom = 'home'
        toast('帖子已更新')
        return
      }
      const body = new FormData()
      body.append('title', store.post.title)
      body.append('content', store.post.content)
      body.append('communityId', store.post.communityId)
      for (const file of store.post.images) body.append('images', file)
      if (store.post.video) body.append('video', store.post.video)
      await api('/posts', { method: 'POST', body })
      store.post = { title: '', content: '', communityId: '', images: [], video: null }
      await Promise.all([store.loadFeed(true), store.loadCommunities()])
      if (store.writeFrom === 'community' && store.selectedCommunity) {
        router.push('/community/' + store.selectedCommunity.id)
        await store.loadCommunityFeed(true)
      } else if (store.writeFrom === 'discussions') {
        router.push('/discussions')
        await store.loadTreeholeFeed(true)
      } else {
        router.push('/')
      }
      store.writeFrom = 'home'
      toast('帖子发布成功')
    } catch (e) {
      store.postMessage = e.message
    }
  },
  startWrite() {
    if (!store.user) {
      router.push('/login')
      return
    }
    const r = router.currentRoute.value
    if (r.path.startsWith('/community') && store.selectedCommunity) {
      store.writeFrom = 'community'
      store.post.communityId = store.selectedCommunity.id
    } else if (r.path.startsWith('/discussions')) {
      store.writeFrom = 'discussions'
      if (store.treeholeCommunity) store.post.communityId = store.treeholeCommunity.id
    } else {
      store.writeFrom = 'home'
    }
    router.push('/write')
  },
  writeToCommunity(c) {
    store.selectedCommunity = c
    store.post.communityId = c ? c.id : ''
    store.postMessage = ''
    store.writeFrom = 'community'
    router.push('/write')
  },
  writeToTreehole() {
    if (!store.user) {
      router.push('/login')
      return
    }
    if (!store.treeholeCommunity) {
      toast('树洞社区尚未就绪，请稍后再试', 'error')
      return
    }
    store.writeFrom = 'discussions'
    store.post.communityId = store.treeholeCommunity.id
    router.push('/write')
  },
  startEditPost(p) {
    if (!p) return
    const r = router.currentRoute.value
    const from = r.path.startsWith('/post') ? 'post' : 'profile'
    store.editingPost = { id: p.id }
    store.post = {
      title: p.title || '',
      content: p.content || '',
      communityId: p.community_id,
      images: [],
      video: null,
    }
    store.postMessage = ''
    store.writeFrom = from
    router.push('/write')
  },
  goBackFromWrite() {
    const from = store.writeFrom
    store.writeFrom = 'home'
    store.editingPost = null
    if (from === 'community' && store.selectedCommunity) store.openCommunity(store.selectedCommunity)
    else if (from === 'discussions') router.push('/discussions')
    else if (from === 'profile') router.push('/profile')
    else if (from === 'post') router.push(store.postBack || '/')
    else router.push('/')
  },

  /* ===== 社区 ===== */
  async createCommunity() {
    try {
      store.communityMessage = ''
      const created = await api('/communities', { method: 'POST', body: JSON.stringify(store.communityDraft) })
      store.communityDraft = { name: '', description: '' }
      await store.loadCommunities()
      router.push('/communities')
      toast(`「${created.name}」社区创建成功`)
    } catch (e) {
      store.communityMessage = e.message
    }
  },
  startCreateCommunity() {
    if (!store.user) {
      router.push('/login')
      return
    }
    store.communityMessage = ''
    router.push('/create-community')
  },
  goBackFromCreateCommunity() {
    store.communityMessage = ''
    router.push('/communities')
  },
  async openCommunity(c) {
    store.selectedCommunity = { ...c, media: [] }
    store.communityPosts = []
    store.communityHasMore = false
    router.push('/community/' + c.id)
    try {
      const detail = await api(`/communities/${c.id}`)
      if (detail) store.selectedCommunity = detail
    } catch (e) {
      store.error = e.message
    }
    await store.loadCommunityFeed(true)
  },
  async loadCommunityFeed(reset = false) {
    if (!store.selectedCommunity) return
    try {
      store.communityFeedLoading = true
      const limit = 10
      const data = await api(
        `/communities/${store.selectedCommunity.id}/posts?limit=${limit + 1}&offset=${reset ? 0 : store.communityPosts.length}`
      )
      const all = (data || []).map((p) => ({ ...p, media: mediaOf(p) }))
      store.communityPosts = reset ? all.slice(0, limit) : [...store.communityPosts, ...all.slice(0, limit)]
      store.communityHasMore = all.length > limit
    } catch (e) {
      store.error = e.message
    } finally {
      store.communityFeedLoading = false
      refreshReveals()
    }
  },

  /* ===== 讨论区 ===== */
  openDiscussions(tag = '') {
    // 防御：模板 @click 直接绑定时会传入事件对象，只接受字符串标签
    store.treeholeTag = typeof tag === 'string' ? tag : ''
    router.push('/discussions')
    store.loadTreeholeFeed(true)
  },

  /* ===== 帖子详情 ===== */
  openPost(p) {
    const r = router.currentRoute.value
    store.postBack = r.path.startsWith('/community') ? r.path : r.path.startsWith('/discussions') ? '/discussions' : '/'
    store.selectedPost = { ...p, media: mediaOf(p) }
    store.comments = []
    store.commentTotal = 0
    store.commentDraft = ''
    router.push('/post/' + p.id)
    store.loadComments()
    // 拉取详情刷新点赞/评论/举报状态（如 "我是否已举报"）
    api(`/posts/${p.id}`)
      .then((detail) => {
        if (detail && store.selectedPost && store.selectedPost.id === p.id)
          store.selectedPost = { ...detail, media: mediaOf(detail) }
      })
      .catch(() => {})
  },
  goBackFromPost() {
    router.push(store.postBack || '/')
  },

  /* ===== 举报 ===== */
  openReport(p) {
    if (!store.user) {
      router.push('/login')
      toast('登录后才能举报', 'error')
      return
    }
    if (p.user_id === store.user.id) {
      toast('不能举报自己的帖子', 'error')
      return
    }
    store.reportTarget = p
    store.reportReason = ''
    store.reportCustom = ''
  },
  closeReport() {
    store.reportTarget = null
  },
  async submitReport() {
    if (!store.reportTarget) return
    const reason = store.reportReason === '其他' ? store.reportCustom.trim() : store.reportReason
    if (!reason) {
      toast('请填写举报理由', 'error')
      return
    }
    try {
      store.reportSending = true
      const data = await api(`/posts/${store.reportTarget.id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      if (store.selectedPost && store.selectedPost.id === store.reportTarget.id) store.selectedPost.reported = 1
      store.closeReport()
      toast(data.message || '举报已提交')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      store.reportSending = false
    }
  },

  /* ===== 删除我的帖子 ===== */
  async deleteMyPost(p) {
    if (!window.confirm(`确定删除帖子「${p.title}」吗？删除后无法恢复。`)) return
    try {
      await api(`/posts/${p.id}`, { method: 'DELETE' })
      toast('帖子已删除')
      await Promise.all([store.loadMyPosts(), store.loadFeed(true)])
    } catch (e) {
      toast(e.message, 'error')
    }
  },

  /* ===== 站内通知 ===== */
  async loadNotifications(reset = false) {
    if (!store.user) {
      store.notifications = []
      store.notificationUnread = 0
      return
    }
    try {
      store.notificationLoading = true
      const offset = reset ? 0 : store.notifications.length
      const data = await api(`/notifications?limit=20&offset=${offset}`)
      const list = data.notifications || []
      store.notifications = reset ? list : [...store.notifications, ...list]
      store.notificationTotal = data.total || 0
      store.notificationUnread = data.unread || 0
    } catch {
      /* 通知是辅助信息，失败时静默不打扰 */
    } finally {
      store.notificationLoading = false
    }
  },
  /* 未读数轮询：只取角标，开销最小 */
  async loadUnreadCount() {
    if (!store.user) {
      store.notificationUnread = 0
      return
    }
    try {
      const data = await api('/notifications/unread')
      store.notificationUnread = data.unread || 0
    } catch {
      /* 轮询失败不提示 */
    }
  },
  async openNotifications() {
    if (!store.user) {
      router.push('/login')
      toast('登录后查看通知', 'error')
      return
    }
    store.showNotifications = true
    await store.loadNotifications(true)
  },
  closeNotifications() {
    store.showNotifications = false
  },
  async markNotificationsRead(id = null) {
    try {
      const data = await api('/notifications/read', { method: 'POST', body: JSON.stringify(id ? { id } : {}) })
      store.notificationUnread = data.unread || 0
      if (id) {
        const hit = store.notifications.find((n) => n.id === id)
        if (hit) hit.is_read = 1
      } else {
        store.notifications.forEach((n) => {
          n.is_read = 1
        })
      }
    } catch (e) {
      toast(e.message, 'error')
    }
  },
  /* 点通知：标记已读并跳到对应帖子 */
  openNotification(n) {
    store.markNotificationsRead(n.id)
    store.closeNotifications()
    if (n.post_id && !n.post_deleted) router.push(`/post/${n.post_id}`)
    else if (n.post_deleted) toast('该内容已被删除', 'error')
  },

  /* ===== 管理后台 ===== */
  async openAdmin() {
    if (!store.isAdmin) {
      router.push('/')
      return
    }
    store.adminSub = 'posts'
    store.adminReportStatus = 'pending'
    store.adminEdit = null
    store.adminDeleteTarget = null
    store.selectedUser = null
    router.push('/admin')
    await Promise.all([store.loadAdminStats(), store.loadAdminList(true)])
  },
  switchAdmin(sub) {
    store.adminSub = sub
    store.adminQ = ''
    store.adminReportStatus = 'pending'
    store.selectedUser = null
    return store.loadAdminList(true)
  },
  async loadAdminStats() {
    try {
      store.adminStats = await api('/admin/stats')
    } catch (e) {
      toast(e.message, 'error')
    }
  },
  adminListRef() {
    return store.adminSub === 'posts'
      ? store.adminPosts
      : store.adminSub === 'users'
        ? store.adminUsers
        : store.adminSub === 'communities'
          ? store.adminCommunities
          : store.adminReports
  },
  async loadAdminList(reset = false) {
    const sub = store.adminSub
    try {
      store.adminLoading = true
      const offset = reset ? 0 : store.adminListRef().length
      const qs = store.adminQ ? `&q=${encodeURIComponent(store.adminQ)}` : ''
      const statusQs = sub === 'reports' && store.adminReportStatus ? `&status=${store.adminReportStatus}` : ''
      const data = await api(`/admin/${sub}?limit=20&offset=${offset}${qs}${statusQs}`)
      store.adminTotal = data.total || 0
      if (sub === 'posts') {
        const list = (data.posts || []).map((p) => ({ ...p, media: mediaOf(p) }))
        store.adminPosts = reset ? list : [...store.adminPosts, ...list]
      } else if (sub === 'users') {
        store.adminUsers = reset ? data.users || [] : [...store.adminUsers, ...(data.users || [])]
      } else if (sub === 'communities') {
        const list = (data.communities || []).map((c) => ({ ...c, postCount: Number(c.postCount || 0) }))
        store.adminCommunities = reset ? list : [...store.adminCommunities, ...list]
      } else {
        store.adminReports = reset ? data.reports || [] : [...store.adminReports, ...(data.reports || [])]
      }
      store.adminHasMore = store.adminListRef().length < store.adminTotal
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      store.adminLoading = false
      refreshReveals()
    }
  },
  /* ===== 用户治理：封禁 / 禁言 / 角色 ===== */
  async setUserState(u, action, hours) {
    const labels = {
      ban: `确定封禁「${u.name}」吗？该用户将无法登录，且现有会话立即失效。`,
      unban: `确定解除「${u.name}」的封禁吗？`,
      mute: `确定禁言「${u.name}」${hours} 小时吗？期间无法发帖、评论和点赞。`,
      unmute: `确定解除「${u.name}」的禁言吗？`,
      promote: `确定把「${u.name}」设为管理员吗？`,
      demote: `确定撤销「${u.name}」的管理员身份吗？`,
    }
    if (!window.confirm(labels[action] || '确定执行该操作吗？')) return
    try {
      const body = hours ? { action, hours } : { action }
      const data = await api(`/admin/users/${u.id}/state`, { method: 'POST', body: JSON.stringify(body) })
      toast(data.message || '操作完成')
      // 用服务端返回的最新记录就地更新，避免整页重拉
      if (data.user) {
        const hit = store.adminUsers.find((x) => x.id === data.user.id)
        if (hit) Object.assign(hit, data.user)
        if (store.selectedUser?.id === data.user.id) Object.assign(store.selectedUser, data.user)
      }
      await store.loadAdminStats()
    } catch (e) {
      toast(e.message, 'error')
    }
  },
  /* ===== 帖子运营：置顶 / 加精 ===== */
  async togglePostFlag(p, flag) {
    try {
      const body = { [flag]: !p[flag] }
      const data = await api(`/admin/posts/${p.id}/flags`, { method: 'POST', body: JSON.stringify(body) })
      const next = data.post
      const patch = (x) => {
        if (x && x.id === p.id) {
          x.pinned = next.pinned
          x.featured = next.featured
        }
      }
      store.adminPosts.forEach(patch)
      store.posts.forEach(patch)
      store.selectedPost && patch(store.selectedPost)
      toast(flag === 'pinned' ? (next.pinned ? '已置顶' : '已取消置顶') : next.featured ? '已加精' : '已取消加精')
    } catch (e) {
      toast(e.message, 'error')
    }
  },
  async resolveReport(r, action) {
    if (action === 'delete' && !window.confirm(`确定删除帖子「${r.post_title}」并结案吗？删除后无法恢复。`)) return
    try {
      await api(`/admin/reports/${r.id}/resolve`, { method: 'POST', body: JSON.stringify({ action }) })
      toast(action === 'delete' ? '已删除帖子并结案' : '已忽略该举报')
      await Promise.all([
        store.loadAdminList(true),
        store.loadAdminStats(),
        store.loadFeed(true),
        store.loadCommunities(),
      ])
    } catch (e) {
      toast(e.message, 'error')
    }
  },
  openUserDetail(u) {
    store.selectedUser = u
    store.userDetailTab = 'posts'
    store.loadUserDetail()
  },
  async loadUserDetail() {
    if (!store.selectedUser) return
    try {
      store.userDetailLoading = true
      const [posts, comments] = await Promise.all([
        api(`/admin/users/${store.selectedUser.id}/posts?limit=50`),
        api(`/admin/users/${store.selectedUser.id}/comments?limit=50`),
      ])
      store.userPosts = (posts.posts || []).map((p) => ({ ...p, media: mediaOf(p) }))
      store.userComments = comments.comments || []
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      store.userDetailLoading = false
    }
  },
  async deleteUserComment(c) {
    if (!window.confirm('确定删除这条评论吗？')) return
    try {
      await api(`/posts/comments/${c.id}`, { method: 'DELETE' })
      toast('评论已删除')
      await Promise.all([store.loadUserDetail(), store.loadAdminList(true)])
    } catch (e) {
      toast(e.message, 'error')
    }
  },
  openAdminEdit(type, item) {
    store.adminEdit = { type, id: item.id }
    store.adminEditDraft =
      type === 'post'
        ? { title: item.title, content: item.content || '', communityId: item.community_id, name: '', description: '' }
        : { title: '', content: '', communityId: '', name: item.name, description: item.description || '' }
  },
  async saveAdminEdit() {
    try {
      const e = store.adminEdit
      const url = e.type === 'post' ? `/posts/${e.id}` : `/communities/${e.id}`
      const body =
        e.type === 'post'
          ? {
              title: store.adminEditDraft.title,
              content: store.adminEditDraft.content,
              communityId: store.adminEditDraft.communityId,
            }
          : { name: store.adminEditDraft.name, description: store.adminEditDraft.description }
      await api(url, { method: 'PUT', body: JSON.stringify(body) })
      store.adminEdit = null
      toast('修改已保存')
      await Promise.all([
        store.loadAdminList(true),
        store.loadAdminStats(),
        store.loadFeed(true),
        store.loadCommunities(),
      ])
      if (store.selectedUser && e.type === 'post') await store.loadUserDetail()
    } catch (e) {
      toast(e.message, 'error')
    }
  },
  confirmAdminDelete(type, item) {
    store.adminDeleteTarget = { type, id: item.id, title: item.title || item.name || '这条内容' }
  },
  async doAdminDelete() {
    try {
      const t = store.adminDeleteTarget
      await api(`/${t.type}s/${t.id}`, { method: 'DELETE' })
      store.adminDeleteTarget = null
      toast('已删除')
      await Promise.all([
        store.loadAdminList(true),
        store.loadAdminStats(),
        store.loadFeed(true),
        store.loadCommunities(),
      ])
      if (store.selectedUser && t.type === 'post') await store.loadUserDetail()
    } catch (e) {
      toast(e.message, 'error')
    }
  },

  /* ===== 搜索 ===== */
  openSearch() {
    store.showSearch = true
    store.searchQ = ''
    store.searchResults = []
    store.searchTotal = 0
    requestAnimationFrame(() => {
      const el = document.querySelector('.search-input')
      if (el) el.focus()
    })
  },
  closeSearch() {
    store.showSearch = false
    if (store._searchTimer) clearTimeout(store._searchTimer)
  },
  runSearch() {
    const q = store.searchQ.trim()
    if (!q) {
      store.searchResults = []
      store.searchTotal = 0
      return
    }
    if (store._searchTimer) clearTimeout(store._searchTimer)
    store._searchTimer = setTimeout(async () => {
      try {
        store.searchLoading = true
        const data = await api(`/posts?q=${encodeURIComponent(q)}&limit=12`)
        store.searchResults = (data.posts || []).map((p) => ({ ...p, media: mediaOf(p) }))
        store.searchTotal = data.total || 0
      } catch (e) {
        toast(e.message, 'error')
      } finally {
        store.searchLoading = false
      }
    }, 280)
  },
  pickSearch(p) {
    store.closeSearch()
    store.openPost(p)
  },
})

// api() 401 时通知 store 清空登录态
setUnauthorizedHandler(() => {
  store.user = null
})

export function useStore() {
  return store
}
