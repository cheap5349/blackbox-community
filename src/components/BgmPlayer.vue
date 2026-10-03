<script setup>
import { computed, onMounted, ref } from 'vue'
import { AUDIO_DIR_HINT, formatTime, PLAYLIST_URL } from '../bgm.js'
import { useBgm } from '../composables/useBgm.js'
import AppIcon from './AppIcon.vue'

const {
  tracks,
  current,
  index,
  playing,
  volume,
  ready,
  error,
  currentTime,
  duration,
  progress,
  load,
  toggle,
  next,
  prev,
  seek,
  setVolume,
} = useBgm()

const open = ref(false)

// 就地推导，不额外依赖 useBgm 再导出一个 computed
const hasTracks = computed(() => tracks.value.length > 0)
const volumePercent = computed(() => Math.round(Number(volume.value || 0) * 100))
const position = computed(() => (hasTracks.value ? `${index.value + 1}/${tracks.value.length}` : '0/0'))
const played = computed(() => formatTime(currentTime.value))
const total = computed(() => formatTime(duration.value))
const progressValue = computed(() => Math.round(Number(progress.value || 0) * 1000))

onMounted(load)

function onVolume(event) {
  setVolume(Number(event.target.value) / 100)
}

function onSeek(event) {
  seek(Number(event.target.value) / 1000)
}
</script>

<template>
  <div class="bgm-player" :class="{ 'is-open': open, 'is-playing': playing }">
    <!-- 入口是一台小黑胶唱片机：唱片与唱臂都是按钮内容，点击才向右滑出面板 -->
    <button
      class="bgm-toggle"
      type="button"
      :aria-expanded="open ? 'true' : 'false'"
      aria-label="背景音乐播放器"
      :title="playing ? `正在播放：${current?.title || ''}` : '背景音乐'"
      @click="open = !open"
    >
      <span class="bgm-disc" aria-hidden="true">
        <span class="bgm-label">
          <AppIcon :name="playing ? 'pause' : 'note'" :size="13" />
        </span>
      </span>
      <span class="bgm-arm" aria-hidden="true"></span>
      <i v-if="playing" class="bgm-pulse" aria-hidden="true"></i>
    </button>

    <transition name="bgm-slide">
      <section v-if="open" class="bgm-panel" aria-label="背景音乐">
        <header class="bgm-head">
          <span class="bgm-heading">
            <AppIcon name="activity" :size="13" />
            {{ ready ? '黑盒电台' : '正在读取曲目' }}
          </span>
          <button class="bgm-close" type="button" aria-label="收起播放器" @click="open = false">
            <AppIcon name="close" :size="14" />
          </button>
        </header>

        <p v-if="!hasTracks" class="bgm-hint">
          把你自己的 mp3 放进 <code>{{ AUDIO_DIR_HINT }}/</code>，再写一份 <code>{{ PLAYLIST_URL }}</code
          >（格式：<code>{ "tracks": [{ "title": "曲名", "src": "/audio/xx.mp3" }] }</code>）， 或直接放一首
          <code>bgm.mp3</code> 即可开播。
        </p>

        <template v-else>
          <div class="bgm-now">
            <span class="bgm-cover" :class="{ 'is-spinning': playing }" aria-hidden="true">
              <AppIcon name="note" :size="15" />
            </span>
            <span class="bgm-meta">
              <span class="bgm-track">{{ current?.title }}</span>
              <span class="bgm-sub">{{ position }} · 社区背景音乐</span>
            </span>
          </div>

          <div class="bgm-progress-row">
            <span class="bgm-time">{{ played }}</span>
            <input
              class="bgm-progress"
              type="range"
              min="0"
              max="1000"
              :value="progressValue"
              aria-label="播放进度"
              @input="onSeek"
            />
            <span class="bgm-time">{{ total }}</span>
          </div>

          <div class="bgm-controls">
            <button class="bgm-btn" type="button" aria-label="上一首" @click="prev">
              <AppIcon name="arrowRight" :size="15" class="bgm-flip" />
            </button>
            <button class="bgm-btn bgm-play" type="button" :aria-label="playing ? '暂停' : '播放'" @click="toggle">
              <AppIcon :name="playing ? 'pause' : 'play'" :size="16" />
            </button>
            <button class="bgm-btn" type="button" aria-label="下一首" @click="next">
              <AppIcon name="arrowRight" :size="15" />
            </button>
          </div>

          <label class="bgm-volume">
            <AppIcon :name="volumePercent === 0 ? 'volumeMute' : 'volume'" :size="15" />
            <input type="range" min="0" max="100" :value="volumePercent" aria-label="音量" @input="onVolume" />
            <span class="bgm-volume-value">{{ volumePercent }}%</span>
          </label>
        </template>

        <p v-if="error" class="bgm-error">{{ error }}</p>
      </section>
    </transition>
  </div>
</template>
