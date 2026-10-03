import { nextTick } from 'vue'

// 滚动进入视口渐显（.reveal）与个人名片背景媒体的视口播放控制
let revealObserver = null
let bgMediaObserver = null

export function useReveal() {
  const bindReveals = () => {
    if (revealObserver) revealObserver.disconnect()
    const targets = document.querySelectorAll('.reveal:not(.in)')
    if (!('IntersectionObserver' in window) || !targets.length) {
      targets.forEach((el) => el.classList.add('in'))
      return
    }
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add('in')
            revealObserver.unobserve(en.target)
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -28px 0px' }
    )
    targets.forEach((el) => revealObserver.observe(el))
  }

  /* 背景媒体：图片直接显示；视频进入视口即播放，离开视口立即暂停 */
  const bindBgMedia = () => {
    if (bgMediaObserver) bgMediaObserver.disconnect()
    if (!('IntersectionObserver' in window)) return
    bgMediaObserver = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const el = en.target
          if (el.tagName !== 'VIDEO') continue
          if (en.isIntersecting) {
            if (el.paused) el.play().catch(() => {})
          } else el.pause()
        }
      },
      { threshold: 0.05 }
    )
    document.querySelectorAll('.profile-bg-media').forEach((el) => bgMediaObserver.observe(el))
  }

  const pauseBgMedia = () => {
    document.querySelectorAll('.profile-bg-media').forEach((v) => {
      if (v.tagName === 'VIDEO') v.pause()
    })
  }
  const resumeBgMedia = () => {
    document.querySelectorAll('.profile-bg-media').forEach((v) => {
      if (v.tagName !== 'VIDEO' || !v.paused) return
      const r = v.getBoundingClientRect()
      if (r.width > 0 && r.top < window.innerHeight && r.bottom > 0) v.play().catch(() => {})
    })
  }

  const refresh = () =>
    nextTick(() => {
      bindReveals()
      bindBgMedia()
    })
  const teardown = () => {
    if (revealObserver) revealObserver.disconnect()
    if (bgMediaObserver) bgMediaObserver.disconnect()
    revealObserver = null
    bgMediaObserver = null
  }
  return { bindReveals, bindBgMedia, pauseBgMedia, resumeBgMedia, refresh, teardown }
}
