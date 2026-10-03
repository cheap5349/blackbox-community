// 静态演示模式：GitHub Pages 这类纯静态托管下没有 Express + MySQL 后端，
// 于是用内置示例数据顶替接口，让开场动画、主题背景、图标、性能徽标与播放器
// 都能在公开链接上被看到。写入类操作一律以可读的中文提示拒绝，而不是抛 404。
//
// 开关：构建时设置 VITE_DEMO=1（见 .github/workflows/pages.yml）。
// 默认（本地开发 / 生产部署）DEMO_MODE 为 false，走的仍是真实接口。
export const DEMO_MODE = import.meta.env?.VITE_DEMO === '1'

export const DEMO_NOTICE = '静态演示版 · 数据为内置示例，登录 / 发帖 / 点赞需在本机运行后端'

export const DEMO_WRITE_MESSAGE =
  '静态演示版是只读的：登录、发帖、点赞、评论等操作需要在本机运行后端（npm run dev）后再体验'

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600_000).toISOString()

export const demoCommunities = [
  { id: 'music', name: '音乐角落', description: '分享旋律、歌单与那些值得反复聆听的时刻。', postCount: 3 },
  { id: 'photo', name: '镜头之外', description: '交换摄影灵感，收藏光影与城市的呼吸。', postCount: 3 },
  { id: 'ideas', name: '灵感实验室', description: '把脑海里的点子、设计与代码慢慢做成作品。', postCount: 3 },
  { id: 'discussion', name: '讨论区', description: '不记名的树洞：把不好开口的话写在这里。', postCount: 3 },
  { id: 'tech', name: '技术闲聊', description: '前端、后端、部署与那些踩过的坑。', postCount: 2 },
]

const post = (o) => ({
  user_id: 0,
  author_avatar: null,
  media: [],
  pinned: 0,
  featured: 0,
  liked: 0,
  reported: 0,
  ...o,
})

export const demoPosts = [
  post({
    id: 101,
    author: '阿澄',
    community_id: 'music',
    community: '音乐角落',
    title: '周末歌单：把黄昏留在耳机里',
    content: '整理了一组适合傍晚散步时听的歌。没有复杂的编排，只有一点点温柔和刚好落下的夕阳。',
    created_at: hoursAgo(2),
    like_count: 42,
    comment_count: 6,
    featured: 1,
  }),
  post({
    id: 102,
    author: '快门手',
    community_id: 'photo',
    community: '镜头之外',
    title: '柔光里的元气瞬间',
    content: '在公园拍到一组逆光人像，风吹起发丝的时候，连普通的下午也有了电影感。',
    created_at: hoursAgo(20),
    like_count: 31,
    comment_count: 4,
  }),
  post({
    id: 103,
    author: '星尘',
    community_id: 'ideas',
    community: '灵感实验室',
    title: '给社区做了一张暖色调海报',
    content: '试着用纸张纹理、低饱和配色和一点微动效，把“相遇”这件事做得更有温度。',
    created_at: hoursAgo(30),
    like_count: 58,
    comment_count: 9,
    featured: 1,
  }),
  post({
    id: 104,
    author: '夜航',
    community_id: 'music',
    community: '音乐角落',
    title: '黑胶转起来的那一下，噪声也是音乐',
    content: '把唱针落下去，先来的是一点底噪，然后才是旋律。这种不完美反而让人放松。',
    created_at: hoursAgo(44),
    like_count: 27,
    comment_count: 3,
  }),
  post({
    id: 105,
    author: '匿名',
    community_id: 'discussion',
    community: '讨论区',
    title: '深夜睡不着的时候，你们都在做什么',
    content: '最近总是躺下就开始想白天说错的那句话。想问问大家，有没有什么让自己安静下来的办法。',
    created_at: hoursAgo(6),
    like_count: 19,
    comment_count: 12,
  }),
  post({
    id: 106,
    author: '小叶',
    community_id: 'tech',
    community: '技术闲聊',
    title: 'Vue 3 组合式函数里的一个常见坑',
    content: '模块级单例 ref 用起来很顺手，但组件卸载时要记得清理定时器和 rAF，不然页面切换几次就漏了。',
    created_at: hoursAgo(10),
    like_count: 63,
    comment_count: 7,
    featured: 1,
  }),
  post({
    id: 107,
    author: '匿名',
    community_id: 'discussion',
    community: '讨论区',
    title: '今天有点撑不住了',
    content: '工作上的事一件接一件，谁也没说，只是想找个地方写下来。写出来好像就轻了一点点。',
    created_at: hoursAgo(33),
    like_count: 88,
    comment_count: 15,
  }),
  post({
    id: 108,
    author: '麦田',
    community_id: 'photo',
    community: '镜头之外',
    title: '城市夜跑的光轨',
    content: '用 4 秒快门对着路口拍了二十张，最后留下的这张里，红灯刚好亮起来。',
    created_at: hoursAgo(52),
    like_count: 35,
    comment_count: 5,
    pinned: 1,
  }),
  post({
    id: 109,
    author: '白噪音',
    community_id: 'ideas',
    community: '灵感实验室',
    title: '把想法做成原型的三个步骤',
    content: '先写一句话说明它解决什么问题，再画一张最丑的草图，最后只做能跑通的那一步。',
    created_at: hoursAgo(60),
    like_count: 24,
    comment_count: 2,
  }),
  post({
    id: 110,
    author: '匿名',
    community_id: 'discussion',
    community: '讨论区',
    title: '关于“合群”这件事',
    content: '发现自己在热闹里反而更累。是不是也有人和我一样，更喜欢安静地在旁边待着。',
    created_at: hoursAgo(72),
    like_count: 46,
    comment_count: 8,
  }),
  post({
    id: 111,
    author: '老陈',
    community_id: 'tech',
    community: '技术闲聊',
    title: '接口限流的两种朴素做法',
    content: '单实例用内存计数最省事，多实例就得放到 Redis 或者网关，文档里写清楚前提比算法本身更重要。',
    created_at: hoursAgo(90),
    like_count: 41,
    comment_count: 6,
  }),
  post({
    id: 112,
    author: '蝉鸣',
    community_id: 'music',
    community: '音乐角落',
    title: '一首歌循环了整个下午',
    content: '有时候不是歌有多好，而是那个下午需要同一段旋律反复陪着。',
    created_at: hoursAgo(120),
    like_count: 30,
    comment_count: 4,
  }),
  post({
    id: 113,
    author: '灰蓝',
    community_id: 'photo',
    community: '镜头之外',
    title: '旧巷子里的猫',
    content: '它蹲在光斑里，等了很久才转过头来。快门声一响就跑了，只留下这一张。',
    created_at: hoursAgo(150),
    like_count: 52,
    comment_count: 3,
  }),
  post({
    id: 114,
    author: '纸飞机',
    community_id: 'ideas',
    community: '灵感实验室',
    title: '字体排印的一次小实验',
    content: '把标题的字距放大 4%，正文行高收到 1.7，整页的呼吸感就出来了。',
    created_at: hoursAgo(180),
    like_count: 18,
    comment_count: 1,
  }),
]

export const demoComments = [
  { id: 1, post_id: 101, author: '夜航', content: '第二首我循环了一整周，谢谢整理。', created_at: hoursAgo(1) },
  { id: 2, post_id: 101, author: '蝉鸣', content: '傍晚散步的配乐 +1', created_at: hoursAgo(1.5) },
  { id: 3, post_id: 105, author: '匿名', content: '我会起来写点东西，写到手酸就困了。', created_at: hoursAgo(4) },
  { id: 4, post_id: 105, author: '匿名', content: '试试把手机放到另一个房间，真的有用。', created_at: hoursAgo(5) },
  {
    id: 5,
    post_id: 106,
    author: '老陈',
    content: '还有 window 上的事件监听，忘记移除最容易漏。',
    created_at: hoursAgo(8),
  },
  { id: 6, post_id: 107, author: '匿名', content: '抱抱，写出来就已经很勇敢了。', created_at: hoursAgo(30) },
].map((c) => ({ user_id: 0, author_avatar: null, ...c }))

/* ===== 查询：与 server/routes/posts.js 的返回形状保持一致 ===== */
const hotScore = (p) =>
  (p.like_count + 2 * p.comment_count) / Math.pow((Date.now() - Date.parse(p.created_at)) / 3600_000 + 2, 1.5)

export function demoFeed({ limit = 10, offset = 0, sort = 'latest', communityId = '', userId = '', q = '' } = {}) {
  let list = [...demoPosts]
  if (communityId) list = list.filter((p) => String(p.community_id) === String(communityId))
  if (userId) list = list.filter((p) => String(p.user_id) === String(userId))
  if (q) {
    const needle = String(q).toLowerCase()
    list = list.filter((p) =>
      `${p.title || ''}${p.content || ''}${p.community || ''}${p.author || ''}`.toLowerCase().includes(needle)
    )
  }
  if (sort === 'featured') list = list.filter((p) => p.featured)
  if (sort === 'hot') list = list.sort((a, b) => hotScore(b) - hotScore(a))
  else list = list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  return { posts: list.slice(offset, offset + limit), total: list.length }
}

export function demoPost(id) {
  return demoPosts.find((p) => String(p.id) === String(id)) || null
}

export function demoCommentsOf(id) {
  const comments = demoComments.filter((c) => String(c.post_id) === String(id))
  return { comments, total: comments.length }
}

export function demoCommunity(id) {
  return demoCommunities.find((c) => String(c.id) === String(id)) || null
}

const readQuery = (url) => {
  const [path, search = ''] = String(url).split('?')
  return { path, params: new URLSearchParams(search) }
}

/* ===== 迷你路由：只覆盖前端真正会调用的接口 ===== */
export function demoApi(url, options = {}) {
  const { path, params } = readQuery(url)
  const method = String(options.method || 'GET').toUpperCase()
  const num = (key, fallback) => {
    const v = Number(params.get(key))
    return Number.isFinite(v) && params.get(key) !== null ? v : fallback
  }

  if (path === '/health') return { ok: true }
  if (method !== 'GET') throw new Error(DEMO_WRITE_MESSAGE)

  if (path === '/posts') {
    return demoFeed({
      limit: num('limit', 10),
      offset: num('offset', 0),
      sort: params.get('sort') || 'latest',
      communityId: params.get('communityId') || '',
      userId: params.get('userId') || '',
      q: params.get('q') || '',
    })
  }
  let m = path.match(/^\/posts\/(\d+)\/comments$/)
  if (m) return demoCommentsOf(m[1])
  m = path.match(/^\/posts\/(\d+)$/)
  if (m) {
    const hit = demoPost(m[1])
    if (!hit) throw new Error('帖子不存在')
    return hit
  }
  if (path === '/communities') return demoCommunities.map((c) => ({ ...c }))
  m = path.match(/^\/communities\/([^/]+)\/posts$/)
  if (m) {
    const id = m[1]
    const list = demoPosts
      .filter((p) => String(p.community_id) === String(id))
      .sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || Date.parse(b.created_at) - Date.parse(a.created_at))
    return list.slice(num('offset', 0), num('offset', 0) + num('limit', 11))
  }
  m = path.match(/^\/communities\/([^/]+)$/)
  if (m) {
    const hit = demoCommunity(m[1])
    if (!hit) throw new Error('社区不存在')
    return hit
  }
  if (path.startsWith('/notifications')) return { notifications: [], total: 0, unread: 0 }
  if (path.startsWith('/auth/me')) throw new Error(DEMO_WRITE_MESSAGE)

  throw new Error(DEMO_WRITE_MESSAGE)
}
