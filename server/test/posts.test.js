import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { setupDb, getApp, register, tinyPng, closePool } from './helpers.js'

let app
before(async () => {
  await setupDb()
  app = await getApp()
})
after(closePool)

async function createCommunity(token, name) {
  const res = await request(app)
    .post('/api/communities')
    .set('Authorization', 'Bearer ' + token)
    .send({ name, description: '测试社区' })
  assert.equal(res.status, 200)
  return res.body
}

describe('posts', () => {
  let a, b, community
  before(async () => {
    a = await register(app, '帖主甲')
    b = await register(app, '帖主乙')
    community = await createCommunity(a.token, '测试区')
  })

  it('未登录发帖 401；登录发帖成功', async () => {
    assert.equal(
      (await request(app).post('/api/posts').send({ title: 't', content: 'c', communityId: community.id })).status,
      401
    )
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + a.token)
      .send({ title: '标题', content: '内容', communityId: community.id })
    assert.equal(res.status, 200)
    assert.equal(res.body.title, '标题')
  })

  it('带图上传成功（本地模式返回 /uploads/ url 与 key）', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + a.token)
      .field('title', '带图帖')
      .field('content', '内容')
      .field('communityId', community.id)
      .attach('images', tinyPng(), { filename: 'p.png', contentType: 'image/png' })
    assert.equal(res.status, 200)
    assert.equal(res.body.media.length, 1)
    assert.equal(res.body.media[0].type, 'image')
    assert.match(res.body.media[0].url, /^\/uploads\//)
    assert.ok(res.body.media[0].key)
  })

  it('伪造 mimetype 的非法文件被文件头校验拦截 400', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + a.token)
      .field('title', '坏文件')
      .field('content', '内容')
      .field('communityId', community.id)
      .attach('images', Buffer.from('just text'), { filename: 'evil.jpg', contentType: 'image/jpeg' })
    assert.equal(res.status, 400)
  })

  it('帖子列表 / 详情', async () => {
    const list = await request(app).get('/api/posts?limit=5')
    assert.equal(list.status, 200)
    assert.ok(list.body.total >= 2)
    const detail = await request(app).get(`/api/posts/${list.body.posts[0].id}`)
    assert.equal(detail.status, 200)
    assert.ok(detail.body.id)
  })

  it('编辑：本人可改，他人 403', async () => {
    const p = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + a.token)
      .send({ title: '原标题', content: 'x', communityId: community.id })
    const ed = await request(app)
      .put(`/api/posts/${p.body.id}`)
      .set('Authorization', 'Bearer ' + a.token)
      .send({ title: '新标题', content: 'y', communityId: community.id })
    assert.equal(ed.status, 200)
    assert.equal(ed.body.title, '新标题')
    const forbid = await request(app)
      .put(`/api/posts/${p.body.id}`)
      .set('Authorization', 'Bearer ' + b.token)
      .send({ title: '篡改', content: 'y', communityId: community.id })
    assert.equal(forbid.status, 403)
  })

  it('点赞 / 取消点赞', async () => {
    const p = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + a.token)
      .send({ title: '点赞帖', content: 'x', communityId: community.id })
    const like = await request(app)
      .post(`/api/posts/${p.body.id}/like`)
      .set('Authorization', 'Bearer ' + b.token)
    assert.equal(like.status, 200)
    assert.equal(like.body.liked, true)
    assert.equal(like.body.likeCount, 1)
    const unlike = await request(app)
      .delete(`/api/posts/${p.body.id}/like`)
      .set('Authorization', 'Bearer ' + b.token)
    assert.equal(unlike.body.liked, false)
  })

  it('评论：发表 / 删除（本人可删，他人 403）', async () => {
    const p = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + a.token)
      .send({ title: '评论帖', content: 'x', communityId: community.id })
    const c = await request(app)
      .post(`/api/posts/${p.body.id}/comments`)
      .set('Authorization', 'Bearer ' + b.token)
      .send({ content: '好帖' })
    assert.equal(c.status, 200)
    assert.equal(c.body.comment.content, '好帖')
    const forbid = await request(app)
      .delete(`/api/posts/comments/${c.body.comment.id}`)
      .set('Authorization', 'Bearer ' + a.token)
    assert.equal(forbid.status, 403)
    const ok = await request(app)
      .delete(`/api/posts/comments/${c.body.comment.id}`)
      .set('Authorization', 'Bearer ' + b.token)
    assert.equal(ok.status, 200)
  })

  it('举报：他人可举报 / 重复 400 / 举报自己 400 / 详情带 reported', async () => {
    const p = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + a.token)
      .send({ title: '举报帖', content: 'x', communityId: community.id })
    const rep = await request(app)
      .post(`/api/posts/${p.body.id}/report`)
      .set('Authorization', 'Bearer ' + b.token)
      .send({ reason: '垃圾广告' })
    assert.equal(rep.status, 200)
    assert.equal(
      (
        await request(app)
          .post(`/api/posts/${p.body.id}/report`)
          .set('Authorization', 'Bearer ' + b.token)
          .send({ reason: '重复' })
      ).status,
      400
    )
    assert.equal(
      (
        await request(app)
          .post(`/api/posts/${p.body.id}/report`)
          .set('Authorization', 'Bearer ' + a.token)
          .send({ reason: 'x' })
      ).status,
      400
    )
    const detail = await request(app)
      .get(`/api/posts/${p.body.id}`)
      .set('Authorization', 'Bearer ' + b.token)
    assert.equal(detail.body.reported, 1)
  })

  it('删除：本人可删，他人 403', async () => {
    const p = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + a.token)
      .send({ title: '删除帖', content: 'x', communityId: community.id })
    assert.equal(
      (
        await request(app)
          .delete(`/api/posts/${p.body.id}`)
          .set('Authorization', 'Bearer ' + b.token)
      ).status,
      403
    )
    assert.equal(
      (
        await request(app)
          .delete(`/api/posts/${p.body.id}`)
          .set('Authorization', 'Bearer ' + a.token)
      ).status,
      200
    )
  })
})
