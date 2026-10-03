// 对象存储抽象：走 S3 协议（MinIO / 阿里云 OSS / 腾讯云 COS / AWS S3），未配置 S3_* 环境变量时回退本地磁盘
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { S3Client, PutObjectCommand, DeleteObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3'

const UPLOADS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads')

const isS3Configured = () =>
  Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY && process.env.S3_BUCKET)

const makeClient = () =>
  new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  })

// 可注入的存储实现（测试时传 fake client 验证 S3 分支）
export function createStorage(opts = {}) {
  const client = opts.client || (isS3Configured() ? makeClient() : null)
  const bucket = opts.bucket || process.env.S3_BUCKET || ''
  const publicBase = (opts.publicBase ?? process.env.S3_PUBLIC_URL ?? '').replace(/\/+$/, '')
  const uploadsDir = opts.uploadsDir || UPLOADS_DIR

  const isS3 = () => Boolean(client && bucket)
  const publicUrl = (key) => (publicBase ? `${publicBase}/${key}` : `/${key}`)

  const ensureBucket = async () => {
    if (!isS3()) return
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }))
    } catch {
      /* 桶已存在 */
    }
  }

  // 上传：S3 走 PutObject；本地写 uploads 目录。key 由调用方生成（随机文件名）
  const uploadFile = async ({ key, buffer, contentType }) => {
    if (!key) throw new Error('uploadFile 缺少 key')
    if (isS3()) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType || 'application/octet-stream',
        })
      )
      return { url: publicUrl(key), key }
    }
    const dest = path.join(uploadsDir, key)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, buffer)
    return { url: `/uploads/${key}`, key }
  }

  // 从 URL 反解对象 key（S3 按 publicBase 前缀切分，本地按 /uploads/ 前缀）
  const keyFromUrl = (url = '') => {
    if (!url) return ''
    if (publicBase && url.startsWith(publicBase + '/')) return url.slice(publicBase.length + 1).split('?')[0]
    if (url.startsWith('/uploads/')) return url.slice('/uploads/'.length).split('?')[0]
    if (url.startsWith('http')) return path.basename(url.split('?')[0])
    return url.split('?')[0].replace(/^\//, '')
  }

  const deleteFile = async (url, key) => {
    if (!url && !key) return
    if (isS3()) {
      const k = key || keyFromUrl(url)
      if (!k) return
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: k }))
      } catch {
        /* 忽略删除失败 */
      }
      return
    }
    // 本地模式：显式 key 或本地 /uploads/ URL（keyFromUrl 保留子路径），避免误删历史 URL
    const k = key || (url && url.startsWith('/uploads/') ? keyFromUrl(url) : '')
    if (!k) return
    const file = path.join(uploadsDir, k)
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    } catch {
      /* 忽略 */
    }
  }

  return { isS3, ensureBucket, uploadFile, deleteFile, publicUrl, keyFromUrl }
}

// 默认单例：按环境变量决定模式；initStorage() 在服务启动时调用并确保桶存在
let storage = createStorage()

export function initStorage() {
  storage = createStorage()
  if (storage.isS3()) storage.ensureBucket()
  return storage
}

export const isS3 = () => storage.isS3()
export const uploadFile = (o) => storage.uploadFile(o)
export const deleteFile = (url, key) => storage.deleteFile(url, key)
export const keyFromUrl = (url) => storage.keyFromUrl(url)
