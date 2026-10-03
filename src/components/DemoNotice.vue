<script setup>
// 静态演示版角标：只在 VITE_DEMO=1 的构建里由 App.vue 挂载（判断在父组件做，
// 这里保持无状态，方便单独测试渲染结果）。
import { DEMO_NOTICE } from '../demo.js'
import AppIcon from './AppIcon.vue'
</script>

<template>
  <aside class="demo-notice" role="status" aria-label="静态演示版说明">
    <AppIcon name="info" :size="14" />
    <span>{{ DEMO_NOTICE }}</span>
  </aside>
</template>
