// 敏感词过滤。
//
// 设计取舍：这里做的是**分层处理**，而不是一律拒绝——
//   block 类（违法违规、明显攻击性内容）直接拒绝发布；
//   mask  类（广告导流、联系方式）替换成等长占位符，保留可读性。
// 这样既能挡住真正需要拦的内容，又不会因为一个普通词把正常讨论卡死。
//
// 词库放在代码里而不是数据库：它需要随代码评审一起变更，也要能在测试里
// 直接断言，不依赖任何运行时数据。这里是**演示用**的最小集合，
// 真实业务应替换为受维护的词库或第三方内容安全服务。

const BLOCK_WORDS = [
  // 违法违规
  '代开发票',
  '办证刻章',
  '枪支弹药',
  '毒品交易',
  '赌博平台',
  '洗钱',
  // 明显攻击性内容
  '傻逼',
  '滚出去',
  '去死吧',
]

const MASK_WORDS = [
  // 广告导流
  '加微信',
  '加qq',
  '扫码进群',
  '免费领取',
  '点击链接',
  '刷单',
  '返利',
  // 联系方式
  '微信号',
  'qq号',
  '手机号',
]

export const SENSITIVE_RULE_MESSAGE = '内容包含违规信息，请修改后再发布'

/*
 * 归一化后再匹配，避免最朴素的绕过：
 *   1. 全角转半角——「加微信」写成「加微信」用全角字符时仍要命中；
 *   2. 去掉空白与常见分隔符——「加 微 信」「加-微-信」同样命中；
 *   3. 转小写——QQ / qq 统一。
 * 记录每个保留字符在原文中的下标，才能把命中区间映射回原文做等长打码。
 */
// 需要丢弃的字符：空白与常见分隔符。用字符集合而不是全局正则，
// 避免 test() 在带 g 标志时依赖 lastIndex 的行为。
const DROP_CHARS = new Set([
  ' ',
  '\t',
  '\n',
  '\r',
  '\u3000',
  '·',
  '・',
  '.',
  '-',
  '_',
  '*',
  '~',
  '`',
  '|',
  '/',
  '\\',
  '+',
])
const FULLWIDTH_OFFSET = 0xfee0

function normalize(text) {
  const source = String(text ?? '')
  let normalized = ''
  const map = []
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    const code = char.charCodeAt(0)
    // 全角 ASCII（！-～）折回半角
    const folded = code >= 0xff01 && code <= 0xff5e ? String.fromCharCode(code - FULLWIDTH_OFFSET) : char
    if (DROP_CHARS.has(folded)) continue
    normalized += folded.toLowerCase()
    map.push(i)
  }
  return { normalized, map }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 在归一化文本上找出命中的词，并映射回原文区间 */
function findHits(text, words) {
  const { normalized, map } = normalize(text)
  if (!normalized) return []
  const hits = []
  const seen = new Set()
  for (const raw of words) {
    const word = String(raw || '')
    if (!word) continue
    const pattern = new RegExp(escapeRegExp(word.toLowerCase()), 'g')
    let match
    while ((match = pattern.exec(normalized)) !== null) {
      const start = map[match.index]
      const end = map[Math.min(match.index + match[0].length - 1, map.length - 1)]
      if (start === undefined || end === undefined) continue
      hits.push({ word: raw, start, end: end + 1 })
      seen.add(raw)
      // 零长匹配保护
      if (match[0].length === 0) pattern.lastIndex += 1
    }
  }
  return hits
    .map((hit) => ({ ...hit, word: hit.word }))
    .filter(
      (hit, index, all) =>
        // 去掉被更长命中完全覆盖的短命中，避免重复提示
        !all.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            other.start <= hit.start &&
            other.end >= hit.end &&
            other.end - other.start > hit.end - hit.start
        )
    )
}

/** 命中的 block 词（去重），用于给用户/管理员提示 */
export function findBlockedWords(text) {
  return [...new Set(findHits(text, BLOCK_WORDS).map((hit) => hit.word))]
}

/** 命中的 mask 词（去重） */
export function findMaskedWords(text) {
  return [...new Set(findHits(text, MASK_WORDS).map((hit) => hit.word))]
}

/**
 * 把 mask 词替换成等长占位符。保持长度不变，后端字段长度校验和
 * 前端渲染位置都不会因为过滤而错位。
 */
export function maskText(text) {
  const source = String(text ?? '')
  const hits = findHits(source, MASK_WORDS)
  if (!hits.length) return source
  const chars = [...source]
  for (const { start, end } of hits) {
    for (let i = start; i < end && i < chars.length; i += 1) chars[i] = '＊'
  }
  return chars.join('')
}

/**
 * 检查一段或多段文本。返回 { ok, blocked, masked, text }：
 *   ok    为 false 时调用方应直接拒绝（HTTP 400）；
 *   text  是与入参等长的数组，元素为打码后的文本；
 *   blocked / masked 是命中的词，便于日志与提示。
 */
export function inspectText(...parts) {
  const strings = parts.map((part) => (typeof part === 'string' ? part : ''))
  const joined = strings.join('\n')
  const blocked = findBlockedWords(joined)
  if (blocked.length) return { ok: false, blocked, masked: [], text: strings }
  const masked = findMaskedWords(joined)
  return {
    ok: true,
    blocked: [],
    masked,
    text: masked.length ? strings.map((part) => maskText(part)) : strings,
  }
}
