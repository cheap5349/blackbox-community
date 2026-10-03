// 演示数据生成脚本：清空帖子 → 下载配图/视频 → 生成 45 条真实感帖子 + 点赞/评论
// 用法：node server/generate-data.js（可重复执行，每次会清空旧帖子数据）
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import { pool } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, 'uploads')
const videoSrc = path.join(__dirname, '..', 'public', 'videos', 'background_001.mp4')

/* 确定性伪随机，保证可重复 */
function makeRand(seed) {
  let s = (seed * 9301 + 49297) % 233281
  return () => (s = (s * 233280 + 49297) % 233281) / 233281
}
const randOf = (arr, rand) => arr[Math.floor(rand() * arr.length)]

const MOCK_USERS = ['江晚吟', '阿澈', 'momo酱', '林深时见鹿', '拾光', '南风知我意', '橙子汽水', '白桃乌龙']

/* 45 条帖子：[社区, 标题, 内容, 图片seed数组, 是否视频] 树洞标签词放在标题开头以便前端过滤 */
const POSTS = [
  // —— 树洞（18 条）
  [
    '讨论区',
    '心事：一个人在陌生的城市，突然好想家',
    '来这座城三年了，今天加班到十点，地铁上看到一个小孩牵着妈妈的手，眼眶一下就热了。老家的一切都还停在离开那天。',
    ['tree-mood-1'],
    false,
  ],
  [
    '讨论区',
    '吐槽：地铁上有人外放刷短视频，忍了一路',
    '音量开到最大，整节车厢都是他的快乐。我看了他三次，他完全没察觉。打工人已经很累了，能不能互相体谅一下。',
    [],
    false,
  ],
  [
    '讨论区',
    '秘密：我其实很羡慕那个看起来无所事事的同事',
    '他每天准点下班，周末从不开手机，朋友圈全是爬山和做菜。我升了职却觉得越来越空。是不是我把"努力"和"活着"搞混了。',
    ['tree-secret-1'],
    false,
  ],
  [
    '讨论区',
    '求助：考研还是直接工作，纠结一个多月了',
    '双非本科，家里条件一般。室友都在准备秋招，我复习得也不踏实，两头都没抓住。有没有过来人聊聊。',
    [],
    false,
  ],
  [
    '讨论区',
    '碎碎念：今天的晚霞是橘子汽水味的',
    '下班路上看到整片天空都被染成橙粉色，停下来拍了十分钟。突然觉得这一天也没那么糟。',
    ['tree-chat-1'],
    false,
  ],
  [
    '讨论区',
    '心事：和爸妈视频，发现他们又老了',
    '妈妈剪了头发，鬓角的白遮不住了。她说家里一切都好，让我别惦记。我在这头笑着，挂了电话哭了很久。',
    [],
    false,
  ],
  [
    '讨论区',
    '吐槽：甲方凌晨改需求，第二天一早要',
    '晚上十一点半发来 47 条语音，核心就一句话：还是用回第一版吧。设计师的命也是命。',
    [],
    false,
  ],
  [
    '讨论区',
    '秘密：偷偷喜欢一个人三年，从没敢说出口',
    '一起吃饭、一起加班、一起淋过雨，每次话到嘴边都咽回去。上个月他官宣了，我祝他幸福，是真的祝福，也是真的难过。',
    ['tree-secret-2'],
    false,
  ],
  [
    '讨论区',
    '求助：连续失眠两周，有什么办法吗',
    '试过褪黑素、白噪音、睡前泡脚，还是凌晨三点睁着眼。白天困成狗，晚上精神百倍。朋友们支支招吧。',
    [],
    false,
  ],
  [
    '讨论区',
    '碎碎念：我家猫今天学会了开门，家没了',
    '凌晨四点，它用爪子把门把手压开，跳上床踩醒我。现在全家所有门都上了锁。它看我的眼神像在说：人类，你防不住我。',
    ['tree-chat-2'],
    false,
  ],
  [
    '讨论区',
    '心事：毕业季，室友们开始各奔东西',
    '一起吃了最后一顿烧烤，谁都没提"以后常联系"这种话。散场时他拍了拍我的肩。从此山高路远，各自珍重。',
    [],
    false,
  ],
  [
    '讨论区',
    '吐槽：网购的"惊喜盲盒"开出来全是库存',
    '看直播激情下单，说是百分百惊喜。拆开全是滞销货，连个能用的都没有。冲动消费的代价。',
    [],
    false,
  ],
  [
    '讨论区',
    '秘密：在人前总是很开心，其实累极了',
    '同事都说我是组里的开心果。只有我知道每天到家第一件事是把笑收起来。扮演自己太久，都快忘了真实的样子。',
    ['tree-secret-3'],
    false,
  ],
  [
    '讨论区',
    '求助：健身三个月没变化，是不是练错了',
    '每周四练，饮食也控制了，围度纹丝不动。教练说我坚持不够，可我真的有在练啊。有没有懂哥指点一下。',
    [],
    false,
  ],
  [
    '讨论区',
    '碎碎念：下雨天窝在家里听歌，好舒服',
    '雨打在窗台上，泡了杯热茶，循环最爱的那张专辑。原来幸福可以这么便宜。',
    ['tree-chat-3'],
    false,
  ],
  [
    '讨论区',
    '心事：35 岁了，还在纠结要不要换赛道',
    '互联网七年，涨不动了，身体也垮了。想转行又怕归零，不转又看不到头。三十五岁这道坎，比想象中难走。',
    [],
    false,
  ],
  [
    '讨论区',
    '吐槽：被同事甩锅还背了锅，气到失眠',
    '方案是他提的，锅是我背的。复盘会上他沉默如山。我知道职场要成熟，但成熟不等于受气吧。',
    [],
    false,
  ],
  [
    '讨论区',
    '碎碎念：深夜煮了碗泡面，加了个蛋',
    '加班到家十一点，给自己煮了碗加蛋加肠的豪华泡面。一个人也要好好吃饭，这是今天教给自己的道理。',
    [],
    false,
  ],
  [
    '讨论区',
    '心事：异地恋第三年，开始害怕电话那头的沉默',
    '从无话不说到只剩"今天忙吗"。不是不爱了，是生活把我们磨得没有力气说话。有没有同样异地的朋友，你们是怎么撑过来的。',
    ['tree-mood-2'],
    false,
  ],
  [
    '讨论区',
    '吐槽：室友半夜打游戏外放，说了三次没用',
    '凌晨一点还在喊麦，耳机线都落灰了。室友感情是真好，但睡眠也是真缺。怎么办，在线等。',
    [],
    false,
  ],
  [
    '讨论区',
    '秘密：其实我不太喜欢现在这份工作，但不敢裸辞',
    '工资还行，同事不错，就是每天起床都需要心理建设。房贷压着不敢动，先苟着吧。说出来好受一点。',
    ['tree-secret-4'],
    false,
  ],
  [
    '讨论区',
    '求助：第一次租房，有哪些坑要避开',
    '下周要看房子了，完全没经验。中介话术、合同条款、押金套路，求过来人避坑指南。',
    [],
    false,
  ],
  [
    '讨论区',
    '碎碎念：今天给自己买了束花，生活需要仪式感',
    '路过花店突然想买，挑了束向日葵。老板说"送自己呀，挺好的"。是啊，挺好的。',
    ['tree-chat-5'],
    false,
  ],
  [
    '讨论区',
    '心事：妈妈查出小毛病，在医院走廊坐到天亮',
    '幸好是良性的，医生说定期复查就行。可那一夜我才发现，父母真的会老。多回家看看。',
    [],
    false,
  ],
  [
    '讨论区',
    '吐槽：排队两小时的网红店，味道一般',
    '营销做得飞起，排队排到怀疑人生，结果端上来平平无奇。以后再也不信小红书探店了。',
    [],
    false,
  ],
  [
    '讨论区',
    '秘密：我在假装没看见他的消息',
    '发了消息又撤回，撤回又发。我知道他喜欢我，我也喜欢他，可我们都在等对方先开口。成年人真别扭。',
    ['tree-secret-5'],
    false,
  ],
  [
    '讨论区',
    '求助：社恐怎么自然地和人打招呼',
    '电梯里遇到同事会假装看手机，团建恨不得隐身。不是不礼貌，是真的不知道怎么开口。求破局。',
    [],
    false,
  ],
  [
    '讨论区',
    '碎碎念：秋天的第一杯奶茶，是室友请的',
    '她说看到我最近加班太累。奶茶很甜，被人惦记的感觉更甜。',
    ['tree-chat-6'],
    false,
  ],
  // —— 音乐角落（7 条）
  [
    '音乐角落',
    '最近循环的宝藏歌单，分享给你们',
    '整理了一组最近天天循环的歌：独立摇滚、城市民谣和一点点电子。没有复杂编排，只有刚好落进心里的旋律。',
    ['music-1', 'music-2'],
    false,
  ],
  [
    '音乐角落',
    '雨声白噪音，写代码神器',
    '关了所有提醒，戴上耳机放两小时雨声，效率直接翻倍。最近写代码全靠它续命。',
    ['music-3'],
    false,
  ],
  [
    '音乐角落',
    '夏日限定歌单：西瓜、晚风、蝉鸣',
    '把夏天的声音都装进歌单里。黄昏散步、天台吹风、半夜乘凉，都有对应的歌。',
    ['music-4'],
    false,
  ],
  [
    '音乐角落',
    '深夜爵士，适合一个人的酒',
    '黑胶转录的爵士现场，萨克斯一响整个世界都慢下来。适合失眠的夜晚和半杯威士忌。',
    ['music-5'],
    false,
  ],
  [
    '音乐角落',
    '上周去看的演唱会，现场太炸了',
    '抢了半年票终于进场。全场大合唱的时候眼泪直接崩了。随手录了一段现场，感受一下万人大合唱。',
    ['music-6'],
    true,
  ],
  [
    '音乐角落',
    '治愈系钢琴曲，睡前循环',
    '轻柔的钢琴配上弦乐铺底，像被温水泡着。最近睡眠质量全靠它拯救，分享给同样睡不着的你。',
    ['music-7'],
    false,
  ],
  [
    '音乐角落',
    '跑步歌单：BPM 160 一起冲',
    '精选了一批节奏感极强的歌，配速直接拉满。夜跑的时候戴上耳机，整个世界都是我的。',
    ['music-8'],
    false,
  ],
  // —— 镜头之外（7 条）
  [
    '镜头之外',
    '城市日落，延时拍到了云层的流动',
    '在天台上蹲了一小时，看着太阳沉进楼群。云像海浪一样翻涌，那一刻觉得城市其实也很温柔。',
    ['photo-1'],
    false,
  ],
  [
    '镜头之外',
    '雨后的街道，积水里倒映着霓虹',
    '一场大雨后整个城市像被洗过，路面的积水把霓虹灯倒了个个儿。蹲在路边拍了半小时，路人都在看我。',
    ['photo-2'],
    false,
  ],
  [
    '镜头之外',
    '逆光人像：发丝都在发光',
    '傍晚五点，逆光正好。风吹起头发的那一刻，连普通的下午都有了电影感。',
    ['photo-3'],
    false,
  ],
  [
    '镜头之外',
    '咖啡店静物：窗边的午后',
    '周末在巷子口的咖啡店坐了一下午。阳光斜斜地落在杯沿上，安静得能听见冰块融化。',
    ['photo-4'],
    false,
  ],
  [
    '镜头之外',
    '第一次拍星空，银河肉眼可见',
    '驱车三小时到郊外，抬头那一刻什么语言都多余。相机快门声里，我数到了三十多颗流星。',
    ['photo-5'],
    false,
  ],
  [
    '镜头之外',
    '胶片机第一卷，颗粒感太喜欢了',
    '收了一台二手胶片机，第一卷终于洗出来了。那种颗粒和色偏，是数码永远给不了的质感。',
    ['photo-6'],
    false,
  ],
  [
    '镜头之外',
    '老街的老店，老板说开了三十年',
    '理发店、修表铺、早餐摊，整条街还留着九十年代的样子。老板说这店比他儿子岁数都大。',
    ['photo-7'],
    false,
  ],
  // —— 灵感实验室（7 条）
  [
    '灵感实验室',
    '用纯 CSS 做的粒子动效，好上头',
    '周末研究了一下纯 CSS 粒子动画，效果出奇地好。性能比 canvas 还流畅，附上实现思路。',
    ['lab-1'],
    false,
  ],
  [
    '灵感实验室',
    'AI 生成海报的思路复盘',
    '最近用 AI 做了组系列海报：先把关键词拆成风格、构图、色彩三个维度，再逐层细化。成品率直接翻倍。',
    ['lab-2'],
    false,
  ],
  [
    '灵感实验室',
    '给自己搭了个博客，记录成长',
    '用静态站生成器搭了个极简博客，没有花哨功能，只有每周一篇的记录。写作是思考的最好方式。',
    ['lab-3'],
    false,
  ],
  [
    '灵感实验室',
    '想做一款像素风的独立小游戏，求建议',
    '构思了一个像素风解谜小游戏：玩家扮演一盏路灯，照亮路过的人的故事。求美术和玩法上的建议。',
    ['lab-4'],
    false,
  ],
  [
    '灵感实验室',
    '桌面整理：把工作区改成了暖色调',
    '把桌面、壁纸、终端配色全部统一成暖色系。工作心情肉眼可见地变好了，效率也高了一截。',
    ['lab-5'],
    false,
  ],
  [
    '灵感实验室',
    '这几款读书笔记工具，真的能坚持用下去',
    '试过十几款笔记软件，最后留下这三款：一个摘录、一个记录灵感、一个写长文。工具不在多，顺手就行。',
    ['lab-6'],
    false,
  ],
  [
    '灵感实验室',
    '第一次给开源项目提 PR，被合并了！',
    '修了一个困扰我两周的 bug，鼓起勇气提了 PR。没想到作者第二天就回复并合并了。开源真的很有温度。',
    ['lab-7'],
    false,
  ],
  // —— 游戏（3 条）
  [
    '游戏',
    '周末通关了《蔚蓝》，手都麻了',
    '三百多次死亡换来通关那一刻，手都在抖。这游戏教会我：掉下去不是失败，再爬起来才是。',
    ['game-1'],
    false,
  ],
  [
    '游戏',
    '推荐一款被低估的独立游戏',
    '一款 30 小时流程的叙事神作，剧情后劲极大。玩完三天没缓过来，含泪安利。',
    ['game-2'],
    false,
  ],
  [
    '游戏',
    '和大学室友通宵开黑，仿佛回到从前',
    '五个人天南海北，语音一开还是当年那味儿。录了一段团战高光，纪念我们的第七年。',
    ['game-3'],
    true,
  ],
  // —— 补充 3 条
  [
    '音乐角落',
    '街头音乐人的即兴现场，随手录的',
    '地铁口的小提琴手拉了一首《卡农》，路人纷纷驻足。这才是音乐最初的样子。',
    [],
    true,
  ],
  [
    '讨论区',
    '碎碎念：周末做了顿大餐，一个人吃光',
    '跟着教程做了四菜一汤，拍照发朋友圈，配文"和朋友聚聚"。其实是我一个人吃的。有点孤独，也有点骄傲。',
    ['tree-chat-4'],
    false,
  ],
  [
    '镜头之外',
    '给楼下的小猫拍写真，它居然看镜头',
    '楼下的橘猫今天心情很好，蹲在那里任我拍了十分钟。它大概是这个小区最出名的模特了。',
    ['photo-8'],
    false,
  ],
]

const COMMENTS_POOL = [
  '太真实了',
  '收藏了，感谢分享',
  '同感 +1',
  '说得真好',
  '学到了',
  '看完心情好了很多',
  '抱抱，会好起来的',
  '这个可以有',
  '哈哈哈哈哈哈',
  '有被安慰到',
  '一模一样，完全是我',
  '写得真好，代入感很强',
  '已转发给朋友',
  '谢谢，正需要这个',
  '加油，一切都会变好的',
  '求个歌单链接',
  '别急，慢慢来',
  '我也经历过，现在好多了',
  '看完想家了',
  '这也太可爱了',
]

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

async function download(url, dest, tries = 2) {
  for (let i = 0; i <= tries; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 5000) throw new Error('too small')
      fs.writeFileSync(dest, buf)
      return true
    } catch (e) {
      if (i === tries) {
        console.warn('下载失败：', url, e.message)
        return false
      }
      await new Promise((r) => setTimeout(r, 600 * (i + 1)))
    }
  }
  return false
}

async function main() {
  /* 1. 清理旧数据（评论/点赞随帖子级联删除） */
  await pool.query('DELETE FROM likes')
  await pool.query('DELETE FROM comments')
  const [oldPosts] = await pool.query('SELECT media FROM posts')
  for (const p of oldPosts) {
    let items = []
    try {
      items = Array.isArray(p.media) ? p.media : JSON.parse(p.media || '[]')
    } catch {}
    for (const item of items) {
      const url = typeof item === 'string' ? item : item?.url
      if (!url) continue
      const file = path.join(uploadsDir, path.basename(url))
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file)
      } catch {}
    }
  }
  await pool.query('DELETE FROM posts')
  console.log('已清空旧帖子数据')

  /* 2. 确保社区存在 */
  const communityIds = {}
  const COMM_NAMES = ['音乐角落', '镜头之外', '灵感实验室', '讨论区', '游戏']
  const COMM_DESC = {
    音乐角落: '分享旋律、歌单与那些值得反复聆听的时刻。',
    镜头之外: '交换摄影灵感，收藏光影与城市的呼吸。',
    灵感实验室: '把脑海里的点子、设计与代码慢慢做成作品。',
    讨论区: '把说不出口的话留在这里，没有人知道你是谁。',
    游戏: '一起聊游戏，分享攻略与快乐。',
  }
  for (const name of COMM_NAMES) {
    const [rows] = await pool.query('SELECT id FROM communities WHERE name = ?', [name])
    if (rows[0]) communityIds[name] = rows[0].id
    else {
      const [x] = await pool.query('INSERT INTO communities(name,description,owner_id) VALUES(?,?,?)', [
        name,
        COMM_DESC[name],
        1,
      ])
      communityIds[name] = x.insertId
    }
  }

  /* 3. 模拟用户（幂等） */
  const userIds = []
  const password = await bcrypt.hash('demo123456', 10)
  for (const name of MOCK_USERS) {
    const email = `demo-${name}@heibox.local`
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email])
    if (rows[0]) {
      userIds.push(rows[0].id)
      continue
    }
    const [x] = await pool.query('INSERT INTO users(name,email,password) VALUES(?,?,?)', [name, email, password])
    userIds.push(x.insertId)
  }
  console.log(`模拟用户就绪：${userIds.length} 人`)

  /* 4. 下载配图 */
  fs.mkdirSync(uploadsDir, { recursive: true })
  const imageSeeds = [...new Set(POSTS.flatMap(([, , , seeds]) => seeds || []))]
  const imageFiles = {}
  let okCount = 0
  const workers = imageSeeds.map(async (seed) => {
    const file = crypto.randomBytes(16).toString('hex') + '.jpg'
    const ok = await download(
      `https://picsum.photos/seed/${encodeURIComponent(seed)}/960/640`,
      path.join(uploadsDir, file)
    )
    if (ok) {
      imageFiles[seed] = file
      okCount++
    }
  })
  await Promise.all(workers)
  console.log(`配图下载完成：${okCount}/${imageSeeds.length} 张`)

  /* 5. 视频素材（复用背景视频） */
  const videoFiles = []
  if (fs.existsSync(videoSrc)) {
    for (let i = 0; i < 3; i++) {
      const file = crypto.randomBytes(16).toString('hex') + '.mp4'
      fs.copyFileSync(videoSrc, path.join(uploadsDir, file))
      videoFiles.push(file)
    }
  }
  console.log(`视频素材：${videoFiles.length} 段`)

  /* 6. 插入帖子 */
  const now = Date.now()
  let videoIdx = 0
  let inserted = 0
  for (let i = 0; i < POSTS.length; i++) {
    const [comm, title, content, seeds, isVideo] = POSTS[i]
    const communityId = communityIds[comm]
    const user = userIds[i % userIds.length]
    const minutesAgo = 30 + i * 37 + ((i * 97) % 240) // 分散在最近约 2 天多
    const created = fmtDate(new Date(now - minutesAgo * 60000 - (i % 4) * 86400000 * 1.5))
    let media = []
    if (isVideo && videoFiles.length) {
      media = [{ url: `/uploads/${videoFiles[videoIdx++ % videoFiles.length]}`, type: 'video' }]
    } else {
      for (const seed of seeds || []) {
        if (imageFiles[seed]) media.push({ url: `/uploads/${imageFiles[seed]}`, type: 'image' })
      }
    }
    await pool.query('INSERT INTO posts(title,content,media,community_id,user_id,created_at) VALUES(?,?,?,?,?,?)', [
      title,
      content,
      JSON.stringify(media),
      communityId,
      user,
      created,
    ])
    inserted++
  }
  console.log(`帖子插入完成：${inserted} 条`)

  /* 7. 点赞 + 评论 */
  const [postRows] = await pool.query('SELECT id,user_id,created_at FROM posts ORDER BY id')
  let likes = 0
  let comments = 0
  for (let i = 0; i < postRows.length; i++) {
    const p = postRows[i]
    const rand = makeRand(i + 1)
    const likeCount = 3 + Math.floor(rand() * 26) // 3~28 个赞
    const shuffled = [...userIds]
    for (let k = shuffled.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1))
      ;[shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]]
    }
    for (const uid of shuffled.slice(0, likeCount)) {
      await pool.query('INSERT IGNORE INTO likes(post_id,user_id) VALUES(?,?)', [p.id, uid])
      likes++
    }
    const commentCount = Math.floor(rand() * 6) // 0~5 条
    const postTime = new Date(p.created_at).getTime()
    for (let k = 0; k < commentCount; k++) {
      const ctime = fmtDate(new Date(postTime + (10 + Math.floor(rand() * 1500)) * 60000))
      await pool.query('INSERT INTO comments(post_id,user_id,content,created_at) VALUES(?,?,?,?)', [
        p.id,
        shuffled[Math.floor(rand() * shuffled.length)],
        randOf(COMMENTS_POOL, rand),
        ctime,
      ])
      comments++
    }
  }
  console.log(`点赞数据：${likes} 条，评论数据：${comments} 条`)

  const [[stats]] = await pool.query(
    'SELECT (SELECT COUNT(*) FROM posts) posts,(SELECT COUNT(*) FROM communities) comms,(SELECT COUNT(*) FROM users) users'
  )
  console.log('完成：', JSON.stringify(stats))
  await pool.end()
}

main().catch((e) => {
  console.error('生成失败：', e)
  process.exit(1)
})
