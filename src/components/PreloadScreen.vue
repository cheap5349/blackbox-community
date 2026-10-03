<script setup>
// 开场动画渲染层。
//
// 时间轴逻辑在 intro.js（纯函数，可单测）；这里只负责把每帧状态**直写 DOM**。
// 刻意不走 Vue 响应式：25fps 的逐帧更新如果进响应式系统，每个属性都会触发
// 依赖收集 + 调度，开销远大于直接改 style，而且会和大面积 CSS 过渡打架。
// 所以除了 stage（用于切换 aria / data 属性）之外，所有视觉量都手写 style。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { FRAME_MS, INTRO_DURATION, introMotion } from '../intro.js'

const props = defineProps({ ready: { type: Boolean, default: false } })
const emit = defineEmits(['done', 'skip'])

const stage = ref('signal')
const root = ref(null)
const signal = ref(null)
const grid = ref(null)
const mark = ref(null)
const markCircle = ref(null)
const markHex = ref(null)
const markText = ref(null)
const auth = ref(null)
const authLines = ref(null)
const authGlitch = ref(null)
const scan = ref(null)
const scanOuter = ref(null)
const scanInner = ref(null)
const scanDot = ref(null)
const scanCore = ref(null)
const permission = ref(null)
const welcome = ref(null)
const welcomeTitle = ref(null)
const welcomeCommunity = ref(null)
const highlight = ref(null)
const flash = ref(null)

let raf = null
// 等数据就绪期间的低频重试定时器（见 frame() 里的终态分支）
let waitTimer = null
// 时间基准。浏览器里直接用 rAF 回调时间戳（合成时钟，最稳）；
// 但如果测试的假定时器只接管道具时钟而不接管 rAF 时间戳，那一列时间戳
// 会与 performance.now() 完全脱钩，动画就会按真实时间走。所以首帧先做一次
// 一致性判定：两个时钟对不上（差值超过一帧）就退回性能时钟。
let startedAt = null
let mountStamp = 0
let trustCallbackClock = true
let finished = false
let lastFrame = -1

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const px = (value) => `${value}px`

const dash = (el, progress) => {
  if (!el) return
  const p = Math.min(1, Math.max(0, progress || 0))
  // pathLength="1"，所以 dasharray 直接用归一化分数，不必测量真实路径长度
  el.style.strokeDasharray = `${p} ${1 - p}`
  el.style.strokeDashoffset = '0'
}

function render(state) {
  // data-stage 也直接写 DOM。它是唯一的响应式绑定，而渲染发生在 rAF 回调里，
  // Vue 的 patch 要等微任务才刷；那一拍会让 data-stage 比画面晚一帧，
  // 幕边界的断言与 CSS 选择器都会错位。其余视觉量本来就手写 style，同源更一致。
  if (stage.value !== state.stage) {
    stage.value = state.stage
    if (root.value) root.value.dataset.stage = state.stage
  }

  if (signal.value) {
    signal.value.textContent = state.signalText
    signal.value.style.opacity = String(state.signalOpacity)
  }
  if (grid.value) grid.value.style.opacity = String(state.gridOpacity)

  // ── 第二幕 ──
  const { logo } = state
  if (mark.value) {
    mark.value.style.opacity = String(logo.opacity)
    mark.value.style.transform = `translate(-50%, -50%) rotate(${logo.rotate}deg) scale(${logo.scale})`
  }
  dash(markCircle.value, logo.ringProgress)
  if (markCircle.value) markCircle.value.style.opacity = String(logo.ringOpacity)
  dash(markHex.value, logo.hexProgress)
  if (markHex.value) markHex.value.style.opacity = String(logo.markOpacity)
  if (markText.value) {
    markText.value.textContent = logo.letters
    markText.value.style.opacity = String(logo.lettersOpacity)
  }

  // ── 第三幕 ──
  if (auth.value) {
    auth.value.style.opacity = String(state.auth.opacity)
    auth.value.classList.toggle('is-glitch', state.auth.glitch)
  }
  if (authLines.value) {
    const nodes = authLines.value.children
    for (let i = 0; i < nodes.length; i += 1) {
      const text = state.auth.lines[i] || ''
      if (nodes[i].textContent !== text) nodes[i].textContent = text
      nodes[i].style.opacity = text ? '1' : '0'
    }
  }
  if (authGlitch.value) {
    // 只在毛刺帧出现，非毛刺帧清空，绝不进入 CSS 动画循环
    if (authGlitch.value.textContent !== state.auth.glitchText) {
      authGlitch.value.textContent = state.auth.glitchText
    }
  }

  // ── 第四幕 ──
  if (scan.value) {
    scan.value.style.opacity = String(state.scan.opacity)
    scan.value.style.filter = state.scan.blur ? `blur(${state.scan.blur}px)` : 'none'
    scan.value.style.transform = `scale(${state.scan.scale})`
  }
  if (scanOuter.value) {
    scanOuter.value.setAttribute('r', String(state.scan.outerRadius))
    scanOuter.value.style.transform = `rotate(${state.scan.outerStart}deg)`
    // pathLength=360，所以 dasharray 直接就是“画多少度 + 空多少度”
    scanOuter.value.style.strokeDasharray = `${state.scan.outerSweep} 360`
  }
  if (scanInner.value) {
    scanInner.value.setAttribute('r', String(state.scan.innerRadius))
    scanInner.value.style.transform = `rotate(${state.scan.innerOrbit}deg)`
  }
  if (scanCore.value) {
    scanCore.value.setAttribute('r', String(Math.max(1, state.scan.ringRadius / 34)))
  }
  if (scanDot.value) {
    const orbit = state.scan.orbitRadius
    scanDot.value.setAttribute('r', String(state.scan.dotRadius))
    scanDot.value.style.opacity = state.scan.dotRadius > 0.6 ? '1' : '0'
    scanDot.value.style.transform = `rotate(${state.scan.innerOrbit}deg) translateY(${px(-orbit)})`
  }
  if (permission.value) {
    permission.value.textContent = state.permissionText
    permission.value.style.opacity = String(state.permissionOpacity)
    // 字距收拢：不缩放，靠 letter-spacing 把一行字收紧
    permission.value.style.letterSpacing = `${state.tracking}px`
  }

  // ── 第五幕 ──
  const { welcome: w, exit } = state
  if (welcome.value) {
    welcome.value.style.opacity = String(w.panelFlash)
    welcome.value.style.transform = `scale(${exit.scale})`
    welcome.value.style.filter = exit.blur ? `blur(${px(exit.blur)})` : 'none'
  }
  if (welcomeTitle.value) {
    welcomeTitle.value.style.opacity = String(w.brandOpacity)
    welcomeTitle.value.style.transform = `translateX(${px(-w.x)})`
  }
  if (welcomeCommunity.value) {
    welcomeCommunity.value.style.opacity = String(w.communityOpacity)
  }
  if (highlight.value) {
    // 高亮扫过用遮罩宽度推进：0 → 410% 表示一条高光带从左掠到右
    highlight.value.style.width = `${w.highlight}%`
  }
  if (flash.value) flash.value.style.opacity = String(exit.white)
  if (root.value) root.value.style.setProperty('--intro-content', String(exit.contentOpacity))
}

function finish(skipped = false) {
  if (finished) return
  finished = true
  if (raf) cancelAnimationFrame(raf)
  raf = null
  if (waitTimer) window.clearTimeout(waitTimer)
  waitTimer = null
  if (skipped) emit('skip')
  emit('done')
}

function frame(now) {
  const stamp = Number.isFinite(now) ? now : performance.now()
  if (startedAt === null) {
    // 首帧做时钟一致性判定，之后不再改变
    trustCallbackClock = Math.abs(stamp - mountStamp) <= FRAME_MS * 8
    const base = trustCallbackClock ? stamp : performance.now()
    // rAF 的第一次回调本身就消耗了一个帧间隔，补回去以免边界帧整体偏移一格
    startedAt = base - FRAME_MS
  }
  if (reducedMotion) {
    render(introMotion(INTRO_DURATION))
    finish()
    return
  }
  const clock = trustCallbackClock ? stamp : performance.now()
  const elapsed = Math.max(0, (clock - startedAt) / 1000)
  const state = introMotion(elapsed)
  // 同一帧内多次 rAF（高刷屏）不重复写 DOM
  if (state.f !== lastFrame) {
    lastFrame = state.f
    render(state)
  }
  // 动画走完但数据还没就绪：停在白闪终态等待。
  // 这里**不能**直接 return 而不调度下一帧——那样循环就永久停止了，
  // 之后 ready 变成 true 时已经没有任何东西会再来收尾，用户会永久停在
  // 开场屏上。用低频重试代替逐帧空转，代价可忽略。
  if (elapsed >= INTRO_DURATION) {
    if (props.ready) return finish()
    render(introMotion(INTRO_DURATION))
    waitTimer = window.setTimeout(() => {
      waitTimer = null
      raf = requestAnimationFrame(frame)
    }, 120)
    return
  }
  raf = requestAnimationFrame(frame)
}

function skip() {
  finish(true)
}

function onKeydown(event) {
  if (event.key === 'Escape' || event.key === 'Enter') skip()
}

onMounted(() => {
  // 每次都重置模块级的循环状态：组件可能被卸载后重新挂载
  // （重播开场，或测试里逐条 mount），沿用上一次的基准会让新实例
  // 从一个莫名其妙的时间点算起，动画直接卡在第一帧。
  startedAt = null
  lastFrame = -1
  finished = false
  if (waitTimer) window.clearTimeout(waitTimer)
  waitTimer = null
  // 挂载瞬间的性能时钟，用于首帧判定哪个时钟是可信的
  mountStamp = performance.now()
  trustCallbackClock = true
  window.addEventListener('keydown', onKeydown)
  render(introMotion(0))
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  raf = null
  if (waitTimer) window.clearTimeout(waitTimer)
  waitTimer = null
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <section ref="root" class="preload-screen intro-screen" aria-label="正在进入黑盒社区" :data-stage="stage">
    <div ref="grid" class="intro-grid" aria-hidden="true"></div>

    <!-- 第一幕：白场逐字输入 -->
    <p ref="signal" class="intro-signal" aria-live="polite"></p>

    <!-- 第二幕：圆环描边 + 六边形盒标 + 字母 -->
    <div ref="mark" class="intro-mark" aria-hidden="true">
      <svg viewBox="0 0 240 240">
        <circle ref="markCircle" class="intro-mark-circle" cx="120" cy="120" r="88" pathLength="1" />
        <path
          ref="markHex"
          class="intro-mark-hex"
          pathLength="1"
          d="M120 42 L187 78 L187 162 L120 198 L53 162 L53 78 Z"
        />
        <path class="intro-mark-glyph" d="M120 88 L152 106 L152 142 L120 160 L88 142 L88 106 Z" />
        <path class="intro-mark-axis" d="M120 62v26M120 152v26M76 120h-24M188 120h-24" />
        <text ref="markText" class="intro-mark-text" x="120" y="224" text-anchor="middle"></text>
      </svg>
    </div>

    <!-- 第三幕：认证终端 -->
    <div ref="auth" class="intro-auth" aria-hidden="true">
      <div class="intro-auth-bar"><i></i><b>SECURE CHANNEL</b></div>
      <p ref="authLines" class="intro-auth-lines"><span></span><span></span><span></span></p>
      <p ref="authGlitch" class="intro-auth-glitch"></p>
    </div>

    <!-- 第四幕：扫描环 + 权限文字 -->
    <!-- viewBox 用 1920×1080 引擎坐标：环半径要到 2000px 开外，
         在小 viewBox 里只能用缩放近似，直接驱动 r 才是准确的长尾收拢。 -->
    <div ref="scan" class="intro-scan-wrap" aria-hidden="true">
      <svg class="intro-scan" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <g class="intro-scan-group">
          <circle ref="scanOuter" class="intro-scan-arc" cx="960" cy="540" r="275" pathLength="360" />
          <circle ref="scanInner" class="intro-scan-inner" cx="960" cy="540" r="124" transform-origin="960 540" />
          <circle ref="scanDot" class="intro-scan-dot" cx="960" cy="540" r="0" transform-origin="960 540" />
          <circle ref="scanCore" class="intro-scan-core" cx="960" cy="540" r="8" />
        </g>
      </svg>
    </div>
    <p ref="permission" class="intro-permission" aria-live="polite"></p>

    <!-- 第五幕：欢迎 -->
    <div ref="welcome" class="intro-welcome">
      <h1 ref="welcomeTitle" class="intro-welcome-title">
        <span class="intro-welcome-clip">
          WELCOME TO HEIBOX
          <span ref="highlight" class="intro-welcome-highlight" aria-hidden="true"></span>
        </span>
      </h1>
      <p ref="welcomeCommunity" class="intro-welcome-community">
        <b>HEIBOX</b>
        <span>黑盒社区 · 连接已建立</span>
      </p>
    </div>

    <div class="intro-footer" aria-hidden="true"><span>HEIBOX / ARCHIVE</span><span>v2.0</span></div>
    <button class="intro-skip" type="button" aria-label="跳过开场动画" @click="skip">
      跳过 <span aria-hidden="true">→</span>
    </button>
    <div ref="flash" class="intro-flash" aria-hidden="true"></div>
  </section>
</template>
