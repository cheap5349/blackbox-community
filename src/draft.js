// 发帖草稿：只碰 localStorage，不依赖 store，方便单独测试与复用
export const DRAFT_KEY = 'heibox.write.draft.v1'

function storageOf(storage) {
  if (storage) return storage
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function asText(value) {
  return typeof value === 'string' ? value : ''
}

function asId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return typeof value === 'string' ? value : ''
}

// 字段本身存在、但不是字符串（说明存储被写坏了）：这种不当成"空草稿"丢掉
function malformed(value) {
  return value !== undefined && value !== null && typeof value !== 'string'
}

export function readDraft(storage) {
  const box = storageOf(storage)
  if (!box) return null

  let raw = null
  try {
    raw = box.getItem(DRAFT_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const title = asText(parsed.title)
  const content = asText(parsed.content)
  if (!malformed(parsed.title) && !malformed(parsed.content) && !title.trim() && !content.trim()) return null

  const savedAt = typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0
  return { title, content, communityId: asId(parsed.communityId), savedAt }
}

export function saveDraft(draft = {}, storage) {
  const title = asText(draft.title)
  const content = asText(draft.content)
  if (!title.trim() && !content.trim()) return 0

  const box = storageOf(storage)
  if (!box) return 0

  const savedAt = Date.now()
  try {
    box.setItem(DRAFT_KEY, JSON.stringify({ title, content, communityId: asId(draft.communityId), savedAt }))
  } catch {
    return 0
  }
  return savedAt
}

export function clearDraft(storage) {
  const box = storageOf(storage)
  if (!box) return
  try {
    box.removeItem(DRAFT_KEY)
  } catch {
    // 存储不可用时静默跳过，不影响发帖
  }
}

export function draftTime(savedAt) {
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt <= 0) return ''
  const at = new Date(savedAt)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}
