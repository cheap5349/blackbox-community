import { describe, expect, it, vi } from 'vitest'
import { DRAFT_KEY, clearDraft, draftTime, readDraft, saveDraft } from '../draft.js'

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => map,
  }
}

describe('发帖草稿', () => {
  it('存进去能原样读出来', () => {
    const storage = memoryStorage()

    const at = saveDraft({ title: '标题', content: '正文', communityId: 5 }, storage)
    const draft = readDraft(storage)

    expect(at).toBeGreaterThan(0)
    expect(draft.title).toBe('标题')
    expect(draft.content).toBe('正文')
    expect(draft.communityId).toBe(5)
    expect(draft.savedAt).toBe(at)
  })

  it('没有草稿时返回 null', () => {
    expect(readDraft(memoryStorage())).toBeNull()
  })

  it('标题正文都空，等于没有草稿', () => {
    const storage = memoryStorage()
    saveDraft({ title: '   ', content: '', communityId: '' }, storage)

    expect(readDraft(storage)).toBeNull()
  })

  it('存了空内容不会覆盖已有草稿', () => {
    const storage = memoryStorage()
    saveDraft({ title: '有内容', content: '正文' }, storage)

    const at = saveDraft({ title: '', content: '' }, storage)

    expect(at).toBe(0)
    expect(readDraft(storage).title).toBe('有内容')
  })

  it('存储里是坏 JSON 也不抛错', () => {
    const storage = memoryStorage({ [DRAFT_KEY]: '{不完整的 json' })

    expect(() => readDraft(storage)).not.toThrow()
    expect(readDraft(storage)).toBeNull()
  })

  it('存储本身不可用时静默降级', () => {
    const broken = {
      getItem: () => {
        throw new Error('quota')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('quota')
      },
    }

    expect(readDraft(broken)).toBeNull()
    expect(saveDraft({ title: 'x', content: 'y' }, broken)).toBe(0)
    expect(() => clearDraft(broken)).not.toThrow()
  })

  it('clearDraft 清掉草稿', () => {
    const storage = memoryStorage()
    saveDraft({ title: '标题', content: '正文' }, storage)

    clearDraft(storage)

    expect(readDraft(storage)).toBeNull()
  })

  it('草稿时间格式化成 HH:MM', () => {
    const noon = new Date(2026, 9, 4, 9, 5).getTime()

    expect(draftTime(noon)).toBe('09:05')
    expect(draftTime(0)).toBe('')
  })

  it('读草稿时只在字段类型不对时才兜底，不会崩', () => {
    const storage = memoryStorage({ [DRAFT_KEY]: JSON.stringify({ title: 5, content: null, savedAt: 'x' }) })
    const draft = readDraft(storage)

    expect(typeof draft.title).toBe('string')
    expect(typeof draft.content).toBe('string')
    expect(draft.savedAt).toBe(0)
  })

  it('未注入 storage 时使用 localStorage', () => {
    localStorage.clear()
    const at = saveDraft({ title: '默认存储', content: '正文' })

    expect(at).toBeGreaterThan(0)
    expect(readDraft().title).toBe('默认存储')
    expect(vi.isMockFunction(readDraft)).toBe(false)
    clearDraft()
    expect(readDraft()).toBeNull()
  })
})
