<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from '../store.js'
import { useProfileBg } from '../composables/useProfileBg.js'
import AppIcon from '../components/AppIcon.vue'

const store = useStore()
const router = useRouter()
const { profileBg, profileBgIsVideo, profileBgVisible } = useProfileBg()

onMounted(() => {
  Promise.all([store.loadMyPosts(), store.loadMyCommunities()])
})
</script>

<template>
  <section class="profile-page view-enter">
    <div class="profile-page-head">
      <button class="back-button" @click="router.push('/')">← 返回社区</button
      ><button class="logout-button profile-logout" type="button" @click="store.logout">退出登录</button>
      <p class="eyebrow blue">YOUR BLACKBOX</p>
      <h1>个人中心</h1>
      <p>在这里整理你的身份，也让社区更认识你。</p>
    </div>
    <div class="profile-editor">
      <aside class="profile-preview">
        <video
          v-if="profileBgVisible && profileBgIsVideo"
          class="profile-bg-media"
          :src="profileBg"
          autoplay
          muted
          loop
          playsinline
        ></video
        ><img v-else-if="profileBgVisible" class="profile-bg-media" :src="profileBg" alt="" />
        <div class="preview-orbit">
          <div class="preview-avatar">
            <img v-if="store.profileDraft.avatar" :src="store.profileDraft.avatar" alt="头像预览" /><span v-else>{{
              store.initials(store.profileDraft.name || '黑盒')
            }}</span>
          </div>
        </div>
        <h2>
          {{ store.profileDraft.name || '黑盒访客'
          }}<span v-if="store.isAdmin" class="role-badge"><AppIcon name="spark" :size="12" /> 管理员</span>
        </h2>
        <p>{{ store.user?.email }}</p>
        <small class="join-date"
          ><AppIcon name="spark" :size="12" /> 加入于 {{ store.joinDate(store.user?.created_at) }}</small
        ><label class="avatar-picker">更换头像<input type="file" accept="image/*" @change="store.chooseAvatar" /></label
        ><small>支持 JPG、PNG、WebP，最大 5 MB，保存时自动压缩到 512px</small>
      </aside>
      <form class="profile-form" @submit.prevent="store.saveProfile">
        <h2>编辑资料</h2>
        <label>昵称<input v-model="store.profileDraft.name" maxlength="40" required /></label>
        <label>邮箱<input :value="store.user?.email" disabled /></label>
        <label
          >个人简介<textarea
            v-model="store.profileDraft.bio"
            maxlength="200"
            placeholder="一句话介绍自己，让大家更认识你…"
          ></textarea
          ><small class="bio-count">{{ store.profileDraft.bio.length }}/200</small></label
        >
        <hr />
        <h3>修改密码</h3>
        <p class="form-tip">如不修改密码，下面两项留空即可。</p>
        <label
          >当前密码<input v-model="store.profileDraft.currentPassword" type="password" autocomplete="current-password"
        /></label>
        <label
          >新密码<input
            v-model="store.profileDraft.newPassword"
            type="password"
            minlength="6"
            autocomplete="new-password"
        /></label>
        <p v-if="store.profileMessage" class="profile-message">{{ store.profileMessage }}</p>
        <button class="primary" type="submit">保存更改</button>
      </form>
    </div>
    <div class="profile-lists">
      <section class="sidebar-card my-list">
        <h2>
          <AppIcon name="activity" :size="16" /> 我发布的帖子
          <small class="feed-count">{{ store.myPosts.length }}</small>
        </h2>
        <div v-if="store.myPosts.length">
          <div v-for="p in store.myPosts" :key="p.id" class="my-item">
            <button class="my-item-body" @click="store.openPost(p)">
              <span class="my-title">{{ p.title }}</span
              ><small>{{ p.community }} · {{ store.relativeDate(p.created_at) }}</small>
            </button>
            <button class="my-edit" title="编辑帖子" @click="store.startEditPost(p)">
              <AppIcon name="edit" :size="14" />
            </button>
            <button class="my-delete" title="删除帖子" @click="store.deleteMyPost(p)">
              <AppIcon name="close" :size="14" />
            </button>
          </div>
        </div>
        <p v-else class="my-empty">
          还没有发布过帖子，<button class="link" @click="store.startWrite">去发起一条</button>。
        </p>
      </section>
      <section v-if="store.isAdmin" class="sidebar-card my-list admin-entry">
        <h2><AppIcon name="settings" :size="16" /> 管理后台</h2>
        <p class="my-empty">查看并管理社区里的所有帖子与社区，编辑或删除违规内容。</p>
        <button class="primary" @click="store.openAdmin">进入管理后台</button>
      </section>
      <section class="sidebar-card my-list">
        <h2>
          <AppIcon name="users" :size="16" /> 我创建的社区
          <small class="feed-count">{{ store.myCommunities.length }}</small>
        </h2>
        <div v-if="store.myCommunities.length">
          <button v-for="c in store.myCommunities" :key="c.id" class="my-item" @click="store.openCommunity(c)">
            <span class="my-title">{{ c.name }}</span
            ><small>{{ c.postCount }} 篇帖子</small>
          </button>
        </div>
        <p v-else class="my-empty">
          还没有创建社区，去 <button class="link" @click="store.startCreateCommunity">创建</button> 一个属于你的角落。
        </p>
      </section>
    </div>
  </section>
</template>
