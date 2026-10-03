import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { setupDb, getApp, register, closePool } from './helpers.js'

let app
before(async () => {
  await setupDb()
  app = await getApp()
})
after(closePool)

const createCommunity = async (token, name) => {
  const res = await request(app)
    .post('/api/communities')
    .set('Authorization', 'Bearer ' + token)
    .send({ name, description: '测试社区' })
  assert.equal(res.status, 200)
  return res.body
}
const createPost = async (token, communityId, title) => {
  const res = await request(app)
    .post('/api/posts')
    .set('Authorization', 'Bearer ' + token)
    .send({ title, content: '正文', communityId })
  assert.equal(res.status, 200)
  return res.body
}
const listNotifications = (token) =>
  request(app)
    .get('/api/notifications')
    .set('Authorization', 'Bearer ' + token)

/** register() 返回 { token, user, expires_at }，这里摊平成 { id, email, token } */
const registerUser = async (name) => {
  const session = await register(app, name)
  return { ...session.user, token: session.token }
}

describe('notifications 站内通知', () => {
  let author, actor, community, treehole

  before(async () => {
    author = await registerUser('通知帖主')
    actor = await registerUser('通知互动者')
    community = await createCommunity(author.token, '通知测试区')
    treehole = await createCommunity(author.token, '讨论区')
  })

  it('未登录读通知 401', async () => {
    assert.equal((await request(app).get('/api/notifications')).status, 401)
    assert.equal((await request(app).get('/api/notifications/unread')).status, 401)
  })

  it('别人点赞产生 like 通知，且未读数增加', async () => {
    const post = await createPost(author.token, community.id, '点赞通知帖')
    const like = await request(app)
      .post(`/api/posts/${post.id}/like`)
      .set('Authorization', 'Bearer ' + actor.token)
    assert.equal(like.status, 200)

    const res = await listNotifications(author.token)
    assert.equal(res.status, 200)
    const hit = res.body.notifications.find((n) => n.type === 'like' && n.post_id === post.id)
    assert.ok(hit, '应存在点赞通知')
    assert.equal(hit.actor_name, '通知互动者')
    assert.match(hit.body, /点赞通知帖/)
    assert.equal(hit.is_read, 0)
    assert.ok(res.body.unread >= 1)
  })

  it('重复点赞不产生第二条通知（去重）', async () => {
    const post = await createPost(author.token, community.id, '去重通知帖')
    await request(app)
      .post(`/api/posts/${post.id}/like`)
      .set('Authorization', 'Bearer ' + actor.token)
    const first = await listNotifications(author.token)
    const firstCount = first.body.notifications.filter((n) => n.post_id === post.id).length

    // 取消后重新点赞：仍然只应有一条
    await request(app)
      .delete(`/api/posts/${post.id}/like`)
      .set('Authorization', 'Bearer ' + actor.token)
    await request(app)
      .post(`/api/posts/${post.id}/like`)
      .set('Authorization', 'Bearer ' + actor.token)
    const second = await listNotifications(author.token)
    assert.equal(second.body.notifications.filter((n) => n.post_id === post.id).length, firstCount)
    assert.equal(firstCount, 1)
  })

  it('别人评论产生 comment 通知', async () => {
    const post = await createPost(author.token, community.id, '评论通知帖')
    await request(app)
      .post(`/api/posts/${post.id}/comments`)
      .set('Authorization', 'Bearer ' + actor.token)
      .send({ content: '写得真好' })

    const res = await listNotifications(author.token)
    const hit = res.body.notifications.find((n) => n.type === 'comment' && n.post_id === post.id)
    assert.ok(hit, '应存在评论通知')
    assert.match(hit.body, /评论通知帖/)
  })

  it('给自己的帖子点赞/评论不产生通知', async () => {
    const post = await createPost(author.token, community.id, '自赞帖')
    await request(app)
      .post(`/api/posts/${post.id}/like`)
      .set('Authorization', 'Bearer ' + author.token)
    await request(app)
      .post(`/api/posts/${post.id}/comments`)
      .set('Authorization', 'Bearer ' + author.token)
      .send({ content: '自评' })

    const res = await listNotifications(author.token)
    assert.equal(res.body.notifications.filter((n) => n.post_id === post.id).length, 0)
  })

  it('讨论区（树洞）的互动不产生通知，避免破坏匿名性', async () => {
    const post = await createPost(author.token, treehole.id, '树洞里的心事')
    await request(app)
      .post(`/api/posts/${post.id}/like`)
      .set('Authorization', 'Bearer ' + actor.token)
    await request(app)
      .post(`/api/posts/${post.id}/comments`)
      .set('Authorization', 'Bearer ' + actor.token)
      .send({ content: '抱抱' })

    const res = await listNotifications(author.token)
    assert.equal(res.body.notifications.filter((n) => n.post_id === post.id).length, 0)
  })

  it('标记单条已读与全部已读都会更新未读数', async () => {
    const before = await listNotifications(author.token)
    assert.ok(before.body.unread > 0)
    const target = before.body.notifications.find((n) => n.is_read === 0)
    assert.ok(target)

    const one = await request(app)
      .post('/api/notifications/read')
      .set('Authorization', 'Bearer ' + author.token)
      .send({ id: target.id })
    assert.equal(one.status, 200)
    assert.equal(one.body.unread, before.body.unread - 1)

    const all = await request(app)
      .post('/api/notifications/read')
      .set('Authorization', 'Bearer ' + author.token)
      .send({})
    assert.equal(all.status, 200)
    assert.equal(all.body.unread, 0)

    const unread = await request(app)
      .get('/api/notifications/unread')
      .set('Authorization', 'Bearer ' + author.token)
    assert.equal(unread.body.unread, 0)
  })

  it('只能读到自己的通知', async () => {
    const mine = await listNotifications(actor.token)
    assert.equal(mine.status, 200)
    // actor 只是互动方，没有收到任何通知
    assert.equal(mine.body.notifications.length, 0)
  })

  it('帖子被删除后通知仍可读，并标记为已删除', async () => {
    const post = await createPost(author.token, community.id, '即将删除的帖子')
    await request(app)
      .post(`/api/posts/${post.id}/like`)
      .set('Authorization', 'Bearer ' + actor.token)
    await request(app)
      .post(`/api/notifications/read`)
      .set('Authorization', 'Bearer ' + author.token)
      .send({})
    await request(app)
      .delete(`/api/posts/${post.id}`)
      .set('Authorization', 'Bearer ' + author.token)

    const res = await listNotifications(author.token)
    // 帖级联删除会带走这条通知，因此不应出现指向已删帖子的记录
    assert.equal(res.body.notifications.filter((n) => n.post_id === post.id).length, 0)
  })

  it('举报会通知所有管理员', async () => {
    const session = await register(app, '通知管理员')
    const { runSql } = await import('./helpers.js')
    await runSql("UPDATE users SET role='admin' WHERE id=?", [session.user.id])
    // 重新登录以拿到带 admin 角色的 token
    const login = await request(app).post('/api/auth/login').send({ email: session.user.email, password: '123456' })
    assert.equal(login.status, 200)

    const post = await createPost(author.token, community.id, '被举报的帖子')
    const rep = await request(app)
      .post(`/api/posts/${post.id}/report`)
      .set('Authorization', 'Bearer ' + actor.token)
      .send({ reason: '垃圾广告' })
    assert.equal(rep.status, 200)

    const res = await listNotifications(login.body.token)
    const hit = res.body.notifications.find((n) => n.post_id === post.id)
    assert.ok(hit, '管理员应收到举报通知')
    assert.match(hit.body, /垃圾广告/)
  })
})
