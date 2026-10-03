<script setup>
// 站内通知浮层：未读角标、列表、标记已读、按类型跳转。
// 数据与动作都在 store（loadNotifications / markNotificationsRead / openNotification），
// 这里只负责呈现，保持组件薄。
import { useStore } from '../store.js'
import AppIcon from './AppIcon.vue'

const store = useStore()

const typeLabel = { like: '点赞', comment: '评论', reply: '回复', report_handled: '举报', system: '系统' }
// 图标名而非字符：字符在不同字体下会缺字形（显示成方框）
const typeIcon = { like: 'heart', comment: 'comment', reply: 'arrowUp', report_handled: 'shield', system: 'info' }
</script>

<template>
  <div v-if="store.showNotifications" class="notif-overlay" @click.self="store.closeNotifications">
    <section class="notif-panel card" role="dialog" aria-label="站内通知">
      <header class="notif-head">
        <h2>
          通知 <span v-if="store.notificationUnread" class="notif-badge">{{ store.notificationUnread }}</span>
        </h2>
        <div class="notif-head-actions">
          <button class="link" :disabled="!store.notificationUnread" @click="store.markNotificationsRead()">
            全部已读
          </button>
          <button class="search-close" aria-label="关闭通知" @click="store.closeNotifications">
            <AppIcon name="close" :size="15" />
          </button>
        </div>
      </header>

      <p v-if="store.notificationLoading && !store.notifications.length" class="notif-status">正在加载…</p>
      <p v-else-if="!store.notifications.length" class="notif-status">
        还没有通知。别人点赞或评论你的帖子时会出现在这里。
      </p>

      <ul v-else class="notif-list">
        <li
          v-for="n in store.notifications"
          :key="n.id"
          class="notif-item"
          :class="{ unread: !n.is_read, gone: n.post_deleted }"
          @click="store.openNotification(n)"
        >
          <span class="notif-icon" :data-type="n.type" aria-hidden="true">
            <AppIcon :name="typeIcon[n.type] || 'info'" :size="15" />
          </span>
          <div class="notif-body">
            <p class="notif-text">
              <b>{{ n.actor_name }}</b>
              <span class="notif-type">{{ typeLabel[n.type] || '通知' }}</span>
              <span v-if="n.post_deleted" class="notif-gone">内容已删除</span>
            </p>
            <p class="notif-sub">{{ n.body || n.post_title || '' }}</p>
          </div>
          <time class="notif-time">{{ store.relativeDate(n.created_at) }}</time>
        </li>
      </ul>

      <button
        v-if="store.notifications.length < store.notificationTotal"
        class="link notif-more"
        :disabled="store.notificationLoading"
        @click="store.loadNotifications()"
      >
        {{ store.notificationLoading ? '加载中…' : '加载更多' }}
      </button>
    </section>
  </div>
</template>
