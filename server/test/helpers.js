// 测试辅助：重建测试库 → 切到 heibox_test → 导入 app 供 supertest 使用
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'
import request from 'supertest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const TEST_DB = 'heibox_test'
const connOpts = () => ({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
})

// 重建测试库并套用 schema.sql（每个测试文件独立子进程，互不干扰）
export async function setupDb() {
  const conn = await mysql.createConnection(connOpts())
  await conn.query(`DROP DATABASE IF EXISTS ${TEST_DB}`)
  await conn.query(`CREATE DATABASE ${TEST_DB} DEFAULT CHARACTER SET utf8mb4`)
  const sql = fs
    .readFileSync(path.join(root, 'server', 'schema.sql'), 'utf8')
    .replace(/CREATE DATABASE[^;]*;/, '')
    .replace('USE heibox;', `USE ${TEST_DB};`)
  await conn.query(sql)
  await conn.end()
}

// 设置 DB_NAME 并导入 app（db.js 在 import 时按环境变量建连接池）
export async function getApp() {
  process.env.DB_NAME = TEST_DB
  // 测试会连续注册大量账号，超过面向真实用户的登录/注册限流阈值。
  // 必须在 import app 之前设置，限流中间件在构建时就读取了这个开关。
  process.env.RATE_LIMIT_DISABLED = '1'
  const { app } = await import('../app.js')
  return app
}

// 关闭应用连接池，否则测试进程不会退出（mysql2 连接句柄会挂住事件循环）
export async function closePool() {
  try {
    const { pool } = await import('../db.js')
    await pool.end()
  } catch {
    /* 忽略 */
  }
}

// 对测试库执行 SQL（如把某用户提权为 admin）
export async function runSql(sql, params = []) {
  const conn = await mysql.createConnection({ ...connOpts(), database: TEST_DB })
  try {
    const [rows] = await conn.query(sql, params)
    return rows
  } finally {
    await conn.end()
  }
}

// 超集客户端：注册并返回 token + 用户
export async function register(app, name) {
  const email = `${name.replace(/\s+/g, '').toLowerCase()}${Date.now()}@test.local`
  const res = await request(app).post('/api/auth/register').send({ name, email, password: '123456' })
  if (res.status !== 200) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body
}

// 生成 1x1 合法 PNG（用于上传测试）
export const tinyPng = () =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
