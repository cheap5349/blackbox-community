<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { sparkColors } from '../utils.js'

const cursor = ref({ x: -100, y: -100, ringX: -100, ringY: -100, visible: false, interactive: false })
const cursorDotEl = ref(null)
const cursorRingEl = ref(null)
let cursorFrame
const cursorTarget =
  'button, a, input, textarea, select, .post-card, .profile-panel, .tags button, .community-card, .my-item, .my-item-body, .my-delete, .admin-row, .search-item'
let curX = -100,
  curY = -100,
  ringX = -100,
  ringY = -100

function moveCursor(event) {
  if (event.pointerType && event.pointerType !== 'mouse') return
  curX = event.clientX
  curY = event.clientY
  if (!cursor.value.visible) cursor.value.visible = true
  const dot = cursorDotEl.value
  if (dot) {
    dot.style.left = curX + 'px'
    dot.style.top = curY + 'px'
  }
}
function checkCursorTarget(event) {
  cursor.value.interactive = Boolean(event.target.closest(cursorTarget))
}
function animateCursor() {
  // 直接写 DOM transform，避免每帧触发 Vue 响应式渲染
  ringX += (curX - ringX) * 0.16
  ringY += (curY - ringY) * 0.16
  const ring = cursorRingEl.value
  if (ring) {
    ring.style.left = ringX + 'px'
    ring.style.top = ringY + 'px'
  }
  cursorFrame = window.requestAnimationFrame(animateCursor)
}
function spawnSpark(event) {
  if (event.pointerType && event.pointerType !== 'mouse') return
  const spark = document.createElement('span')
  spark.className = 'spark'
  const angle = Math.random() * Math.PI * 2
  const dist = 24 + Math.random() * 30
  spark.style.left = `${event.clientX}px`
  spark.style.top = `${event.clientY}px`
  spark.style.setProperty('--tx', `${Math.cos(angle) * dist}px`)
  spark.style.setProperty('--ty', `${Math.sin(angle) * dist}px`)
  spark.style.setProperty('--size', `${5 + Math.random() * 7}px`)
  spark.style.background = sparkColors[Math.floor(Math.random() * sparkColors.length)]
  document.body.appendChild(spark)
  setTimeout(() => spark.remove(), 750)
}

onMounted(() => {
  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', moveCursor)
    window.addEventListener('pointerover', checkCursorTarget)
    animateCursor()
  }
  window.addEventListener('pointerdown', spawnSpark, { passive: true })
})
onBeforeUnmount(() => {
  if (cursorFrame) cancelAnimationFrame(cursorFrame)
  window.removeEventListener('pointermove', moveCursor)
  window.removeEventListener('pointerover', checkCursorTarget)
  window.removeEventListener('pointerdown', spawnSpark)
})
</script>

<template>
  <div ref="cursorDotEl" class="cursor-dot" :class="{ visible: cursor.visible, interactive: cursor.interactive }"></div>
  <div
    ref="cursorRingEl"
    class="cursor-ring"
    :class="{ visible: cursor.visible, interactive: cursor.interactive }"
  ></div>
</template>
