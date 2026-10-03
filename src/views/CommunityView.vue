<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from '../store.js'
import AppIcon from '../components/AppIcon.vue'

const store = useStore()
const route = useRoute()
const router = useRouter()

onMounted(() => {
  // 深链直达 /community/:id（刷新 / 分享链接）：selectedCommunity 缺失或对不上时补拉
  if (String(store.selectedCommunity?.id) === route.params.id) return
  store.openCommunity({ id: route.params.id })
})
</script>

<template>
  <section class="community-detail-page view-enter">
    <button class="back-button" @click="router.push('/communities')">← 返回社区列表</button>
    <header class="community-hero">
      <div class="community-hero-mark"><AppIcon name="users" :size="30" /></div>
      <div class="community-hero-info">
        <h1>{{ store.selectedCommunity?.name }}</h1>
        <p>{{ store.selectedCommunity?.description || '这个社区还没有简介。' }}</p>
        <small
          >创建者 · {{ store.selectedCommunity?.owner_name || '系统' }}&#12288;&#12288;{{
            store.selectedCommunity?.postCount || 0
          }}
          篇帖子</small
        >
      </div>
      <button class="primary" @click="store.writeToCommunity(store.selectedCommunity)">
        <AppIcon name="plus" :size="15" /> 发布到该社区
      </button>
    </header>
    <div class="feed-title"><h2>该社区的讨论</h2></div>
    <article
      v-for="(p, index) in store.communityPosts"
      :key="p.id"
      class="post-card reveal"
      :style="{ '--delay': `${index * 45}ms` }"
      @click="store.openPost(p)"
    >
      <div class="post-head">
        <div class="post-avatar" :class="`tone-${index % 4}`">
          <img v-if="p.author_avatar" :src="p.author_avatar" alt="" /><template v-else>{{
            store.initials(p.author)
          }}</template>
        </div>
        <div>
          <b>{{ p.author || '匿名用户' }}</b>
          <p>· {{ store.relativeDate(p.created_at) }}</p>
        </div>
        <span class="post-badge">{{ store.selectedCommunity?.name }}</span>
      </div>
      <p class="post-content">
        <strong>{{ p.title }}</strong
        ><br />{{ p.content }}
      </p>
      <div v-if="p.media && p.media.length" class="post-cover">
        <img v-if="p.media[0].type === 'image'" :src="p.media[0].url" alt="" loading="lazy" decoding="async" />
        <span v-else class="cover-video"
          ><video muted preload="metadata" :src="p.media[0].url"></video><span class="cover-play">▶</span></span
        >
      </div>
      <footer class="post-meta">
        <button class="like" :class="{ liked: p.liked }" @click.stop="store.toggleLike(p)">
          <span class="heart">{{ p.liked ? '♥' : '♡' }}</span> {{ store.likeCount(p) }}</button
        ><span><AppIcon name="comment" :size="14" /> {{ p.comment_count || 0 }}</span
        ><span class="read-more">阅读全文 →</span>
      </footer>
    </article>
    <button
      v-if="store.hasMoreCommunity"
      class="load-more"
      :disabled="store.communityFeedLoading"
      @click="store.loadCommunityFeed(false)"
    >
      <AppIcon name="arrowUp" :size="14" class="flip-down" />
      {{ store.communityFeedLoading ? '加载中…' : '加载更多帖子' }}
    </button>
    <div v-if="!store.communityPosts.length" class="empty-card">
      <span><AppIcon name="spark" :size="22" /></span>
      <h3>这个社区还没有讨论</h3>
      <p>来发起第一条，成为这里的拓荒者。</p>
      <button class="primary" @click="store.writeToCommunity(store.selectedCommunity)">发布第一条</button>
    </div>
  </section>
</template>
