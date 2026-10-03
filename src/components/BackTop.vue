<script setup>
import { useScrollUi } from '../composables/useScrollUi.js'
import AppIcon from './AppIcon.vue'
const { showBackTop, backTopOffset, scrollTop } = useScrollUi()
</script>

<template>
  <button v-if="showBackTop" class="back-top" aria-label="回到顶部" @click="scrollTop">
    <svg class="back-top-ring" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="16" fill="none" class="ring-bg"></circle>
      <circle cx="18" cy="18" r="16" fill="none" class="ring-fg" :style="{ strokeDashoffset: backTopOffset }"></circle>
    </svg>
    <AppIcon name="arrowUp" :size="18" class="back-top-icon" />
  </button>
</template>
