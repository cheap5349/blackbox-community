import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileTemplate, parse } from '@vue/compiler-sfc'

// 背景：内联多语句事件处理器（@click="a = 1; b = 2"）被 Prettier 拆行后，
// Vue 模板表达式解析会失败，而单元测试与 lint 都不编译模板，只有 vite build 才报错。
// 这道守卫把「模板必须能编译」提前到测试阶段。

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..')

function collectVueFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...collectVueFiles(full))
    else if (entry.endsWith('.vue')) files.push(full)
  }
  return files
}

const vueFiles = collectVueFiles(srcDir)

describe('Vue 单文件组件模板守卫', () => {
  it('扫描范围覆盖全部组件与视图', () => {
    expect(vueFiles.length).toBeGreaterThanOrEqual(20)
  })

  for (const file of vueFiles) {
    const rel = file.slice(srcDir.length + 1).replace(/\\/g, '/')

    it(`${rel} 能编译为渲染函数`, () => {
      const source = readFileSync(file, 'utf8')
      const { descriptor, errors } = parse(source, { filename: file })
      expect(errors.map((error) => error.message)).toEqual([])
      if (!descriptor.template) return

      const result = compileTemplate({
        id: rel,
        filename: file,
        source: descriptor.template.content,
      })
      const messages = result.errors.map((error) => (typeof error === 'string' ? error : error.message))
      expect(messages).toEqual([])
    })
  }
})
