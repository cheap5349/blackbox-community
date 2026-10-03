import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { setupDb, getApp, register, tinyPng, closePool } from './helpers.js'

let app
before(async () => {
  await setupDb()
  app = await getApp()
})
after(closePool)

describe('auth', () => {
  it('注册返回 token + user + 7 天 expires_at', async () => {
    const email = `a${Date.now()}@t.com`
    const res = await request(app).post('/api/auth/register').send({ name: '测甲', email, password: '123456' })
    assert.equal(res.status, 200)
    assert.ok(res.body.token)
    assert.equal(res.body.user.name, '测甲')
    const in7d = Math.floor(Date.now() / 1000) + 7 * 24 * 3600
    assert.ok(Math.abs(res.body.expires_at - in7d) < 300, 'expires_at 应为 7 天')
  })

  it('注册校验：缺字段 / 密码过短 / 邮箱重复', async () => {
    assert.equal(
      (await request(app).post('/api/auth/register').send({ name: '', email: 'x@t.com', password: '123456' })).status,
      400
    )
    assert.equal(
      (await request(app).post('/api/auth/register').send({ name: 'x', email: 'y@t.com', password: '123' })).status,
      400
    )
    await request(app).post('/api/auth/register').send({ name: 'dup', email: 'dup@t.com', password: '123456' })
    assert.equal(
      (await request(app).post('/api/auth/register').send({ name: 'dup2', email: 'dup@t.com', password: '123456' }))
        .status,
      400
    )
  })

  it('登录：密码错误 401，正确返回 token + expires_at', async () => {
    const reg = await register(app, '登录甲')
    assert.equal(
      (await request(app).post('/api/auth/login').send({ email: reg.user.email, password: 'wrong' })).status,
      401
    )
    const ok = await request(app).post('/api/auth/login').send({ email: reg.user.email, password: '123456' })
    assert.equal(ok.status, 200)
    assert.ok(ok.body.expires_at)
  })

  it('/auth/me：有效 / 过期 / 伪造 / 无 token 四种情况', async () => {
    const { config } = await import('../config.js')
    const reg = await register(app, '过期甲')
    const ok = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ' + reg.token)
    assert.equal(ok.status, 200)
    // 过期 token（同一密钥，exp 设为过去）
    const expired = jwt.sign({ id: reg.user.id, name: 'x', role: 'user' }, config.jwtSecret, { expiresIn: -10 })
    const ex = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ' + expired)
    assert.equal(ex.status, 401)
    assert.equal(ex.body.message, '登录已过期，请重新登录')
    // 伪造 token（错误密钥）
    const forged = jwt.sign({ id: 1, name: 'x', role: 'user' }, 'bad-secret')
    const fg = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ' + forged)
    assert.equal(fg.status, 401)
    assert.equal(fg.body.message, '请先登录')
    assert.equal((await request(app).get('/api/auth/me')).status, 401)
  })

  it('PUT /me 更新资料；头像上传：合法图片成功 / 伪造 mimetype 被文件头校验拦截', async () => {
    const reg = await register(app, '资料甲')
    const up = await request(app)
      .put('/api/auth/me')
      .set('Authorization', 'Bearer ' + reg.token)
      .send({ name: '新名字', bio: '你好', avatar: 'data:image/png;base64,abc' })
    assert.equal(up.status, 200)
    assert.equal(up.body.user.name, '新名字')
    const av = await request(app)
      .post('/api/auth/avatar')
      .set('Authorization', 'Bearer ' + reg.token)
      .attach('avatar', tinyPng(), { filename: 'a.png', contentType: 'image/png' })
    assert.equal(av.status, 200)
    assert.match(av.body.avatar, /^\/uploads\//)
    const bad = await request(app)
      .post('/api/auth/avatar')
      .set('Authorization', 'Bearer ' + reg.token)
      .attach('avatar', Buffer.from('not-an-image'), { filename: 'fake.jpg', contentType: 'image/jpeg' })
    assert.equal(bad.status, 400)
  })
})
