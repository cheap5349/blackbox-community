import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { setupDb, getApp, register, runSql, closePool } from './helpers.js'

let app
before(async () => {
  await setupDb()
  app = await getApp()
})
after(closePool)

// 提权后需重新登录，JWT 里的 role 在签发时固化（与线上行为一致）
async function makeAdmin() {
  const reg = await register(app, '管理员')
  await runSql("UPDATE users SET role='admin' WHERE id=?", [reg.user.id])
  const login = await request(app).post('/api/auth/login').send({ email: reg.user.email, password: '123456' })
  assert.equal(login.status, 200)
  return login.body
}

describe('admin', () => {
  it('非管理员访问后台 403', async () => {
    const u = await register(app, '普通用户')
    assert.equal(
      (
        await request(app)
          .get('/api/admin/stats')
          .set('Authorization', 'Bearer ' + u.token)
      ).status,
      403
    )
  })

  it('管理员统计含 reports 字段', async () => {
    const adm = await makeAdmin()
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', 'Bearer ' + adm.token)
    assert.equal(res.status, 200)
    assert.ok('reports' in res.body)
  })

  it('举报处置闭环：列表 → 忽略 → 已处理不可再处置 → 再举报 → 删除帖子并结案', async () => {
    const adm = await makeAdmin()
    const reporter = await register(app, '举报人')
    const author = await register(app, '被举报')
    const comm = await request(app)
      .post('/api/communities')
      .set('Authorization', 'Bearer ' + author.token)
      .send({ name: '治理区', description: 'x' })
    const p = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + author.token)
      .send({ title: '被举报帖', content: 'x', communityId: comm.body.id })
    await request(app)
      .post(`/api/posts/${p.body.id}/report`)
      .set('Authorization', 'Bearer ' + reporter.token)
      .send({ reason: '人身攻击' })

    const list = await request(app)
      .get('/api/admin/reports?status=pending')
      .set('Authorization', 'Bearer ' + adm.token)
    assert.equal(list.status, 200)
    const report = list.body.reports.find((r) => r.post_id === p.body.id)
    assert.ok(report, '举报应在列表中')

    const dis = await request(app)
      .post(`/api/admin/reports/${report.id}/resolve`)
      .set('Authorization', 'Bearer ' + adm.token)
      .send({ action: 'dismiss' })
    assert.equal(dis.status, 200)
    assert.equal(
      (
        await request(app)
          .post(`/api/admin/reports/${report.id}/resolve`)
          .set('Authorization', 'Bearer ' + adm.token)
          .send({ action: 'dismiss' })
      ).status,
      400
    )

    await request(app)
      .post(`/api/posts/${p.body.id}/report`)
      .set('Authorization', 'Bearer ' + reporter.token)
      .send({ reason: '不实信息' })
    const list2 = await request(app)
      .get('/api/admin/reports?status=pending')
      .set('Authorization', 'Bearer ' + adm.token)
    const rep2 = list2.body.reports.find((r) => r.post_id === p.body.id)
    assert.ok(rep2, '二次举报应出现在待处理列表')
    const del = await request(app)
      .post(`/api/admin/reports/${rep2.id}/resolve`)
      .set('Authorization', 'Bearer ' + adm.token)
      .send({ action: 'delete' })
    assert.equal(del.status, 200)
    assert.equal((await request(app).get(`/api/posts/${p.body.id}`)).status, 404, '删除帖子后应 404')
  })
})
