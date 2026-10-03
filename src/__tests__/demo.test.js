import { describe, expect, it } from 'vitest'
import {
  DEMO_MODE,
  DEMO_NOTICE,
  DEMO_WRITE_MESSAGE,
  demoApi,
  demoCommunities,
  demoCommentsOf,
  demoCommunity,
  demoFeed,
  demoPost,
  demoPosts,
} from '../demo.js'

// 演示模式只在 VITE_DEMO=1 的构建里打开，所以这些测试全部直接调用导出的函数，
// 不依赖 import.meta.env —— 也要保证默认构建走的仍是真实接口。
describe('静态演示数据', () => {
  it('默认（未设置 VITE_DEMO）不开启演示模式', () => {
    expect(DEMO_MODE).toBe(false)
  })

  it('示例帖子与社区的字段和接口返回形状一致', () => {
    const required = [
      'id',
      'author',
      'author_avatar',
      'user_id',
      'community_id',
      'community',
      'title',
      'content',
      'created_at',
      'like_count',
      'comment_count',
      'media',
      'pinned',
      'featured',
      'liked',
      'reported',
    ]

    for (const post of demoPosts) {
      for (const key of required) expect(post, `帖子 ${post.id} 缺少字段 ${key}`).toHaveProperty(key)
      expect(Array.isArray(post.media), `帖子 ${post.id} 的 media 应该是数组`).toBe(true)
      expect(Number.isNaN(Date.parse(post.created_at)), `帖子 ${post.id} 的 created_at 不可解析`).toBe(false)
    }

    for (const community of demoCommunities) {
      expect(typeof community.id).toBe('string')
      expect(community.name.length).toBeGreaterThan(0)
      expect(community).toHaveProperty('postCount')
    }
  })

  it('默认按时间倒序，且 limit / offset 生效', () => {
    const first = demoFeed({ limit: 3 })

    expect(first.posts).toHaveLength(3)
    expect(first.total).toBe(demoPosts.length)

    const times = first.posts.map((p) => Date.parse(p.created_at))
    expect(times).toEqual([...times].sort((a, b) => b - a))

    const second = demoFeed({ limit: 3, offset: 3 })
    expect(second.posts[0].id).not.toBe(first.posts[0].id)
    expect(demoFeed({ offset: demoPosts.length }).posts).toHaveLength(0)
  })

  it('支持社区过滤与关键词搜索', () => {
    const music = demoFeed({ communityId: 'music', limit: 50 })

    expect(music.posts.length).toBeGreaterThan(0)
    expect(music.posts.every((p) => p.community_id === 'music')).toBe(true)

    const hit = demoFeed({ q: '黑胶', limit: 50 })

    expect(hit.posts).toHaveLength(1)
    expect(hit.posts[0].id).toBe(104)
    expect(demoFeed({ q: '这个词肯定搜不到' }).posts).toHaveLength(0)
    expect(demoFeed({ userId: '999999' }).posts).toHaveLength(0)
  })

  it('featured 只留加精帖，hot 按热度衰减排序', () => {
    const featured = demoFeed({ sort: 'featured', limit: 50 })

    expect(featured.posts.length).toBeGreaterThan(0)
    expect(featured.posts.every((p) => Boolean(p.featured))).toBe(true)

    const hot = demoFeed({ sort: 'hot', limit: 50 })
    const score = (p) =>
      (p.like_count + 2 * p.comment_count) / Math.pow((Date.now() - Date.parse(p.created_at)) / 3600_000 + 2, 1.5)

    expect(hot.posts).toHaveLength(demoPosts.length)
    expect(score(hot.posts[0])).toBeGreaterThanOrEqual(score(hot.posts[hot.posts.length - 1]))
  })

  it('详情、评论与社区查询在找不到时给出 null / 空集', () => {
    expect(demoPost(101).title).toContain('周末歌单')
    expect(demoPost(999999)).toBeNull()
    expect(demoCommentsOf(101).comments).toHaveLength(2)
    expect(demoCommentsOf(999999).total).toBe(0)
    expect(demoCommunity('tech').name).toBe('技术闲聊')
    expect(demoCommunity('nope')).toBeNull()
  })
})

describe('demoApi 迷你路由', () => {
  it('健康检查直接通过，供性能徽标测量延迟', () => {
    expect(demoApi('/health')).toEqual({ ok: true })
  })

  it('GET 请求返回示例数据', () => {
    expect(demoApi('/posts?limit=2&sort=hot').posts).toHaveLength(2)
    expect(demoApi('/posts/101').id).toBe(101)
    expect(demoApi('/posts/101/comments').comments).toHaveLength(2)
    expect(demoApi('/communities')).toHaveLength(demoCommunities.length)
    expect(demoApi('/communities/music/posts?limit=2')).toHaveLength(2)
    expect(demoApi('/communities/music').name).toBe('音乐角落')
    expect(demoApi('/notifications/unread').unread).toBe(0)
  })

  it('写入操作给出可读提示，而不是 404', () => {
    const writes = [
      ['/posts', { method: 'POST', body: '{}' }],
      ['/posts/101/like', { method: 'POST' }],
      ['/auth/login', { method: 'POST', body: '{}' }],
      ['/auth/me', {}],
    ]

    for (const [url, options] of writes) {
      expect(() => demoApi(url, options), `${url} 应该被拒绝`).toThrow(DEMO_WRITE_MESSAGE)
    }
  })

  it('缺失的帖子与社区给出明确错误', () => {
    expect(() => demoApi('/posts/999999')).toThrow('帖子不存在')
    expect(() => demoApi('/communities/nope')).toThrow('社区不存在')
  })

  it('提示文案说明这是只读演示', () => {
    expect(DEMO_NOTICE).toContain('静态演示版')
    expect(DEMO_WRITE_MESSAGE).toContain('只读')
  })
})
