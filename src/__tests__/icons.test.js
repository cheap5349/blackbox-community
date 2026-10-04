// 图标集守卫：页面里所有"当作图标用的文本字符"都必须换成 SVG 路径。
// 这些字符在不同字体/系统下渲染差异极大，甚至显示成空心方框（缺失占位），
// 因此用测试盯住集合的完整性与路径语法。
import { describe, expect, it } from 'vitest'
import { ICONS, ICON_NAMES, iconPaths } from '../icons.js'

// HeaderBar 导航、操作区与新增组件依赖的图标名
const REQUIRED = [
  'compass',
  'users',
  'chat',
  'refresh',
  'search',
  'bell',
  'plus',
  'spark',
  'close',
  'arrowRight',
  'play',
  'pause',
  'volume',
  'volumeMute',
  'note',
  'activity',
  'sun',
  'moon',
  // 发帖编辑器工具条
  'smile',
  'image',
  'save',
  'expand',
]

describe('图标集', () => {
  it('覆盖页面用到的全部图标名', () => {
    for (const name of REQUIRED) expect(ICON_NAMES).toContain(name)
  })

  it('每个图标名都是安全的驼峰标识符', () => {
    for (const name of ICON_NAMES) expect(name).toMatch(/^[a-z][a-zA-Z0-9]*$/)
  })

  it('每个图标都至少有一条路径', () => {
    for (const name of ICON_NAMES) {
      expect(Array.isArray(ICONS[name]), `${name} 应为数组`).toBe(true)
      expect(ICONS[name].length, `${name} 路径为空`).toBeGreaterThan(0)
    }
  })

  it('路径以 M / m 起笔，且不含未替换的模板残留', () => {
    for (const name of ICON_NAMES) {
      for (const d of ICONS[name]) {
        expect(typeof d, `${name} 的路径应为字符串`).toBe('string')
        expect(d.trim(), `${name} 的路径未以 M/m 起笔：${d}`).toMatch(/^[Mm]/)
        expect(d, `${name} 的路径含非法字符：${d}`).not.toMatch(/NaN|undefined|null/)
      }
    }
  })

  it('未知图标名降级为空数组而不是抛错', () => {
    expect(iconPaths('__not_exists__')).toEqual([])
    expect(iconPaths('compass')).toEqual(ICONS.compass)
    expect(iconPaths(undefined)).toEqual([])
  })
})
