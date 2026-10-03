// 纯工具函数单元测试：拆分后视图/组件共用的静态数据与格式化函数
import { describe, expect, it } from 'vitest'
import {
  isImage,
  mediaOf,
  initials,
  relativeDate,
  joinDate,
  likeCount,
  greet,
  starField,
  starStyle,
  meteorStyle,
  petalStyle,
  bloomStyle,
  treeholeTags,
  reportReasons,
} from '../utils.js'

describe('mediaOf / isImage', () => {
  it('按扩展名判断图片', () => {
    expect(isImage('/a/b.png')).toBe(true)
    expect(isImage('/a/b.mp4')).toBe(false)
  })
  it('解析对象数组：保留 type 与 url', () => {
    const list = mediaOf({
      media: [
        { url: '/a.png', type: 'image' },
        { url: '/b.mp4', type: 'video' },
      ],
    })
    expect(list).toEqual([
      { url: '/a.png', type: 'image' },
      { url: '/b.mp4', type: 'video' },
    ])
  })
  it('解析 JSON 字符串媒体字段', () => {
    expect(mediaOf({ media: '["/a.jpg","/b.mp4"]' }).map((m) => m.type)).toEqual(['image', 'video'])
  })
  it('媒体字段为裸字符串（非 JSON）时返回空数组', () => {
    // 与原有实现一致：mediaOf 只接受数组或 JSON 数组字符串
    expect(mediaOf({ media: '/x.webp' })).toEqual([])
  })
  it('空值/非法值返回空数组', () => {
    expect(mediaOf({})).toEqual([])
    expect(mediaOf(null)).toEqual([])
  })
})

describe('initials', () => {
  it('取首个字符并大写，未传参时缺省用「社」', () => {
    expect(initials('阿澄')).toBe('阿')
    expect(initials('alice')).toBe('A')
    expect(initials()).toBe('社')
  })
  it('空串/纯空白返回空串（与原有实现一致）', () => {
    expect(initials('')).toBe('')
    expect(initials('   ')).toBe('')
  })
})

describe('relativeDate', () => {
  it('1 小时内显示刚刚', () => {
    expect(relativeDate(new Date(Date.now() - 60000).toISOString())).toBe('刚刚')
  })
  it('24 小时内显示小时数', () => {
    expect(relativeDate(new Date(Date.now() - 7200000).toISOString())).toBe('2 小时前')
  })
  it('更早显示天数', () => {
    expect(relativeDate(new Date(Date.now() - 3 * 86400000).toISOString())).toBe('3 天前')
  })
  it('空值返回空串', () => {
    expect(relativeDate(null)).toBe('')
  })
})

describe('joinDate / likeCount / greet', () => {
  it('joinDate 格式化为年月', () => {
    expect(joinDate('2026-08-01T00:00:00Z')).toBe('2026 年 8 月')
  })
  it('likeCount 数字兜底', () => {
    expect(likeCount({ like_count: '42' })).toBe(42)
    expect(likeCount({})).toBe(0)
  })
  it('greet 按小时返回问候', () => {
    const h = new Date().getHours()
    const expected = h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
    expect(greet()).toBe(expected)
  })
})

describe('装饰层样式生成器', () => {
  it('starStyle 生成百分比位置与 CSS 变量', () => {
    const s = starStyle(1)
    expect(s.left).toContain('%')
    expect(s.top).toContain('%')
    expect(s['--dur']).toContain('s')
  })
  it('bloomStyle 三种形态均返回 left/top 与变量', () => {
    for (const kind of ['orb', 'spark', 'aurora']) {
      const b = bloomStyle(3, kind)
      expect(b.left).toBeDefined()
      expect(b['--dur']).toBeDefined()
    }
  })
  it('starStyle 按远近分层给出大小、色调与闪烁节奏', () => {
    const far = starStyle(3)
    const near = starStyle(2)

    expect(far['--depth']).toBe(1)
    expect(near['--depth']).toBe(3)
    expect(far['--sz']).not.toBe(near['--sz'])
    expect(far['--tint']).toContain('radial-gradient')
    expect(near['--glow']).not.toBe(far['--glow'])
    expect(far['--tw']).toContain('s')
    expect(far['--tdelay']).toContain('s')
  })
  it('bloomStyle 支持粉色极光带形态', () => {
    const aurora = bloomStyle(2, 'aurora')
    expect(aurora.left).toContain('%')
    expect(aurora['--dur']).toContain('s')
    expect(aurora['--rot']).toContain('deg')
  })
  it('静态标签表完整性', () => {
    expect(treeholeTags).toContain('心事')
    expect(reportReasons).toContain('人身攻击')
  })
})

describe('漫天星河与落英缤纷的生成器', () => {
  const points = (field) => field.split(',').map((p) => p.trim())

  it('starField 用一串 box-shadow 铺出成片星尘（整片只占一个 DOM 节点）', () => {
    const far = points(starField('far'))

    expect(far.length, '远景星尘至少 200 颗才叫漫天').toBeGreaterThanOrEqual(200)
    for (const point of far.slice(0, 20)) {
      expect(point).toMatch(/^\d+px -?\d+px 0 \d+px #[0-9a-f]{6}[0-9a-f]{2}$/)
    }
  })

  it('starField 是确定性的：同一种子给出同一张星图，不同种类给出不同结果', () => {
    expect(starField('mid', 2)).toBe(starField('mid', 2))
    expect(starField('far')).not.toBe(starField('mid'))
  })

  it('starField 的 band 沿对角线聚集成银河，而不是均匀撒点', () => {
    const band = points(starField('band')).map((p) => {
      const [x, y] = p.split(' ')
      return [Number.parseInt(x, 10), Number.parseInt(y, 10)]
    })
    const onLine = band.filter(([x, y]) => Math.abs(y - x * (1700 / 2600)) < 320).length

    expect(onLine / band.length, '银河带应该聚在一条斜线上').toBeGreaterThan(0.6)
  })

  it('meteorStyle 给出长度、粗细、错峰延迟，且旋转角与位移方向一致', () => {
    for (let n = 1; n <= 16; n += 1) {
      const s = meteorStyle(n)

      expect(s.left).toContain('%')
      expect(s.top).toContain('%')
      expect(s['--len']).toMatch(/px$/)
      expect(s['--thick']).toMatch(/px$/)
      expect(s['--dur']).toMatch(/s$/)
      expect(s['--delay']).toMatch(/s$/)
      expect(s['--fx']).toContain('vmax')
      expect(s['--fy']).toContain('vmax')

      // 角度必须等于 atan2(fy, fx)：否则拖尾方向与飞行方向不一致，看起来是"斜着飘"
      const fx = Number.parseFloat(s['--fx'])
      const fy = Number.parseFloat(s['--fy'])
      const angle = Number.parseFloat(s['--angle'])

      expect(fy, '流星要往下坠，fy 必须为正').toBeGreaterThan(0)
      expect(s['--angle']).toContain('deg')
      expect(angle).toBeCloseTo((Math.atan2(fy, fx) * 180) / Math.PI, 0)
    }
  })

  it('meteorStyle 有左有右、起点铺满整个视野，才叫肆坠', () => {
    const styles = Array.from({ length: 16 }, (_, i) => meteorStyle(i + 1))
    const rights = styles.filter((s) => Number.parseFloat(s['--fx']) > 0)
    const lefts = styles.filter((s) => Number.parseFloat(s['--fx']) < 0)

    expect(rights.length, '至少要有几条向右下').toBeGreaterThan(2)
    expect(lefts.length, '至少要有几条向左下').toBeGreaterThan(2)
    expect(new Set(styles.map((s) => Math.round(Number.parseFloat(s.top)))).size).toBeGreaterThan(8)
  })

  it('petalStyle 给出大小、侧摆、翻转与错峰', () => {
    for (let n = 1; n <= 8; n += 1) {
      const p = petalStyle(n)

      expect(p.left).toContain('%')
      expect(p['--szw']).toMatch(/^[\d.]+px$/)
      expect(p['--szh']).toMatch(/^[\d.]+px$/)
      expect(p['--sway']).toMatch(/vw$/)
      expect(p['--rot']).toMatch(/deg$/)
      expect(p['--spin']).toMatch(/deg$/)
      expect(p['--dur']).toMatch(/s$/)
      expect(p['--delay']).toMatch(/s$/)
      expect(Number(p['--alpha'])).toBeGreaterThan(0.5)
    }
  })
})
