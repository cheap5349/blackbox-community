import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env') })
const required = ['DB_HOST', 'DB_USER', 'DB_NAME']
if (required.some((key) => !process.env[key])) console.warn('未读取到完整数据库配置，请在项目根目录创建 .env')
export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'blackbox',
  connectionLimit: 10,
})
