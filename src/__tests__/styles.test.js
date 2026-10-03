import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 规范测试直接读源码文本。CSS 不会在 jsdom 里加载，但「删了组件却留下死样式」
// 和「模板用了新类名却没写样式」这两类问题恰恰最容易在重构中溜过去。
const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(here, '..', 'style.css'), 'utf8')

const countOccurrences = (source, token) => source.split(token).length - 1

/**
 * 数出 token 在顶层作用域的命中次数（即在任何 @media / @supports 块之外）。
 * 逐字符跟踪大括号深度，并跳过注释，避免把注释里的选择器也算进去。
 */
function topLevelOccurrences(source, token) {
  let depth = 0
  let inComment = false
  let hits = 0

  for (let i = 0; i < source.length; i += 1) {
    if (inComment) {
      if (source.startsWith('*/', i)) {
        inComment = false
        i += 1
      }
      continue
    }
    if (source.startsWith('/*', i)) {
      inComment = true
      i += 1
      continue
    }
    if (source[i] === '{') {
      depth += 1
      continue
    }
    if (source[i] === '}') {
      depth -= 1
      continue
    }
    if (depth === 0 && source.startsWith(token, i)) hits += 1
  }

  return hits
}

/**
 * 取出 selector 对应规则的声明块（从 `{` 到配对的 `}`）。
 * 找不到时返回空字符串，由调用方断言，避免这里抛出不友好的错误。
 */
function ruleBlock(source, selector) {
  const start = source.indexOf(selector)
  if (start === -1) return ''
  const open = source.indexOf('{', start)
  if (open === -1) return ''

  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }

  return ''
}

/** 把 #rrggbb 拆成通道值，用来断言"这真的是粉色"而不是随便一个浅色 */
function hexChannels(hex) {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
}

/** 数出某个装饰类在模板里渲染了几个节点 */
function layerCount(source, className) {
  const match = source.match(new RegExp(`v-for="n in (\\d+)"[^>]*class="${className}"`))
  return match ? Number(match[1]) : 0
}

/** 数出模板里带该 class 的节点数（不依赖 v-for 的数字写法） */
function classNodes(source, className) {
  return countOccurrences(source, `class="${className}"`)
}

describe('样式表守卫', () => {
  it('左下角播放器固定挂在视口上，不随页面滚动', () => {
    const block = ruleBlock(css, '.bgm-player')

    expect(block, '找不到 .bgm-player 规则').not.toBe('')
    expect(block).toContain('position: fixed')
    expect(block).toContain('left:')
    expect(block).toContain('bottom:')
  })

  it('入口渲染成黑胶唱片：圆形 + 沟槽纹理', () => {
    const block = ruleBlock(css, '.bgm-disc')

    expect(block, '找不到 .bgm-disc 规则').not.toBe('')
    expect(block).toContain('border-radius: 50%')
    expect(block).toContain('repeating-radial-gradient')
  })

  it('页面入场动画结束时不留 transform，否则容器会成为 fixed 子元素的包含块', () => {
    // .community-page 带 .page-enter（animation ... both）。若 pageIn 的 to 帧保留了
    // transform，容器会永久持有 transform，页内 position: fixed 的浮层就会改为相对它
    // 定位并随文档滚动——左下角播放器会变成"滑到底才看得见"。
    const pageIn = ruleBlock(css, '@keyframes pageIn')

    expect(pageIn, '找不到 @keyframes pageIn').not.toBe('')
    const toBlock = pageIn.slice(pageIn.indexOf('to {'))
    expect(toBlock, 'pageIn 的 to 帧必须把 transform 收回 none').toContain('transform: none')
  })

  it('播放器挂在 .community-page 容器之外，不依赖容器有无 transform', () => {
    const app = readFileSync(resolve(here, '..', 'App.vue'), 'utf8')
    const playerAt = app.indexOf('<BgmPlayer')
    const containerAt = app.indexOf('class="community-page')

    expect(playerAt).toBeGreaterThan(-1)
    expect(containerAt).toBeGreaterThan(-1)
    expect(playerAt, 'BgmPlayer 又被放回 .community-page 内部了').toBeLessThan(containerAt)
  })

  it('展开后的播放器面板有封面、进度条与玻璃质感', () => {
    const panel = ruleBlock(css, '.bgm-panel')

    expect(panel, '找不到 .bgm-panel 规则').not.toBe('')
    expect(panel).toContain('backdrop-filter')
    expect(panel).toContain('border-radius')

    const now = ruleBlock(css, '.bgm-now')
    expect(now, '找不到当前曲目区 .bgm-now 规则').not.toBe('')

    const cover = ruleBlock(css, '.bgm-cover')
    expect(cover, '找不到封面缩略图 .bgm-cover 规则').not.toBe('')
    expect(cover).toContain('border-radius: 50%')

    const progress = ruleBlock(css, '.bgm-progress')
    expect(progress, '找不到进度条 .bgm-progress 规则').not.toBe('')
    expect(progress).toContain('appearance: none')
  })

  it('已彻底移除实时 FPS 悬浮指示的样式', () => {
    const leftovers = ['.fps-badge', '.fps-ring', '.fps-value', '.fps-label', '@keyframes fpsIn'].filter((token) =>
      css.includes(token)
    )

    expect(leftovers, `style.css 仍残留 FPS 样式：${leftovers.join('、')}`).toEqual([])
  })

  it('已删除 FpsBadge 组件文件（不再有面向普通用户的帧率浮层）', () => {
    const fpsBadge = resolve(here, '..', 'components', 'FpsBadge.vue')

    expect(existsSync(fpsBadge)).toBe(false)
  })

  it('为按需天气按钮定义了 .geo-request 样式', () => {
    expect(css).toContain('.geo-request')
  })

  it('滚动暂停规则位于顶层，不被窄屏媒体查询吞掉', () => {
    const total = countOccurrences(css, 'html[data-scrolling]')
    const topLevel = topLevelOccurrences(css, 'html[data-scrolling]')

    expect(total).toBeGreaterThan(0)
    expect(topLevel, '有滚动暂停规则被写进了 @media 块内，桌面端不会生效').toBe(total)
  })

  it('浅色主题底色走粉色系变量，进来就能看到粉色', () => {
    const root = ruleBlock(css, ':root')

    for (const token of ['--blush-1', '--blush-2', '--blush-3', '--blush-4']) {
      const at = root.indexOf(token + ':')
      expect(at, `:root 缺少 ${token}`).toBeGreaterThan(-1)

      const hex = root.slice(at).match(/#[0-9a-fA-F]{6}/)
      expect(hex, `${token} 应该是 6 位十六进制颜色`).not.toBeNull()

      const [r, g, b] = hexChannels(hex[0])
      expect(r, `${token} 的红通道不够亮，算不上粉色`).toBeGreaterThanOrEqual(240)
      expect(r - g, `${token} 的粉不够足：红通道要明显高于绿通道`).toBeGreaterThanOrEqual(20)
      expect(r, `${token} 的红通道必须是最高通道`).toBeGreaterThanOrEqual(b)
    }

    // 用带换行的选择器定位真正的规则本体：搜 '.light-wash' 会先撞上
    // `html[data-scrolling] .light-wash` 那条滚动暂停声明
    for (const [label, selector] of [
      ['.community-page', '\n.community-page'],
      ['.light-wash', '\n.light-wash'],
    ]) {
      expect(ruleBlock(css, selector), `${label} 没走粉色变量`).toContain('var(--blush-')
    }

    const orb = ruleBlock(css, '.bloom-layer .bl-orb')
    const orbHex = orb.match(/#[0-9a-fA-F]{6}/)
    expect(orbHex, '找不到 .bl-orb 的主色').not.toBeNull()

    const [r, g] = hexChannels(orbHex[0])
    expect(r).toBeGreaterThan(200)
    expect(r).toBeGreaterThanOrEqual(g)
  })

  it('粉色洗层不能把花瓣压住：足够透明，且渲染在花层之前', () => {
    const wash = ruleBlock(css, '\n.light-wash')
    const alpha = Number.parseFloat((wash.match(/opacity:\s*([\d.]+)/) || [])[1])

    expect(wash, '找不到 .light-wash 规则').not.toBe('')
    expect(Number.isNaN(alpha), '找不到 .light-wash 的 opacity').toBe(false)
    expect(alpha, '洗层太不透明会把花瓣糊掉').toBeLessThan(0.5)

    const layers = readFileSync(resolve(here, '..', 'components', 'BackgroundLayers.vue'), 'utf8')
    expect(layers.indexOf('light-wash'), '洗层必须在 .bloom-layer 之前渲染，否则花瓣被压在下面看不见').toBeLessThan(
      layers.indexOf('bloom-layer')
    )
  })

  it('暗色星空分层渲染：整片星尘 + 银河 + 亮星 + 肆坠流星', () => {
    const field = ruleBlock(css, '.galaxy-layer .g-field')

    expect(field, '找不到星尘层 .g-field 规则').not.toBe('')
    expect(field, '星尘层要用 box-shadow: var(--field) 一次铺出成片星星').toContain('box-shadow: var(--field')

    const meteor = ruleBlock(css, '.galaxy-layer .g-meteor')

    expect(meteor, '找不到流星规则').not.toBe('')
    expect(meteor, '流星要有发光拖尾').toContain('box-shadow')
    expect(meteor, '流星时长要由 JS 变量驱动，十几条才能各自错峰').toContain('var(--dur')
    expect(meteor, '流星倾角也要由 JS 变量驱动').toContain('var(--angle')
    expect(css, '流星要有亮核').toContain('.galaxy-layer .g-meteor::after')

    const meteorFall = ruleBlock(css, '@keyframes meteorFall')

    expect(meteorFall, '找不到流星坠落关键帧').not.toBe('')
    expect(meteorFall).toContain('translate3d(var(--fx')

    const star = ruleBlock(css, '.galaxy-layer .g-star')

    expect(star, '找不到星星规则').not.toBe('')
    expect(star, '星星要靠 --sz 分层').toContain('var(--sz')
    expect(star, '星星要靠 --tint 分层上色').toContain('var(--tint')

    const layers = readFileSync(resolve(here, '..', 'components', 'BackgroundLayers.vue'), 'utf8')

    expect(classNodes(layers, 'g-field'), '星尘要有远景/中景/银河三个层次').toBeGreaterThanOrEqual(3)
    expect(classNodes(layers, 'g-milky'), '银河主体要存在').toBeGreaterThanOrEqual(1)
    expect(layerCount(layers, 'g-star'), '亮星至少 48 颗').toBeGreaterThanOrEqual(48)
    expect(layerCount(layers, 'g-meteor'), '至少 12 条流星才叫肆坠').toBeGreaterThanOrEqual(12)
    expect(layerCount(layers, 'bl-aurora'), '浅色主题要有粉色极光带').toBeGreaterThanOrEqual(2)
    expect(layerCount(layers, 'bl-petal'), '花瓣至少 40 片才叫落英缤纷').toBeGreaterThanOrEqual(40)
  })

  it('花瓣会侧摆飘落，不是直上直下', () => {
    const petal = ruleBlock(css, '.bloom-layer .bl-petal')

    expect(petal, '找不到花瓣规则').not.toBe('')
    expect(petal, '花瓣大小要由 JS 变量给出').toContain('var(--szw')
    // 侧向飘移由 @keyframes petalFall 承担（下面单独断言）；基础规则里只要求每片花瓣有自己的倾角与缩放
    expect(petal, '每片花瓣要有自己的倾角').toContain('var(--rot')
    expect(petal, '每片花瓣要有自己的缩放').toContain('var(--scale')
    expect(petal, '花瓣动画要由 --dur/--delay 错峰').toContain('var(--dur')

    const fall = ruleBlock(css, '@keyframes petalFall')

    expect(fall, '找不到花瓣飘落关键帧').not.toBe('')
    expect(fall, '花瓣要左右侧摆而不是一条直线落下去').toContain('var(--sway')
  })
})
