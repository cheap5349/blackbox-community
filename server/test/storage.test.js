import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createStorage } from '../storage.js'

describe('storage', () => {
  it('本地模式：上传写盘 → 返回 /uploads/ url → 删除', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heibox-st-'))
    const s = createStorage({ uploadsDir: dir })
    const { url, key } = await s.uploadFile({ key: 't/1.png', buffer: Buffer.from('x'), contentType: 'image/png' })
    assert.equal(url, '/uploads/t/1.png')
    assert.equal(key, 't/1.png')
    assert.equal(fs.readFileSync(path.join(dir, 't/1.png')).toString(), 'x')
    await s.deleteFile(url)
    assert.ok(!fs.existsSync(path.join(dir, 't/1.png')))
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('keyFromUrl：本地 /uploads/ 与 S3 绝对 URL 均能反解', () => {
    const local = createStorage({ uploadsDir: os.tmpdir() })
    assert.equal(local.keyFromUrl('/uploads/a.png'), 'a.png')
    const s3 = createStorage({ client: {}, bucket: 'b', publicBase: 'http://h:9000/b' })
    assert.equal(s3.keyFromUrl('http://h:9000/b/a/b.png'), 'a/b.png')
  })

  it('S3 模式：下发 PutObject / DeleteObject 命令', async () => {
    const sent = []
    const fake = {
      send: async (cmd) => {
        sent.push({ ctor: cmd.constructor.name, input: cmd.input })
      },
    }
    const s = createStorage({ client: fake, bucket: 'b', publicBase: 'http://h:9000/b' })
    assert.ok(s.isS3())
    const { url, key } = await s.uploadFile({ key: 'a.png', buffer: Buffer.from('x'), contentType: 'image/png' })
    assert.equal(url, 'http://h:9000/b/a.png')
    assert.equal(key, 'a.png')
    await s.deleteFile(url)
    assert.equal(sent.length, 2)
    assert.equal(sent[0].ctor, 'PutObjectCommand')
    assert.equal(sent[0].input.Bucket, 'b')
    assert.equal(sent[0].input.Key, 'a.png')
    assert.equal(sent[1].ctor, 'DeleteObjectCommand')
    assert.equal(sent[1].input.Key, 'a.png')
  })
})
