// 媒体工具：通过文件头识别真实类型（不信任客户端 mimetype）
import fs from 'fs'

// 纯函数：前 12 字节判断 JPEG/PNG/GIF/WebP/MP4/MOV，识别失败返回 null
export function sniffBuffer(buf) {
  if (!buf || buf.length < 4) return null
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image' // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image' // PNG
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image' // GIF
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image' // RIFF(WebP)
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video' // MP4/MOV
  return null
}

export function readHead(filepath, len = 12) {
  const fd = fs.openSync(filepath, 'r')
  try {
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, 0)
    return buf
  } finally {
    fs.closeSync(fd)
  }
}

export function sniffFile(filepath) {
  try {
    return sniffBuffer(readHead(filepath, 12))
  } catch {
    return null
  }
}
