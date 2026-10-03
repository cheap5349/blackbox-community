<script setup>
// 应用外壳：预加载动画 / 全局装饰层 / 导航栏 / 全局弹层（搜索、举报）+ 页面路由出口。
// 页面级数据与逻辑全部收敛到 store.js，视图拆分在 src/views/，由 router 懒加载。
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from './store.js'
import { useTheme } from './composables/useTheme.js'
import { useScrollUi } from './composables/useScrollUi.js'
import { useProfileBg } from './composables/useProfileBg.js'
import { useReveal } from './composables/useReveal.js'
import { INTRO_DURATION, INTRO_STORAGE_KEY, shouldShowIntro } from './intro.js'

import ReadingBar from './components/ReadingBar.vue'
import CursorFX from './components/CursorFX.vue'
import ToastsStack from './components/ToastsStack.vue'
import BackTop from './components/BackTop.vue'
import ThemeTransition from './components/ThemeTransition.vue'
import PreloadScreen from './components/PreloadScreen.vue'
import BackgroundLayers from './components/BackgroundLayers.vue'
import HeaderBar from './components/HeaderBar.vue'
import NotificationsPanel from './components/NotificationsPanel.vue'
import BgmPlayer from './components/BgmPlayer.vue'
import AppIcon from './components/AppIcon.vue'
import DemoNotice from './components/DemoNotice.vue'
import { DEMO_MODE } from './demo.js'

const router = useRouter()
const route = useRoute()
const store = useStore()
const { applyTheme } = useTheme()
const { setupScroll, teardownScroll } = useScrollUi()
const { loadProfileBg } = useProfileBg()
const { refresh: refreshReveals, teardown: teardownReveals } = useReveal()

const loading = ref(shouldShowIntro())
const appReady = ref(!loading.value)
const introReady = ref(false)
// 白场遮罩：只在「本次真的要播开场动画」时才需要。
// 它的消失依赖 onBootDone，而跳过开场时 onBootDone 永远不会被调用——
// 如果这里恒为 true，那么在「已看过动画」的第二次访问里，遮罩会立刻渲染
// 且再无任何东西把它关掉，#f6f3ef 就把整个主界面永久盖住：打开即全屏空白。
const bootExit = ref(loading.value)
let introTimeout = null
let introFallbackTimer = null
let unreadTimer = null

function onGlobalKey(e) {
  // Ctrl/Cmd+K 打开全局搜索；Esc 关闭
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    store.openSearch()
  } else if (e.key === 'Escape' && store.showSearch) store.closeSearch()
}

// 开场动画白闪结束：放行主界面，白场遮罩淡出揭示主题 UI
function onBootDone() {
  localStorage.setItem(INTRO_STORAGE_KEY, '1')
  loading.value = false
  appReady.value = true
  store.refreshMe() // 校验登录态，过期提示不会被白闪遮住
  nextTick(() => {
    bootExit.value = false
    refreshReveals()
  })
}

function replayIntro() {
  if (loading.value) return
  bootExit.value = true
  introReady.value = true
  loading.value = true
}
onMounted(() => {
  applyTheme()
  const initialLoad = store.load()
  initialLoad.finally(() => {
    introReady.value = true
  })
  // 数据就绪兜底：后端慢或挂了也不能让开场动画无限等下去
  introTimeout = window.setTimeout(() => {
    introReady.value = true
  }, 4000)
  // 硬兜底：无论开场动画因为什么原因没能收尾（循环中断、组件报错、
  // 数据始终未就绪），超过「动画时长 + 4 秒」都无条件放行主界面。
  // 这是「绝不白屏」的最后一道保险，正常路径下不会触发。
  introFallbackTimer = window.setTimeout(
    () => {
      if (loading.value) onBootDone()
    },
    (INTRO_DURATION + 4) * 1000
  )
  loadProfileBg()
  setupScroll()
  window.addEventListener('keydown', onGlobalKey)
  // 未读通知角标：先取一次，再低频轮询。
  // 用轮询而不是长连接，是因为通知只是弱提示，60 秒延迟可以接受，
  // 而 SSE/WebSocket 会给这个单进程项目引入额外的连接管理成本。
  store.loadUnreadCount()
  unreadTimer = window.setInterval(() => {
    // 页面在后台时不轮询，避免无意义的请求
    if (!document.hidden) store.loadUnreadCount()
  }, 60000)
  // 路由切换后：回到顶部 + 重新绑定 .reveal / 背景媒体视口观察
  router.afterEach(() => {
    window.scrollTo({ top: 0, left: 0 })
    nextTick(refreshReveals)
  })
})
onBeforeUnmount(() => {
  window.clearTimeout(introTimeout)
  window.clearTimeout(introFallbackTimer)
  window.clearInterval(unreadTimer)
  teardownScroll()
  teardownReveals()
  window.removeEventListener('keydown', onGlobalKey)
})
</script>

<template>
  <ReadingBar />
  <CursorFX />
  <ToastsStack />
  <BackTop />
  <!-- 左下角背景音乐唱片机：挂在 .community-page 之外，避免页面容器残留的 transform
       让它退化为随文档滚动（那会变成"滑到底才看得见"） -->
  <BgmPlayer v-if="appReady" />
  <!-- 静态演示版角标：同样挂在容器之外，理由同上 -->
  <DemoNotice v-if="DEMO_MODE" />
  <ThemeTransition />

  <Transition name="boot-fade">
    <div v-if="!loading && bootExit" class="boot-fade-overlay" aria-hidden="true"></div>
  </Transition>
  <PreloadScreen v-if="loading" :ready="introReady" @done="onBootDone" />
  <div
    v-if="appReady"
    class="community-page page-enter"
    :class="{ 'post-focus': route.path.startsWith('/post') }"
    :aria-busy="loading"
  >
    <BackgroundLayers />
    <HeaderBar @replay-intro="replayIntro" />
    <NotificationsPanel />

    <main class="community-main">
      <p v-if="store.error" class="error">{{ store.error }}</p>
      <router-view />
    </main>

    <!-- 全局弹层：举报（详情页 / 搜索结果均可触发） -->
    <div v-if="store.reportTarget" class="admin-modal" @click.self="store.closeReport">
      <div class="admin-modal-box card">
        <h2>举报帖子</h2>
        <p class="admin-warn-text">「{{ store.reportTarget.title }}」有违社区规范？告诉我们原因，管理员会尽快处理。</p>
        <div class="report-reasons">
          <button
            v-for="r in store.reportReasons"
            :key="r"
            :class="{ active: store.reportReason === r }"
            @click="store.reportReason = r"
          >
            {{ r }}
          </button>
        </div>
        <label v-if="store.reportReason === '其他'"
          >补充说明<input v-model="store.reportCustom" maxlength="200" placeholder="具体描述问题…"
        /></label>
        <div class="admin-modal-actions">
          <button class="primary danger" :disabled="store.reportSending" @click="store.submitReport">
            {{ store.reportSending ? '提交中…' : '提交举报' }}
          </button>
          <button class="link" @click="store.closeReport">取消</button>
        </div>
      </div>
    </div>

    <!-- 全局弹层：搜索（Ctrl/Cmd + K） -->
    <div v-if="store.showSearch" class="search-overlay" @click.self="store.closeSearch">
      <div class="search-panel card">
        <div class="search-bar">
          <span class="search-icon"><AppIcon name="search" :size="16" /></span>
          <input
            v-model="store.searchQ"
            class="search-input"
            placeholder="搜索帖子标题、内容、作者或社区…"
            @input="store.runSearch"
            @keyup.enter="store.runSearch"
          />
          <button class="search-close" aria-label="关闭搜索" @click="store.closeSearch">
            <AppIcon name="close" :size="14" />
          </button>
        </div>
        <p class="search-hint">按 Ctrl+K（macOS 为 Cmd+K）打开 · Esc 关闭 · 支持标题 / 内容 / 作者 / 社区关键词</p>
        <div v-if="store.searchLoading" class="search-status">正在搜索…</div>
        <div v-else-if="store.searchQ.trim() && !store.searchResults.length" class="search-status">
          没有找到相关帖子
        </div>
        <div v-else-if="store.searchResults.length" class="search-results">
          <div v-for="r in store.searchResults" :key="r.id" class="search-item" @click="store.pickSearch(r)">
            <div v-if="r.media && r.media.length && r.media[0].type === 'image'" class="search-item-cover">
              <img :src="r.media[0].url" alt="" loading="lazy" decoding="async" />
            </div>
            <div class="search-item-body">
              <b>{{ r.title }}</b>
              <small>{{ r.author }} · {{ r.community }} · {{ store.relativeDate(r.created_at) }}</small>
            </div>
            <span class="search-go">→</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
