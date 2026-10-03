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
/* 注册 → 提权 → 重新登录。
   注意 register() 返回的是 { token, user, expires_at }，账号字段在 user 里，
   直接取 session.id 会拿到 undefined。这里统一摊平成 { id, email, token }，
   让测试里写 member.id / admin.id 都是真实存在的值。
   提权后必须重新登录：adminOnly 以数据库角色为准，但新 token 与库里角色
   保持一致，才能同时验证「新 token 有权限」和「旧 token 立刻失权」两件事。 */
const registerAdmin = async (name) => {
  const session = await register(app, name)
  await runSql("UPDATE users SET role='admin' WHERE id=?", [session.user.id])
  const login = await request(app).post('/api/auth/login').send({ email: session.user.email, password: '123456' })
  assert.equal(login.status, 200, `管理员重新登录失败: ${JSON.stringify(login.body)}`)
  return { ...session.user, token: login.body.token }
}

/** 注册并摊平为 { id, name, email, token } */
const registerUser = async (name) => {
  const session = await register(app, name)
  return { ...session.user, token: session.token }
}

describe('admin 用户治理', () => {
  let admin, member, community

  before(async () => {
    admin = await registerAdmin('治理管理员')
    member = await registerUser('被治理用户')
    community = await createCommunity(admin.token, '治理测试区')
  })

  it('非管理员访问后台接口 403', async () => {
    assert.equal(
      (
        await request(app)
          .get('/api/admin/users')
          .set('Authorization', 'Bearer ' + member.token)
      ).status,
      403
    )
    assert.equal(
      (
        await request(app)
          .post(`/api/admin/users/${member.id}/state`)
          .set('Authorization', 'Bearer ' + member.token)
          .send({ action: 'ban' })
      ).status,
      403
    )
  })

  it('封禁后：旧 token 立刻失效（不只是禁止重新登录）', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${member.id}/state`)
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ action: 'ban' })
    assert.equal(res.status, 200)
    assert.equal(res.body.user.status, 'banned')

    // 关键：member 手里还是封禁前签发的 token，也必须被拦下
    const write = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + member.token)
      .send({ title: '封禁后发帖', content: 'x', communityId: community.id })
    assert.equal(write.status, 403)
    assert.equal(write.body.code, 'ACCOUNT_BANNED')

    // 被封禁的账号也不能重新登录
    const login = await request(app).post('/api/auth/login').send({ email: member.email, password: '123456' })
    assert.equal(login.status, 403)
  })

  it('解封后恢复正常', async () => {
    await request(app)
      .post(`/api/admin/users/${member.id}/state`)
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ action: 'unban' })
    const write = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + member.token)
      .send({ title: '解封后发帖', content: 'x', communityId: community.id })
    assert.equal(write.status, 200)
  })

  it('禁言：可以浏览但发帖/评论/点赞被拒 403', async () => {
    const post = await createPost(admin.token, community.id, '禁言期间的帖子')
    const mute = await request(app)
      .post(`/api/admin/users/${member.id}/state`)
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ action: 'mute', hours: 2 })
    assert.equal(mute.status, 200)
    assert.equal(mute.body.user.muted, 1)

    // 读接口不受影响
    assert.equal((await request(app).get('/api/posts')).status, 200)

    const write = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + member.token)
      .send({ title: '禁言发帖', content: 'x', communityId: community.id })
    assert.equal(write.status, 403)
    assert.equal(write.body.code, 'ACCOUNT_MUTED')

    const comment = await request(app)
      .post(`/api/posts/${post.id}/comments`)
      .set('Authorization', 'Bearer ' + member.token)
      .send({ content: '禁言评论' })
    assert.equal(comment.status, 403)

    const like = await request(app)
      .post(`/api/posts/${post.id}/like`)
      .set('Authorization', 'Bearer ' + member.token)
    assert.equal(like.status, 403)

    const unmute = await request(app)
      .post(`/api/admin/users/${member.id}/state`)
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ action: 'unmute' })
    assert.equal(unmute.status, 200)
    const after = await request(app)
      .post(`/api/posts/${post.id}/comments`)
      .set('Authorization', 'Bearer ' + member.token)
      .send({ content: '解禁评论' })
    assert.equal(after.status, 200)
  })

  it('禁言时长非法被拒', async () => {
    for (const hours of [0, -1, 'abc']) {
      const res = await request(app)
        .post(`/api/admin/users/${member.id}/state`)
        .set('Authorization', 'Bearer ' + admin.token)
        .send({ action: 'mute', hours })
      assert.equal(res.status, 400, `hours=${hours} 应被拒绝`)
    }
  })

  it('撤销管理员身份后旧 token 立刻失去后台权限', async () => {
    const second = await registerAdmin('临时管理员')
    // 撤销前可以访问
    assert.equal(
      (
        await request(app)
          .get('/api/admin/users')
          .set('Authorization', 'Bearer ' + second.token)
      ).status,
      200
    )
    const demote = await request(app)
      .post(`/api/admin/users/${second.id}/state`)
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ action: 'demote' })
    assert.equal(demote.status, 200)
    // 撤销后同一个 token 必须立刻 403（角色以数据库为准，不信 token 里的声明）
    assert.equal(
      (
        await request(app)
          .get('/api/admin/users')
          .set('Authorization', 'Bearer ' + second.token)
      ).status,
      403
    )
  })

  it('管理员不能封禁/降权自己，避免把后台锁死', async () => {
    assert.equal(
      (
        await request(app)
          .post(`/api/admin/users/${admin.id}/state`)
          .set('Authorization', 'Bearer ' + admin.token)
          .send({ action: 'ban' })
      ).status,
      400
    )
    assert.equal(
      (
        await request(app)
          .post(`/api/admin/users/${admin.id}/state`)
          .set('Authorization', 'Bearer ' + admin.token)
          .send({ action: 'demote' })
      ).status,
      400
    )
  })

  it('无效操作与不存在的用户返回 4xx', async () => {
    assert.equal(
      (
        await request(app)
          .post(`/api/admin/users/${member.id}/state`)
          .set('Authorization', 'Bearer ' + admin.token)
          .send({ action: 'explode' })
      ).status,
      400
    )
    assert.equal(
      (
        await request(app)
          .post('/api/admin/users/999999/state')
          .set('Authorization', 'Bearer ' + admin.token)
          .send({ action: 'ban' })
      ).status,
      404
    )
  })

  it('用户列表支持按状态筛选并带出治理字段', async () => {
    const res = await request(app)
      .get('/api/admin/users?limit=50')
      .set('Authorization', 'Bearer ' + admin.token)
    assert.equal(res.status, 200)
    const row = res.body.users.find((u) => u.id === member.id)
    assert.ok(row)
    assert.ok('status' in row)
    assert.ok('muted' in row)
  })

  it('统计接口包含封禁与禁言计数', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', 'Bearer ' + admin.token)
    assert.equal(res.status, 200)
    assert.ok('banned' in res.body)
    assert.ok('muted' in res.body)
  })
})

describe('admin 帖子运营与列表排序', () => {
  let admin, member, community

  before(async () => {
    admin = await registerAdmin('运营管理员')
    member = await registerUser('运营测试用户')
    community = await createCommunity(admin.token, '运营测试区')
  })

  it('置顶与加精标记可写可读，非管理员 403', async () => {
    const post = await createPost(member.token, community.id, '待置顶的帖子')
    assert.equal(
      (
        await request(app)
          .post(`/api/admin/posts/${post.id}/flags`)
          .set('Authorization', 'Bearer ' + member.token)
          .send({ pinned: true })
      ).status,
      403
    )

    const res = await request(app)
      .post(`/api/admin/posts/${post.id}/flags`)
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ pinned: true, featured: true })
    assert.equal(res.status, 200)
    assert.equal(res.body.post.pinned, 1)
    assert.equal(res.body.post.featured, 1)

    const clear = await request(app)
      .post(`/api/admin/posts/${post.id}/flags`)
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ pinned: false })
    assert.equal(clear.body.post.pinned, 0)
    assert.equal(clear.body.post.featured, 1)
  })

  it('空标记与不存在的帖子返回 4xx', async () => {
    const post = await createPost(member.token, community.id, '无标记帖子')
    assert.equal(
      (
        await request(app)
          .post(`/api/admin/posts/${post.id}/flags`)
          .set('Authorization', 'Bearer ' + admin.token)
          .send({})
      ).status,
      400
    )
    assert.equal(
      (
        await request(app)
          .post('/api/admin/posts/999999/flags')
          .set('Authorization', 'Bearer ' + admin.token)
          .send({ pinned: true })
      ).status,
      404
    )
  })

  it('置顶帖在 latest 排序中排最前', async () => {
    const older = await createPost(member.token, community.id, '较早的帖子')
    await createPost(member.token, community.id, '较新的帖子')
    await request(app)
      .post(`/api/admin/posts/${older.id}/flags`)
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ pinned: true })

    const res = await request(app).get(`/api/posts?communityId=${community.id}&sort=latest&limit=10`)
    assert.equal(res.status, 200)
    assert.equal(res.body.posts[0].id, older.id, '置顶帖应排最前')
    assert.equal(res.body.posts[0].pinned, 1)
  })

  it('hot 排序把高互动帖子排在前面', async () => {
    const quiet = await createPost(member.token, community.id, '冷清帖子')
    const hot = await createPost(member.token, community.id, '热门帖子')
    for (let i = 0; i < 5; i += 1) {
      const u = await registerUser(`热门点赞人${i}`)
      await request(app)
        .post(`/api/posts/${hot.id}/like`)
        .set('Authorization', 'Bearer ' + u.token)
    }
    await request(app)
      .post(`/api/posts/${hot.id}/comments`)
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ content: '很热' })

    const res = await request(app).get(`/api/posts?communityId=${community.id}&sort=hot&limit=20`)
    assert.equal(res.status, 200)
    const hotIndex = res.body.posts.findIndex((p) => p.id === hot.id)
    const quietIndex = res.body.posts.findIndex((p) => p.id === quiet.id)
    assert.ok(hotIndex >= 0 && quietIndex >= 0)
    assert.ok(hotIndex < quietIndex, '互动多的帖子应排在冷清帖子之前')
  })

  it('featured 排序把加精帖提前', async () => {
    const plain = await createPost(member.token, community.id, '普通帖子')
    const star = await createPost(member.token, community.id, '加精帖子')
    await request(app)
      .post(`/api/admin/posts/${star.id}/flags`)
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ featured: true })

    const res = await request(app).get(`/api/posts?communityId=${community.id}&sort=featured&limit=20`)
    const starIndex = res.body.posts.findIndex((p) => p.id === star.id)
    const plainIndex = res.body.posts.findIndex((p) => p.id === plain.id)
    assert.ok(starIndex < plainIndex, '加精帖应排在普通帖之前')
  })

  it('非法 sort 参数回退到默认排序而不是拼接进 SQL', async () => {
    const res = await request(app).get(
      `/api/posts?communityId=${community.id}&sort=p.created_at;DROP TABLE posts;--&limit=5`
    )
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.posts))
    // 表还在，说明参数没有被当成 SQL 执行
    assert.equal((await request(app).get('/api/posts?limit=1')).status, 200)
  })
})

describe('敏感词在写接口生效', () => {
  let user, community

  before(async () => {
    user = await registerUser('敏感词测试用户')
    community = await createCommunity(user.token, '敏感词测试区')
  })

  it('发帖命中 block 词被拒 400 且不落库', async () => {
    const before = (await request(app).get('/api/posts?limit=1')).body.total
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + user.token)
      .send({ title: '代开发票', content: '需要的联系我', communityId: community.id })
    assert.equal(res.status, 400)
    assert.deepEqual(res.body.blocked, ['代开发票'])
    const after = (await request(app).get('/api/posts?limit=1')).body.total
    assert.equal(after, before, '被拒的帖子不应写入数据库')
  })

  it('发帖命中 mask 词：成功但文本被打码', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + user.token)
      .send({ title: '正常标题', content: '想要教程就加微信找我', communityId: community.id })
    assert.equal(res.status, 200)
    assert.ok(!res.body.content.includes('加微信'), '入库内容应已打码')
    assert.ok(res.body.content.includes('＊'))
  })

  it('评论命中 block 词被拒 400', async () => {
    const post = await createPost(user.token, community.id, '用于评论的帖子')
    const res = await request(app)
      .post(`/api/posts/${post.id}/comments`)
      .set('Authorization', 'Bearer ' + user.token)
      .send({ content: '出售枪支弹药' })
    assert.equal(res.status, 400)
    assert.deepEqual(res.body.blocked, ['枪支弹药'])
  })

  it('编辑帖子同样受敏感词约束', async () => {
    const post = await createPost(user.token, community.id, '可编辑的帖子')
    const res = await request(app)
      .put(`/api/posts/${post.id}`)
      .set('Authorization', 'Bearer ' + user.token)
      .send({ title: '改标题', content: '这里卖赌博平台账号', communityId: community.id })
    assert.equal(res.status, 400)
    assert.deepEqual(res.body.blocked, ['赌博平台'])
  })
})
