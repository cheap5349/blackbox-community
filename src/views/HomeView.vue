<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from '../store.js'
import { useGeoWeather } from '../composables/useGeoWeather.js'
import { usePoem } from '../composables/usePoem.js'
import { useProfileBg } from '../composables/useProfileBg.js'
import { greet } from '../utils.js'
import AppIcon from '../components/AppIcon.vue'

const store = useStore()
const router = useRouter()
const { geo, weather, geoLoading, loadGeoWeather, ensureGeoWeather, resetGeoWeatherCache } = useGeoWeather()
const { poemText, poemAuthor, startPoemLoop, stopPoemLoop } = usePoem()
const { profileBg, profileBgIsVideo, profileBgVisible } = useProfileBg()

const sorts = [
  { key: 'latest', label: '最新', title: '最新动态' },
  { key: 'hot', label: '热门', title: '热门动态' },
  { key: 'featured', label: '精华', title: '精华动态' },
]
// 标题跟着排序走，让用户明确知道当前看的是哪个视图
const feedTitle = computed(() => (sorts.find((s) => s.key === store.feedSort) || sorts[0]).title)

// 进站即自动取天气；手动"重新获取"时先扔掉缓存
function retryGeo() {
  resetGeoWeatherCache()
  void loadGeoWeather()
}

// 进入主页播放诗句打字机并自动加载天气，离开停止
onMounted(() => {
  startPoemLoop()
  void ensureGeoWeather()
})
onBeforeUnmount(stopPoemLoop)
</script>

<template>
  <section class="view-enter">
    <header class="home-poem">
      <p class="home-poem-eyebrow"><AppIcon name="spark" :size="13" /> 黑盒社区 / HEIBOX COMMUNITY</p>
      <p class="home-poem-text">{{ poemText }}<span class="home-poem-cursor"></span></p>
      <p class="home-poem-author">—— {{ poemAuthor }}</p>
    </header>

    <div class="geo-card" :class="{ 'has-data': geo }">
      <div class="geo-greet">
        <span class="geo-wave">👋</span>
        <div>
          <b>{{ greet() }}，{{ store.user?.name || '访客' }}</b>
          <p v-if="geo">{{ geo.city }}{{ geo.country ? '，' + geo.country : '' }} · 本地天气</p>
          <p v-else-if="geoLoading">正在解析你的位置…</p>
          <p v-else>进入页面即按 IP 解析城市级天气，不展示或保存 IP 地址</p>
        </div>
      </div>
      <div v-if="weather" class="geo-weather">
        <span class="geo-emoji">{{ weather.emoji }}</span>
        <div class="geo-weather-info">
          <b
            >{{ weather.temp }}°C <small>{{ weather.text }}</small></b
          >
          <span>💧 湿度 {{ weather.humidity }}%</span>
        </div>
      </div>
      <div v-else-if="geoLoading" class="geo-weather geo-weather-loading">🌡️ 正在获取天气…</div>
      <button v-else class="geo-request" type="button" aria-label="重新获取本地天气" @click="retryGeo">
        重新获取天气
      </button>
    </div>

    <div class="content-grid">
      <section class="feed-section">
        <div class="feed-title">
          <h2>
            <AppIcon name="activity" :size="16" /> {{ feedTitle }}
            <small class="feed-count">{{ store.postTotal }} 篇</small>
          </h2>
          <button @click="router.push('/communities')">查看全部 →</button>
        </div>
        <!-- 排序切换：latest 最新 / hot 热门 / featured 精华 -->
        <div class="feed-sorts" role="tablist" aria-label="帖子排序">
          <button
            v-for="s in sorts"
            :key="s.key"
            role="tab"
            :aria-selected="store.feedSort === s.key"
            :class="{ active: store.feedSort === s.key }"
            @click="store.switchFeedSort(s.key)"
          >
            {{ s.label }}
          </button>
        </div>
        <article
          v-for="(p, index) in store.posts"
          :key="p.id"
          class="post-card reveal"
          :class="{ pinned: p.pinned }"
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
            <span v-if="p.pinned" class="flag-chip pinned-chip" title="管理员置顶">📌 置顶</span>
            <span v-if="p.featured" class="flag-chip featured-chip" title="管理员加精"
              ><AppIcon name="spark" :size="12" /> 精华</span
            >
            <span class="post-badge" @click.stop="store.openCommunity({ id: p.community_id, name: p.community })">{{
              p.community || '讨论'
            }}</span>
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
            ><span class="read-more">阅读全文 →</span><span class="topic"># {{ p.community || '分享' }}</span>
          </footer>
        </article>
        <button v-if="store.hasMoreHome" class="load-more" :disabled="store.feedLoading" @click="store.loadFeed(false)">
          <AppIcon name="arrowUp" :size="14" class="flip-down" />
          {{ store.feedLoading ? '加载中…' : '加载更多帖子' }}
        </button>
        <div v-if="!store.posts.length" class="empty-card">
          <span><AppIcon name="spark" :size="22" /></span>
          <h3>社区正在等待第一条讨论</h3>
          <p>分享你此刻的想法，和同频的伙伴聊聊。</p>
          <button class="primary" @click="store.startWrite">发布第一条</button>
        </div>
      </section>

      <aside class="community-sidebar">
        <section
          class="profile-panel"
          role="button"
          tabindex="0"
          @click="store.openProfile"
          @keydown.enter="store.openProfile"
        >
          <video
            v-if="profileBgVisible && profileBgIsVideo"
            class="profile-bg-media"
            :src="profileBg"
            autoplay
            muted
            loop
            playsinline
          ></video>
          <img v-else-if="profileBgVisible" class="profile-bg-media" :src="profileBg" alt="" />
          <div class="profile-motion motion-one"></div>
          <div class="profile-motion motion-two"></div>
          <div class="profile-stars" aria-hidden="true">
            <AppIcon name="spark" :size="11" /><span>·</span><AppIcon name="spark" :size="11" /><span>·</span
            ><AppIcon name="spark" :size="11" />
          </div>
          <div class="profile-avatar-frame">
            <div class="profile-avatar">
              <img v-if="store.user?.avatar" :src="store.user.avatar" alt="用户头像" /><template v-else>{{
                store.initials(store.user?.name || '黑盒')
              }}</template>
            </div>
          </div>
          <h2>{{ store.user?.name || '黑盒访客' }}</h2>
          <p>{{ store.user?.bio || (store.user ? '每一次分享，都会成为社区的光。' : '登录后记录你的灵感与热爱。') }}</p>
          <div class="profile-stats">
            <div>
              <b>{{ store.totalPostCount }}</b
              ><span>帖子</span>
            </div>
            <div>
              <b>{{ store.communities.length }}</b
              ><span>社区</span>
            </div>
            <div>
              <b>{{ store.onlineMembers }}</b
              ><span>伙伴</span>
            </div>
          </div>
          <button @click.stop="store.startWrite">
            <template v-if="store.user"><AppIcon name="plus" :size="15" /> 发起讨论</template>
            <template v-else>登录社区</template></button
          ><small class="profile-link">点击名片进入个人中心</small>
        </section>
        <section class="sidebar-card topic-card">
          <h2><AppIcon name="chat" :size="16" /> 讨论主题</h2>
          <div class="tags">
            <button v-for="tag in store.treeholeTags" :key="tag" @click="store.openDiscussions(tag)">
              # {{ tag }}
            </button>
          </div>
        </section>
      </aside>
    </div>
    <footer class="home-footer">
      <div class="footer-links">
        <button @click="router.push('/')">发现</button><span>·</span
        ><button @click="router.push('/communities')">社区</button><span>·</span
        ><button @click="store.openDiscussions()">树洞</button><span>·</span
        ><button @click="store.openProfile">个人中心</button>
      </div>
      <p><AppIcon name="spark" :size="12" /> 黑盒社区 · 每一次相遇，都是久别重逢</p>
    </footer>
  </section>
</template>
