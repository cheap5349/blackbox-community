import bcrypt from 'bcryptjs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from './db.js'
import { sniffFile } from './media-utils.js'

const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads')

const starterCommunities = [
  ['音乐角落', '分享旋律、歌单与那些值得反复聆听的时刻。'],
  ['镜头之外', '交换摄影灵感，收藏光影与城市的呼吸。'],
  ['灵感实验室', '把脑海里的点子、设计与代码慢慢做成作品。'],
  ['讨论区', '把说不出口的话留在这里，没有人知道你是谁。'],
]

const starterPosts = [
  [
    '周末歌单：把黄昏留在耳机里',
    '整理了一组适合傍晚散步时听的歌。没有复杂的编排，只有一点点温柔和刚好落下的夕阳。欢迎把你的私藏也留在评论里。',
    '音乐角落',
  ],
  ['柔光里的元气瞬间', '今天在公园拍到一组逆光人像，风吹起发丝的时候，连普通的下午也有了电影感。', '镜头之外'],
  ['给社区做了一张暖色调海报', '试着用纸张纹理、低饱和配色和一点微动效，把“相遇”这件事做得更有温度。', '灵感实验室'],
]

async function migrateMediaTypes() {
  try {
    const [rows] = await pool.query('SELECT id, media FROM posts WHERE media IS NOT NULL')
    for (const row of rows) {
      let list
      if (Array.isArray(row.media)) list = row.media
      else {
        try {
          list = JSON.parse(row.media)
        } catch {
          list = []
        }
      }
      if (!Array.isArray(list)) continue
      const changed = list.map((item) => {
        if (item && typeof item === 'object' && item.url) return item
        if (typeof item !== 'string') return item
        // 对象存储 URL 无本地文件可嗅探，跳过（避免误改）
        if (!item.startsWith('/uploads/')) return item
        const type = sniffFile(path.join(uploadsDir, path.basename(item)))
        return type ? { url: item, type } : item
      })
      if (changed.some((x) => typeof x === 'object')) {
        await pool.query('UPDATE posts SET media=? WHERE id=?', [JSON.stringify(changed), row.id])
      }
    }
  } catch (error) {
    console.warn('媒体类型迁移失败：', error.message)
  }
}

export async function seedDatabase() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'").catch((error) => {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error
    })
    await pool.query('ALTER TABLE users ADD COLUMN avatar MEDIUMTEXT NULL').catch((error) => {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error
    })
    await pool.query('ALTER TABLE users ADD COLUMN bio VARCHAR(200) NULL').catch((error) => {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error
    })
    // 评论 / 点赞表迁移（旧库不存在时自动创建，删除帖子时级联清理）
    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS comments(
      id INT PRIMARY KEY AUTO_INCREMENT,
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      content VARCHAR(500) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`
      )
      .catch((e) => console.warn('comments 表迁移失败：', e.message))
    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS likes(
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(post_id,user_id),
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`
      )
      .catch((e) => console.warn('likes 表迁移失败：', e.message))
    // 举报表：帖子被删除时级联清理
    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS reports(
      id INT PRIMARY KEY AUTO_INCREMENT,
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      reason VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      handled_at TIMESTAMP NULL,
      handled_by INT NULL,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`
      )
      .catch((e) => console.warn('reports 表迁移失败：', e.message))

    /* ===== 治理与运营能力（P1）=====
       旧库通过下面的 ALTER / CREATE 增量补齐，与 schema.sql 保持一致。
       加字段一律 .catch 掉 ER_DUP_FIELDNAME，让迁移可以反复执行。 */
    const addColumn = (sql) =>
      pool.query(sql).catch((error) => {
        if (error.code !== 'ER_DUP_FIELDNAME') console.warn('字段迁移失败：', error.message)
      })
    // 封禁 / 禁言：status 为 active|banned，muted_until 为 NULL 表示未禁言
    await addColumn("ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'")
    await addColumn('ALTER TABLE users ADD COLUMN muted_until TIMESTAMP NULL DEFAULT NULL')
    // 置顶 / 加精
    await addColumn('ALTER TABLE posts ADD COLUMN pinned TINYINT(1) NOT NULL DEFAULT 0')
    await addColumn('ALTER TABLE posts ADD COLUMN featured TINYINT(1) NOT NULL DEFAULT 0')

    // 列表排序用的索引（重复创建会报 ER_DUP_KEYNAME，同样忽略）
    const addIndex = (sql) =>
      pool.query(sql).catch((error) => {
        if (error.code !== 'ER_DUP_KEYNAME') console.warn('索引迁移失败：', error.message)
      })
    await addIndex('CREATE INDEX idx_posts_created ON posts(created_at)')
    await addIndex('CREATE INDEX idx_posts_community ON posts(community_id, created_at)')
    await addIndex('CREATE INDEX idx_comments_post ON comments(post_id, created_at)')
    await addIndex('CREATE INDEX idx_reports_status ON reports(status, created_at)')

    // 通知表：actor 注销后置空（保留快照名字），帖子删除则级联清理
    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS notifications(
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      actor_id INT NULL,
      actor_name VARCHAR(40) NULL,
      type VARCHAR(20) NOT NULL,
      post_id INT NULL,
      comment_id INT NULL,
      body VARCHAR(200) NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE)`
      )
      .catch((e) => console.warn('notifications 表迁移失败：', e.message))
    await addIndex('CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at)')

    // 指定管理员账号
    await pool.query("UPDATE users SET role='admin' WHERE LOWER(name)='dante' AND role != 'admin'").catch(() => {})
    await pool
      .query("UPDATE users SET role='admin' WHERE email='welcome@blackbox.local' AND role != 'admin'")
      .catch(() => {})

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', ['welcome@blackbox.local'])
    let ownerId = existing[0]?.id
    if (!ownerId) {
      const password = await bcrypt.hash('blackbox-demo', 10)
      const [result] = await pool.query('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)', [
        '黑盒管理员',
        'welcome@blackbox.local',
        password,
        'admin',
      ])
      ownerId = result.insertId
    }

    for (const [name, description] of starterCommunities) {
      const [rows] = await pool.query('SELECT id FROM communities WHERE name = ? LIMIT 1', [name])
      if (!rows.length)
        await pool.query('INSERT INTO communities(name,description,owner_id) VALUES(?,?,?)', [
          name,
          description,
          ownerId,
        ])
    }

    const [postCount] = await pool.query('SELECT COUNT(*) AS count FROM posts')
    if (postCount[0].count === 0) {
      for (const [title, content, communityName] of starterPosts) {
        const [community] = await pool.query('SELECT id FROM communities WHERE name = ? LIMIT 1', [communityName])
        await pool.query('INSERT INTO posts(title,content,media,community_id,user_id) VALUES(?,?,?,?,?)', [
          title,
          content,
          JSON.stringify([]),
          community[0].id,
          ownerId,
        ])
      }
    }

    await migrateMediaTypes()
  } catch (error) {
    console.warn('初始社区数据未写入：', error.message)
  }
}
