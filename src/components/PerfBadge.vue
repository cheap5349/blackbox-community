<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { formatFps, formatLatency } from '../performance.js'
import { usePerformance } from '../composables/usePerformance.js'
import AppIcon from './AppIcon.vue'

const { fps, latency, quality, supported, start, stop } = usePerformance()
const open = ref(false)

onMounted(start)
onBeforeUnmount(stop)
</script>

<template>
  <div class="perf-badge" :class="`perf-${quality}`">
    <button
      class="perf-toggle"
      type="button"
      :aria-expanded="open ? 'true' : 'false'"
      aria-label="实时性能指标：帧率与接口延迟"
      title="实时帧率与接口延迟"
      @click="open = !open"
    >
      <AppIcon name="activity" :size="14" />
      <span class="perf-fps">{{ formatFps(fps) }}</span>
      <span class="perf-unit">FPS</span>
      <i class="perf-sep" aria-hidden="true"></i>
      <span class="perf-latency">{{ formatLatency(latency) }}</span>
    </button>

    <dl v-if="open" class="perf-detail" role="status">
      <div class="perf-row">
        <dt>帧率</dt>
        <dd>{{ formatFps(fps) }} FPS</dd>
      </div>
      <div class="perf-row">
        <dt>接口延迟</dt>
        <dd>{{ formatLatency(latency) }}</dd>
      </div>
      <div class="perf-row">
        <dt>状态</dt>
        <dd>{{ supported ? quality : '不可用' }}</dd>
      </div>
      <p class="perf-note">采样自本机渲染与 /api/health，仅作参考</p>
    </dl>
  </div>
</template>
