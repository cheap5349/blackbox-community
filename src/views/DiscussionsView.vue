<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from '../store.js'
import AppIcon from '../components/AppIcon.vue'

const store = useStore()
const router = useRouter()

onMounted(() => {
  store.loadTreeholeFeed(true)
})
</script>

<template>
  <section class="discussions-page treehole-page view-enter">
    <div class="discussions-head">
      <button class="back-button" @click="router.push('/')">← 返回发现</button>
      <p class="eyebrow blue">BLACKBOX DISCUSSIONS</p>
      <h1>讨论区</h1>
      <p>把说不出口的话留在这里，匿名倾诉，会有人温柔接住。</p>
    </div>
    <div class="discussions-toolbar treehole-toolbar">
      <button class="primary" @click="store.writeToTreehole"><AppIcon name="plus" :size="15" /> 匿名倾诉</button>
      <div class="tags">
        <button :class="{ active: !store.treeholeTag }" @click="store.treeholeTag = ''">全部</button>
        <button
          v-for="tag in store.treeholeTags"
          :key="tag"
          :class="{ active: store.treeholeTag === tag }"
          @click="store.treeholeTag = tag"
        >
          # {{ tag }}
        </button>
      </div>
    </div>
    <p class="treehole-note">🔒 讨论区所有内容匿名展示，你的昵称与头像不会出现在这里。</p>
    <article
      v-for="(p, index) in store.filteredPosts"
      :key="p.id"
      class="post-card treehole-card reveal"
      :style="{ '--delay': `${index * 45}ms` }"
      @click="store.openPost(p)"
    >
      <div class="post-head">
        <div class="post-avatar mask" :class="`tone-${index % 4}`"><span>🕳</span></div>
        <div>
          <b class="treehole-author">{{ p.author || '匿名树友' }}</b>
          <p>· {{ store.relativeDate(p.created_at) }} · 匿名来信</p>
        </div>
        <span class="post-badge treehole-badge">讨论</span>
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
        ><span class="read-more">阅读全文 →</span><span class="topic"># {{ store.treeholeTag || '讨论' }}</span>
      </footer>
    </article>
    <button
      v-if="store.hasMoreTreehole"
      class="load-more"
      :disabled="store.treeholeLoading"
      @click="store.loadTreeholeFeed(false)"
    >
      <AppIcon name="arrowUp" :size="14" class="flip-down" />
      {{ store.treeholeLoading ? '加载中…' : '加载更多帖子' }}
    </button>
    <div v-if="!store.filteredPosts.length" class="empty-card">
      <span><AppIcon name="spark" :size="22" /></span>
      <h3>{{ store.treeholeTag ? `还没有「${store.treeholeTag}」相关的讨论` : '这里还很安静' }}</h3>
      <p>把此刻的心事留在这里，会有人轻轻接住它。</p>
      <button class="primary" @click="store.writeToTreehole">写下第一条</button>
    </div>
  </section>
</template>
