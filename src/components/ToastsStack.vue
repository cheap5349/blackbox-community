<script setup>
import { useToasts } from '../composables/useToasts.js'
import AppIcon from './AppIcon.vue'
const { toasts } = useToasts()

const iconFor = (type) => (type === 'success' ? 'spark' : type === 'error' ? 'close' : 'info')
</script>

<template>
  <div v-if="toasts.length" class="toast-stack" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">
      <AppIcon :name="iconFor(t.type)" :size="14" />
      <span>{{ t.message }}</span>
    </div>
  </div>
</template>
