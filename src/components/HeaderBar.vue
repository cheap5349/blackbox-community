<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useStore } from '../store.js'
import { useTheme } from '../composables/useTheme.js'
import { useScrollUi } from '../composables/useScrollUi.js'
import AppIcon from './AppIcon.vue'
import PerfBadge from './PerfBadge.vue'

const store = useStore()
const route = useRoute()
const router = useRouter()
const { theme, toggleTheme } = useTheme()
const { headerScrolled, headerHidden } = useScrollUi()
const emit = defineEmits(['replay-intro'])

// 每项自带图标与跳转动作，避免模板里堆三份几乎一样的按钮
const navItems = [
  {
    key: 'discover',
    label: '发现',
    icon: 'compass',
    active: () => route.path === '/',
    go: () => router.push('/'),
  },
  {
    key: 'communities',
    label: '社区',
    icon: 'users',
    active: () => route.path === '/communities',
    go: () => router.push('/communities'),
  },
  {
    key: 'discussions',
    label: '讨论',
    icon: 'chat',
    active: () => route.path === '/discussions',
    go: () => store.openDiscussions(),
  },
]
</script>

<template>
  <header class="community-header" :class="{ scrolled: headerScrolled, hidden: headerHidden }">
    <button class="brand" @click="router.push('/')">
      <span class="brand-mark"><AppIcon name="spark" :size="15" /></span> 黑盒 <small>社区</small>
    </button>
    <nav class="nav-links" aria-label="主导航">
      <button v-for="item in navItems" :key="item.key" :class="{ active: item.active() }" @click="item.go()">
        <AppIcon :name="item.icon" :size="16" />
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </nav>
    <div class="header-actions">
      <button
        class="intro-replay"
        type="button"
        title="重播开场动画"
        aria-label="重播开场动画"
        @click="emit('replay-intro')"
      >
        <AppIcon name="refresh" :size="17" />
      </button>
      <button
        class="theme-toggle"
        :class="{ dark: theme === 'dark' }"
        title="切换亮色 / 暗色主题"
        aria-label="切换主题"
        @click="toggleTheme"
      >
        <svg class="theme-icon sun" viewBox="0 0 24 24" width="17" height="17">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <g stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
            <line x1="12" y1="2.5" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="21.5" />
            <line x1="2.5" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="21.5" y2="12" />
            <line x1="5" y1="5" x2="6.8" y2="6.8" />
            <line x1="17.2" y1="17.2" x2="19" y2="19" />
            <line x1="19" y1="5" x2="17.2" y2="6.8" />
            <line x1="6.8" y1="17.2" x2="5" y2="19" />
          </g>
        </svg>
        <svg class="theme-icon moon" viewBox="0 0 24 24" width="17" height="17">
          <path
            d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a.8.8 0 0 0-1.1-1A10 10 0 1 0 21.5 15.3a.8.8 0 0 0-1-1.1z"
            fill="currentColor"
          />
        </svg>
      </button>
      <button class="search-trigger" title="搜索帖子（Ctrl+K）" aria-label="搜索帖子" @click="store.openSearch">
        <AppIcon name="search" :size="17" />
      </button>
      <button
        v-if="store.user"
        class="notif-trigger"
        :title="store.notificationUnread ? `${store.notificationUnread} 条未读通知` : '站内通知'"
        :aria-label="store.notificationUnread ? `${store.notificationUnread} 条未读通知` : '站内通知'"
        @click="store.openNotifications"
      >
        <AppIcon name="bell" :size="17" />
        <i v-if="store.notificationUnread" class="notif-dot" aria-hidden="true">{{
          store.notificationUnread > 99 ? '99+' : store.notificationUnread
        }}</i>
      </button>
      <button v-if="store.user" class="outline-button" @click="store.startWrite">
        <AppIcon name="plus" :size="15" /><span>发起</span>
      </button>
      <button v-else class="outline-button" @click="router.push('/login')">登录 / 注册</button>
      <button v-if="store.user" class="user-chip" title="打开个人中心" @click="store.openProfile">
        <img v-if="store.user.avatar" :src="store.user.avatar" alt="" /><template v-else>{{
          store.initials(store.user.name)
        }}</template
        ><span>{{ store.user.name }}</span>
      </button>
      <PerfBadge />
    </div>
  </header>
</template>
