<script setup>
import { useStore } from '../store.js'
import AppIcon from '../components/AppIcon.vue'
const store = useStore()
</script>

<template>
  <section class="communities-page view-enter">
    <div class="communities-toolbar">
      <div>
        <p class="eyebrow blue">COMMUNITIES</p>
        <h1>全部社区</h1>
      </div>
      <button class="primary" @click="store.startCreateCommunity"><AppIcon name="plus" :size="15" /> 创建社区</button>
    </div>
    <div class="communities-grid">
      <article
        v-for="c in store.communities"
        :key="c.id"
        class="community-card reveal"
        :style="{ '--delay': `${(c.id % 5) * 70}ms` }"
        @click="store.openCommunity(c)"
      >
        <span><AppIcon name="users" :size="20" /></span>
        <h2>{{ c.name }}</h2>
        <p>{{ c.description }}</p>
        <small>{{ c.postCount }} 篇帖子 · 创建者 {{ c.owner_name || '系统' }}</small
        ><button class="community-open">进入社区 →</button>
      </article>
    </div>
  </section>
</template>
