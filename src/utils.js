// 纯工具与静态数据：与 UI 状态无关，供 store / 组件 / 测试复用
export const starterPosts = [
  {
    id: 'welcome-music',
    author: '阿澄',
    community: '音乐角落',
    title: '周末歌单：把黄昏留在耳机里',
    content: '整理了一组适合傍晚散步时听的歌。没有复杂的编排，只有一点点温柔和刚好落下的夕阳。',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    media: [],
  },
  {
    id: 'welcome-photo',
    author: '快门手',
    community: '镜头之外',
    title: '柔光里的元气瞬间',
    content: '今天在公园拍到一组逆光人像，风吹起发丝的时候，连普通的下午也有了电影感。',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    media: [],
  },
  {
    id: 'welcome-design',
    author: '星尘',
    community: '灵感实验室',
    title: '给社区做了一张暖色调海报',
    content: '试着用纸张纹理、低饱和配色和一点微动效，把“相遇”这件事做得更有温度。',
    created_at: new Date(Date.now() - 172800000).toISOString(),
    media: [],
  },
]
export const starterCommunities = [
  { id: 'music', name: '音乐角落', description: '分享旋律、歌单与那些值得反复聆听的时刻。', postCount: 12 },
  { id: 'photo', name: '镜头之外', description: '交换摄影灵感，收藏光影与城市的呼吸。', postCount: 8 },
  { id: 'ideas', name: '灵感实验室', description: '把脑海里的点子、设计与代码慢慢做成作品。', postCount: 16 },
]

export const poems = [
  { text: '人生得意须尽欢，莫使金樽空对月。', author: '唐 · 李白《将进酒》' },
  { text: '长风破浪会有时，直挂云帆济沧海。', author: '唐 · 李白《行路难》' },
  { text: '山重水复疑无路，柳暗花明又一村。', author: '宋 · 陆游《游山西村》' },
  { text: '海上生明月，天涯共此时。', author: '唐 · 张九龄《望月怀远》' },
  { text: '会当凌绝顶，一览众山小。', author: '唐 · 杜甫《望岳》' },
  { text: '落霞与孤鹜齐飞，秋水共长天一色。', author: '唐 · 王勃《滕王阁序》' },
  { text: '沉舟侧畔千帆过，病树前头万木春。', author: '唐 · 刘禹锡《酬乐天扬州初逢席上见赠》' },
  { text: '此情可待成追忆，只是当时已惘然。', author: '唐 · 李商隐《锦瑟》' },
  { text: '人生自古谁无死，留取丹心照汗青。', author: '宋 · 文天祥《过零丁洋》' },
  { text: '两情若是久长时，又岂在朝朝暮暮。', author: '宋 · 秦观《鹊桥仙》' },
  { text: '海内存知己，天涯若比邻。', author: '唐 · 王勃《送杜少府之任蜀州》' },
  { text: '大鹏一日同风起，扶摇直上九万里。', author: '唐 · 李白《上李邕》' },
  { text: '愿我如星君如月，夜夜流光相皎洁。', author: '宋 · 范成大《车遥遥篇》' },
  { text: '众里寻他千百度，蓦然回首，那人却在灯火阑珊处。', author: '宋 · 辛弃疾《青玉案·元夕》' },
  { text: '且将新火试新茶，诗酒趁年华。', author: '宋 · 苏轼《望江南》' },
  { text: '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。', author: '宋 · 苏轼《定风波》' },
  { text: '山有木兮木有枝，心悦君兮君不知。', author: '先秦 ·《越人歌》' },
  { text: '若教眼底无离恨，不信人间有白头。', author: '宋 · 辛弃疾《鹧鸪天》' },
  { text: '醉后不知天在水，满船清梦压星河。', author: '唐 · 唐温如《题龙阳县青草湖》' },
  { text: '我本将心向明月，奈何明月照沟渠。', author: '明 ·《清诗纪事》' },
]

export const treeholeTags = ['心事', '吐槽', '秘密', '求助', '碎碎念']
export const reportReasons = ['垃圾广告', '人身攻击', '色情低俗', '不实信息', '其他']
export const sparkColors = ['#dbaa92', '#b99ad2', '#f3c7ad', '#e89178']

export const isImage = (m) => /\.(png|jpg|jpeg|gif|webp)$/i.test(m)

export const mediaOf = (p) => {
  if (!p?.media) return []
  let list
  try {
    list = Array.isArray(p.media) ? p.media : JSON.parse(p.media || '[]')
  } catch {
    list = []
  }
  return (Array.isArray(list) ? list : []).map((m) => {
    if (m && typeof m === 'object' && m.url) return { url: m.url, type: m.type === 'video' ? 'video' : 'image' }
    return { url: m, type: isImage(m) ? 'image' : 'video' }
  })
}

export const initials = (name = '社') => name.trim().slice(0, 1).toUpperCase()

export const relativeDate = (date) => {
  if (!date) return ''
  const diff = Math.max(0, Date.now() - new Date(date).getTime())
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export const joinDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
}

export const likeCount = (p) => Number(p?.like_count || 0)

export const greet = () => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

/* ===== 背景装饰生成器 =====
   暗色的「漫天星河 + 流星肆坠」与浅色的「落英缤纷」参数全部在这里算好：
   组件只负责 v-for 渲染，style.css 只负责把变量落成尺寸与动画。 */

/** 确定性伪随机（0~1）：同一个种子永远给出同一张星图，避免每次渲染星空乱跳 */
const noise = (seed) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const round1 = (v) => Math.round(v * 10) / 10

/* 星尘：一个元素靠一串 box-shadow 就能铺出成百颗星，比几百个 DOM 节点省得多
   （整片星尘只占一个图层要合成）。far 远景细密、mid 中景略大、
   band 沿对角斜线聚集（银河）、near 近景最亮。 */
const STAR_FIELDS = {
  far: { count: 260, size: 1, colors: ['#dfe6ff', '#b9c8ff', '#ffffff'], alphas: ['55', '77', '99'] },
  mid: { count: 150, size: 2, colors: ['#ffffff', '#cfe0ff', '#ffe9c4'], alphas: ['88', 'bb', 'dd'] },
  band: { count: 260, size: 1, colors: ['#ffffff', '#d7e2ff', '#ffd7e8'], alphas: ['66', 'aa', 'dd'] },
  near: { count: 90, size: 2, colors: ['#ffffff', '#ffe9c4', '#ffd7e8'], alphas: ['cc', 'ee', 'ff'] },
}
const FIELD_W = 2600
const FIELD_H = 1700

export const starField = (kind = 'far', seed = 1) => {
  const conf = STAR_FIELDS[kind] || STAR_FIELDS.far
  const dots = []

  for (let i = 0; i < conf.count; i += 1) {
    const n = seed * 977 + i
    const x = Math.round(noise(n * 1.7) * FIELD_W)
    // band 把 y 收拢到对角斜线附近（银河）；其余种类在整幅画布内均匀撒点
    const y =
      kind === 'band'
        ? Math.round((x / FIELD_W) * FIELD_H + (noise(n * 5.3) - 0.5) * FIELD_H * 0.3)
        : Math.round(noise(n * 3.1) * FIELD_H)
    const color = conf.colors[Math.floor(noise(n * 7.9) * conf.colors.length)]
    const alpha = conf.alphas[Math.floor(noise(n * 11.3) * conf.alphas.length)]

    dots.push(`${x}px ${y}px 0 ${conf.size - 1}px ${color}${alpha}`)
  }

  return dots.join(', ')
}

/* 亮星：JS 计算位置/时长/漂移/远近分层（CSS calc 不支持 % 取模）。
   分层是为了让星空有纵深：远景小而暗、近景大而亮并带光晕。 */
const STAR_SIZES = { 1: 2, 2: 3.2, 3: 4.6 }
const STAR_TINTS = {
  1: 'radial-gradient(circle, #eef2ff 0 42%, #a9b6ff 78%, transparent)',
  2: 'radial-gradient(circle, #ffffff 0 45%, #cdd7ff 80%, transparent)',
  3: 'radial-gradient(circle, #ffffff 0 52%, #ffe4f1 84%, transparent)',
}
const STAR_GLOWS = {
  1: '0 0 3px #dfe6ffaa',
  2: '0 0 6px #cdd7ffcc',
  3: '0 0 8px #ffffffcc, 0 0 20px #9fb8ffbb',
}

export const starStyle = (n) => {
  const depth = (n % 3) + 1

  return {
    left: ((n * 53) % 100) + '%',
    top: ((n * 29) % 100) + '%',
    '--depth': depth,
    '--sz': STAR_SIZES[depth] + 'px',
    '--tint': STAR_TINTS[depth],
    '--glow': STAR_GLOWS[depth],
    '--dur': 8 + (n % 5) * 2 + 's',
    '--tw': round1(2 + (n % 5) * 0.8) + 's',
    '--tdelay': '-' + (n % 7) * 0.6 + 's',
    '--tx': ((n % 7) - 3) * 60 + 'px',
    '--ty': ((n % 5) - 2) * 46 + 'px',
    '--tx2': ((n % 7) - 3) * 120 + 'px',
    '--ty2': ((n % 5) - 2) * 88 + 'px',
  }
}

/* 流星：位置/长度/倾角/时长/延迟全部错开，十几条各自肆坠，同屏就有流星雨的感觉。
   倾角必须等于 atan2(fy, fx)，拖尾才会和飞行方向对齐（否则像斜着飘的线）。 */
export const meteorStyle = (n) => {
  const r = (k) => noise(n * 31.7 + k)
  const rightward = r(1) > 0.42
  const dx = (rightward ? 1 : -1) * (0.7 + r(2) * 0.6)
  const dy = 0.55 + r(3) * 0.8
  const fx = dx * (44 + r(4) * 26)
  const fy = dy * (44 + r(5) * 26)

  return {
    left: round1(-12 + r(6) * 122) + '%',
    top: round1(-10 + r(7) * 112) + '%',
    '--len': Math.round(150 + r(8) * 260) + 'px',
    '--thick': round1(1.2 + r(9) * 1.6) + 'px',
    '--dur': round1(2.2 + r(10) * 2.8) + 's',
    '--delay': round1(r(11) * 7) + 's',
    '--fx': round1(fx) + 'vmax',
    '--fy': round1(fy) + 'vmax',
    '--angle': round1((Math.atan2(fy, fx) * 180) / Math.PI) + 'deg',
  }
}

/* 花瓣：落英缤纷。位置、大小、侧摆幅度、翻转角度、下落时长全部错开，
   让四十多片花瓣在同一屏里各飘各的，而不是排队一起落。 */
export const petalStyle = (n) => {
  const r = (k) => noise(n * 47.3 + k)
  const size = Math.round(14 + r(1) * 22)

  return {
    left: round1(-2 + r(2) * 104) + '%',
    '--szw': size + 'px',
    '--szh': Math.round(size * 0.62) + 'px',
    '--rot': Math.round(r(3) * 360) + 'deg',
    '--spin': Math.round(320 + r(4) * 460) + 'deg',
    '--scale': round1(0.8 + r(5) * 0.5) + '',
    '--sway': round1(r(6) * 26 - 8) + 'vw',
    '--dur': round1(7 + r(7) * 9) + 's',
    '--delay': round1(r(8) * 9) + 's',
    '--alpha': round1(0.6 + r(9) * 0.4) + '',
    '--hue': Math.floor(r(10) * 3),
  }
}

/* 亮色主题的柔光花纹：极光带/光斑/星光（花瓣见 petalStyle） */
export const bloomStyle = (n, kind) => {
  if (kind === 'aurora') {
    return {
      left: ((n * 29) % 36) - 8 + '%',
      top: 12 + ((n * 19) % 58) + '%',
      '--dur': 24 + (n % 3) * 7 + 's',
      '--delay': -(n % 4) * 5 + 's',
      '--rot': -24 + (n % 3) * 13 + 'deg',
      '--scale': 0.85 + (n % 2) * 0.3 + '',
    }
  }
  if (kind === 'spark') {
    return {
      left: ((n * 23) % 100) + '%',
      top: ((n * 41) % 100) + '%',
      '--dur': 4 + (n % 4) * 1.2 + 's',
      '--delay': -(n % 5) * 0.9 + 's',
      '--sz': 5 + (n % 3) * 3 + 'px',
      '--hue': n % 2,
    }
  }
  return {
    left: ((n * 61) % 100) + '%',
    top: ((n * 17) % 100) + '%',
    '--dur': 9 + (n % 5) * 2.5 + 's',
    '--delay': -(n % 7) * 1.4 + 's',
    '--sz': 26 + (n % 4) * 20 + 'px',
    '--hue': n % 3,
  }
}

export const weatherEmoji = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  66: '🌧️',
  67: '🌧️',
  71: '🌨️',
  73: '🌨️',
  75: '🌨️',
  77: '🌨️',
  80: '🌦️',
  81: '🌧️',
  82: '⛈️',
  85: '🌨️',
  86: '🌨️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
}
export const weatherText = {
  0: '晴朗',
  1: '大致晴朗',
  2: '多云',
  3: '阴天',
  45: '雾',
  48: '雾凇',
  51: '毛毛雨',
  53: '小雨',
  55: '中雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '阵雨',
  81: '阵雨',
  82: '强阵雨',
  85: '阵雪',
  86: '阵雪',
  95: '雷暴',
  96: '雷暴伴冰雹',
  99: '雷暴伴冰雹',
}
