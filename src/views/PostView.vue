<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from '../store.js'
import { api } from '../api.js'
import { mediaOf } from '../utils.js'
import AppIcon from '../components/AppIcon.vue'

const store = useStore()
const route = useRoute()

onMounted(async () => {
  // 深链直达 /post/:id（刷新 / 分享链接）：selectedPost 缺失或对不上时补拉详情
  if (String(store.selectedPost?.id) === route.params.id) return
  try {
    const detail = await api(`/posts/${route.params.id}`)
    store.selectedPost = { ...detail, media: mediaOf(detail) }
    store.comments = []
    store.commentTotal = 0
    store.commentDraft = ''
    await store.loadComments()
  } catch (e) {
    store.error = e.message
  }
})
</script>

<template>
  <section class="post-detail-wrap view-enter">
    <button class="back-button" @click="store.goBackFromPost">← 返回</button>
    <article class="card post-detail">
      <div class="post-head">
        <div v-if="store.selectedPost" class="post-avatar">
          <img v-if="store.selectedPost.author_avatar" :src="store.selectedPost.author_avatar" alt="" /><template
            v-else
            >{{ store.initials(store.selectedPost.author) }}</template
          >
        </div>
        <div v-if="store.selectedPost">
          <b>{{ store.selectedPost.author || '匿名用户' }}</b>
          <p>· {{ store.relativeDate(store.selectedPost.created_at) }}</p>
        </div>
        <span
          v-if="store.selectedPost"
          class="post-badge"
          @click="store.openCommunity({ id: store.selectedPost.community_id, name: store.selectedPost.community })"
          >{{ store.selectedPost.community || '讨论' }}</span
        >
      </div>
      <h1 class="detail-title">{{ store.selectedPost?.title }}</h1>
      <p class="detail-content">{{ store.selectedPost?.content }}</p>
      <div
        v-if="store.selectedPost && store.selectedPost.media && store.selectedPost.media.length"
        class="detail-media"
      >
        <a v-for="m in store.selectedPost.media" :key="m.url" :href="m.url" download target="_blank"
          ><img v-if="m.type === 'image'" :src="m.url" alt="" loading="lazy" decoding="async" /><video
            v-else
            controls
            preload="metadata"
            :src="m.url"
        /></a>
      </div>
      <footer class="post-meta detail-meta">
        <button
          class="like"
          :class="{ liked: store.selectedPost && store.selectedPost.liked }"
          @click="store.selectedPost && store.toggleLike(store.selectedPost)"
        >
          <span class="heart">{{ store.selectedPost && store.selectedPost.liked ? '♥' : '♡' }}</span>
          {{ store.selectedPost ? store.likeCount(store.selectedPost) : 0 }}</button
        ><span><AppIcon name="comment" :size="14" /> {{ store.selectedPost?.comment_count || 0 }} 条评论</span
        ><span>发布于 {{ store.relativeDate(store.selectedPost?.created_at) }}</span
        ><span v-if="store.selectedPost" class="topic"># {{ store.selectedPost.community }}</span
        ><span class="detail-actions-right"
          ><button
            v-if="store.selectedPost && store.user && (store.selectedPost.user_id === store.user.id || store.isAdmin)"
            class="detail-action"
            @click="store.startEditPost(store.selectedPost)"
          >
            <AppIcon name="edit" :size="14" /> 编辑</button
          ><button
            v-if="store.selectedPost && store.user && store.selectedPost.user_id !== store.user.id"
            class="detail-action report"
            :class="{ reported: store.selectedPost.reported }"
            @click="store.openReport(store.selectedPost)"
          >
            <AppIcon name="shield" :size="14" />
            {{ store.selectedPost.reported ? '已举报' : '举报' }}
          </button></span
        >
      </footer>
    </article>
    <section class="detail-comments">
      <div class="detail-comments-head">
        <h3>
          评论 <small class="feed-count">{{ store.commentTotal }}</small>
        </h3>
        <span class="detail-comments-hint">友善交流，礼貌发言</span>
      </div>
      <div v-if="store.commentLoading" class="search-status">评论加载中…</div>
      <div v-else-if="store.comments.length" class="comment-list">
        <div
          v-for="(c, ci) in store.comments"
          :key="c.id"
          class="comment-item"
          :class="{ 'is-mine': store.user && c.user_id === store.user.id }"
        >
          <div class="post-avatar" :class="`tone-${ci % 4}`">
            <img v-if="c.author_avatar" :src="c.author_avatar" alt="" /><template v-else>{{
              store.initials(c.author)
            }}</template>
          </div>
          <div class="comment-body">
            <div class="comment-head">
              <b>{{ c.author }}</b>
              <p>· {{ store.relativeDate(c.created_at) }}</p>
              <button
                v-if="store.user && (c.user_id === store.user.id || store.isAdmin)"
                class="comment-del"
                title="删除评论"
                @click="store.removeComment(c)"
              >
                <AppIcon name="close" :size="13" />
              </button>
            </div>
            <p class="comment-text">{{ c.content }}</p>
          </div>
        </div>
      </div>
      <div v-else class="comment-empty">还没有评论，来抢沙发吧。</div>
      <div class="comment-editor">
        <textarea
          v-model="store.commentDraft"
          maxlength="500"
          :placeholder="store.user ? '写下你的评论…（最多 500 字）' : '登录后即可评论'"
          @keydown.ctrl.enter="store.submitComment"
        ></textarea>
        <button
          class="primary"
          :disabled="store.commentSending || !store.commentDraft.trim()"
          @click="store.submitComment"
        >
          {{ store.commentSending ? '发布中…' : '发表评论' }}
        </button>
      </div>
    </section>
  </section>
</template>
