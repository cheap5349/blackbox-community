import { computed, ref } from 'vue'
import { useReveal } from './useReveal.js'

// 滚动相关 UI：顶部进度条 / 回顶按钮 / 导航栏显隐 / 滚动期间暂停装饰动画
const showBackTop = ref(false)
const scrollProgress = ref(0)
const headerScrolled = ref(false)
const headerHidden = ref(false)
let lastScrollY = 0
let scrollTicking = false
let scrollStopTimer = null

const backTopOffset = computed(() => (100.53 * (1 - scrollProgress.value / 100)).toFixed(1))

function markScrolling() {
  // 滚动期间暂停装饰性 CSS 动画与背景视频，减少重绘与解码开销
  document.documentElement.dataset.scrolling = '1'
  useReveal().pauseBgMedia()
  clearTimeout(scrollStopTimer)
  scrollStopTimer = setTimeout(() => {
    delete document.documentElement.dataset.scrolling
    useReveal().resumeBgMedia()
  }, 150)
}
function onScroll() {
  // rAF 节流：把高频 scroll 事件合并到每帧一次
  if (scrollTicking) return
  scrollTicking = true
  markScrolling()
  requestAnimationFrame(() => {
    scrollTicking = false
    const y = window.scrollY
    const doc = document.documentElement
    const max = doc.scrollHeight - doc.clientHeight
    showBackTop.value = y > 480
    headerScrolled.value = y > 16
    if (y > lastScrollY + 4) headerHidden.value = true
    else if (y < lastScrollY - 4) headerHidden.value = false
    lastScrollY = y
    scrollProgress.value = max > 0 ? Math.min(100, (y / max) * 100) : 0
  })
}

export function useScrollUi() {
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })
  const setupScroll = () => {
    window.addEventListener('scroll', onScroll, { passive: true })
  }
  const teardownScroll = () => {
    window.removeEventListener('scroll', onScroll)
    clearTimeout(scrollStopTimer)
  }
  return {
    showBackTop,
    scrollProgress,
    headerScrolled,
    headerHidden,
    backTopOffset,
    scrollTop,
    setupScroll,
    teardownScroll,
  }
}
