import { describe, it } from 'node:test'
import assert from 'node:assert'
import { findBlockedWords, findMaskedWords, inspectText, maskText } from '../sensitive-filter.js'

describe('sensitive-filter 敏感词过滤', () => {
  it('正常内容不命中，原样返回', () => {
    const result = inspectText('周末歌单：把黄昏留在耳机里', '整理了一组适合傍晚散步时听的歌。')
    assert.equal(result.ok, true)
    assert.deepEqual(result.blocked, [])
    assert.deepEqual(result.masked, [])
    assert.equal(result.text[0], '周末歌单：把黄昏留在耳机里')
  })

  it('block 词命中：判定不通过并列出命中词', () => {
    const result = inspectText('代开发票，需要的联系')
    assert.equal(result.ok, false)
    assert.deepEqual(result.blocked, ['代开发票'])
  })

  it('mask 词命中：ok 为 true，但文本被等长打码', () => {
    const result = inspectText('加微信 免费领取教程')
    assert.equal(result.ok, true)
    assert.deepEqual(result.masked.sort(), ['免费领取', '加微信'].sort())
    // 等长：打码不改变长度，后端长度校验与前端渲染位置都不会错位
    assert.equal(result.text[0].length, '加微信 免费领取教程'.length)
    assert.equal(result.text[0], '＊＊＊ ＊＊＊＊教程')
  })

  it('标题与正文合并检查：任一段命中 block 即拒绝', () => {
    const result = inspectText('正常标题', '正文里夹带枪支弹药')
    assert.equal(result.ok, false)
    assert.deepEqual(result.blocked, ['枪支弹药'])
  })

  it('绕过手法：全角字符、插入空格与分隔符仍能命中', () => {
    // 全角
    assert.deepEqual(findBlockedWords('代开发票'), ['代开发票'])
    // 插入空格
    assert.deepEqual(findMaskedWords('加 微 信'), ['加微信'])
    // 插入分隔符与全角混用
    assert.deepEqual(findMaskedWords('加·微·信'), ['加微信'])
    assert.deepEqual(findBlockedWords('枪-支-弹-药'), ['枪支弹药'])
  })

  it('大小写不敏感', () => {
    assert.deepEqual(findMaskedWords('加QQ'), ['加qq'])
    assert.deepEqual(findMaskedWords('加qq'), ['加qq'])
  })

  it('打码后保持原文标点与未命中部分不变', () => {
    assert.equal(maskText('大家好，这里可以加微信哦'), '大家好，这里可以＊＊＊哦')
  })

  it('空输入与非法输入不抛错', () => {
    assert.equal(inspectText().ok, true)
    assert.equal(inspectText('').ok, true)
    assert.equal(inspectText(null, undefined, 123).ok, true)
    assert.equal(maskText(null), '')
  })

  it('命中词去重', () => {
    assert.deepEqual(findMaskedWords('加微信加微信加微信'), ['加微信'])
  })
})
