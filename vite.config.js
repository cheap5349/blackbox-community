import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 部署在子路径（例如 GitHub Pages 的 /<repo>/）时由构建环境传入 VITE_BASE_PATH；
// 本地开发与常规部署保持根路径 '/'。
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [vue()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/uploads': 'http://localhost:3000' } },
})
