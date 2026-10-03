// 前端测试独立配置：只跑 src/ 下的组件/逻辑测试，server/test 由 node --test 负责
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/__tests__/setup.js'],
    include: ['src/**/*.{test,spec}.js'],
    exclude: ['server/**', 'node_modules/**', 'dist/**'],
  },
})
