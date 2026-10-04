<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useStore } from '../store.js'
import AppIcon from '../components/AppIcon.vue'

const store = useStore()

const TITLE_MAX = 160

const fileInput = ref(null)
const dragging = ref(false)
const previews = ref([])

const isTreehole = computed(() => store.writeFrom === 'discussions' && !store.editingPost)
const titleReady = computed(() => Boolean(store.post.title.trim()))
const contentReady = computed(() => Boolean(store.post.content.trim()))
const targetName = computed(() => {
  if (store.selectedCommunity) return store.selectedCommunity.name
  const hit = store.communities.find((c) => String(c.id) === String(store.post.communityId))
  return hit ? hit.name : ''
})
const canPublish = computed(
  () => titleReady.value && contentReady.value && Boolean(isTreehole.value || store.post.communityId)
)
const blockedHint = computed(() => {
  if (!titleReady.value) return '还差一个标题'
  if (!contentReady.value) return '正文还空着'
  if (!isTreehole.value && !store.post.communityId) return '还没选发布到哪个社区'
  return ''
})
const headline = computed(() => (store.editingPost ? '编辑帖子' : isTreehole.value ? '匿名倾诉' : '发起新讨论'))
const eyebrowText = computed(() =>
  store.editingPost ? 'EDIT A POST' : isTreehole.value ? 'TREEHOLE LETTER' : 'CREATE A POST'
)
const titlePlaceholder = computed(() => (isTreehole.value ? '想倾诉什么？（一句话标题）' : '起个标题，让人想点进来'))
const bodyPlaceholder = computed(() => (isTreehole.value ? '把心里话写在这里，会有人静静读完…' : '展开说说你的想法…'))

function makeUrl(file) {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''
}

function release() {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    for (const p of previews.value) URL.revokeObjectURL(p.url)
  }
}

function syncPreviews() {
  release()
  previews.value = store.post.images.map((file, index) => ({
    key: `${index}-${file.name}-${file.size}`,
    url: makeUrl(file),
    name: file.name,
  }))
}

function addFiles(list) {
  const picked = Array.from(list || []).filter((f) => f && String(f.type || '').startsWith('image/'))
  if (!picked.length) return
  store.post.images = [...store.post.images, ...picked]
  syncPreviews()
}

function onPick(event) {
  addFiles(event.target.files)
  if (event.target) event.target.value = ''
}

function onDrop(event) {
  dragging.value = false
  addFiles(event.dataTransfer && event.dataTransfer.files)
}

function removeImage(index) {
  store.post.images = store.post.images.filter((_, i) => i !== index)
  syncPreviews()
}

function clearCommunity() {
  store.post.communityId = ''
  store.selectedCommunity = null
}

onBeforeUnmount(release)
</script>

<template>
  <section class="write-page-wrap view-enter">
    <button class="back-button write-back" type="button" @click="store.goBackFromWrite">
      <AppIcon name="arrowUp" :size="14" class="write-back-icon" />返回
    </button>

    <div class="card form-card write-page" :class="{ 'treehole-write': isTreehole }">
      <header class="write-head">
        <div class="write-head-text">
          <p class="eyebrow blue">{{ eyebrowText }}</p>
          <h1>{{ headline }}</h1>
        </div>
        <span class="write-badge" :class="{ 'is-anon': isTreehole }">
          <AppIcon :name="isTreehole ? 'shield' : 'users'" :size="13" />
          {{ isTreehole ? '匿名' : targetName || '未选社区' }}
        </span>
      </header>

      <p v-if="store.editingPost" class="write-note">
        <AppIcon name="edit" :size="15" />
        正在编辑已有帖子，保存后会同步更新到所有页面；编辑模式暂不支持更换图片。
      </p>
      <p v-else-if="isTreehole" class="write-note write-note-anon">
        <AppIcon name="shield" :size="15" />
        将以匿名身份发布，你的昵称与头像不会出现在帖子里。
      </p>
      <p v-else-if="store.post.communityId" class="write-note">
        <AppIcon name="users" :size="15" />
        将发布到「{{ targetName }}」
        <button class="link" type="button" @click="clearCommunity">更换</button>
      </p>

      <label class="write-field">
        <span class="write-field-head">
          <span class="write-label">标题</span>
          <span class="write-count">{{ store.post.title.length }}/{{ TITLE_MAX }}</span>
        </span>
        <input
          v-model="store.post.title"
          class="write-title"
          type="text"
          :maxlength="TITLE_MAX"
          :placeholder="titlePlaceholder"
        />
      </label>

      <label v-if="!isTreehole" class="write-field">
        <span class="write-field-head">
          <span class="write-label">社区</span>
        </span>
        <select v-model="store.post.communityId" class="write-select" aria-label="选择社区">
          <option value="">选择社区</option>
          <option v-for="c in store.communities" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>

      <label class="write-field">
        <span class="write-field-head">
          <span class="write-label">正文</span>
          <span class="write-count">{{ store.post.content.length }} 字</span>
        </span>
        <textarea v-model="store.post.content" class="write-body" :placeholder="bodyPlaceholder"></textarea>
      </label>

      <div v-if="!store.editingPost" class="write-field">
        <span class="write-field-head">
          <span class="write-label">配图</span>
          <span class="write-count">{{ store.post.images.length }} 张</span>
        </span>
        <button
          type="button"
          class="write-drop"
          :class="{ 'is-dragging': dragging }"
          @click="fileInput && fileInput.click()"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <AppIcon name="plus" :size="18" />
          <b>把图片拖到这里</b>
          <span>或点击选择 · 可多张 · JPG / PNG / GIF / WebP</span>
        </button>
        <input ref="fileInput" class="write-file" type="file" accept="image/*" multiple @change="onPick" />
        <ul v-if="previews.length" class="write-previews">
          <li v-for="(item, index) in previews" :key="item.key" class="write-preview">
            <img :src="item.url" :alt="item.name" />
            <button
              type="button"
              class="write-preview-remove"
              :aria-label="`移除 ${item.name}`"
              @click="removeImage(index)"
            >
              <AppIcon name="close" :size="12" />
            </button>
          </li>
        </ul>
      </div>

      <p v-if="store.postMessage" class="write-message">{{ store.postMessage }}</p>

      <div class="write-actions">
        <span class="write-hint">{{ blockedHint }}</span>
        <button class="link" type="button" @click="store.goBackFromWrite">取消</button>
        <button class="primary write-submit" type="button" :disabled="!canPublish" @click="store.publish">
          <AppIcon :name="isTreehole ? 'shield' : 'spark'" :size="15" />
          {{ store.editingPost ? '保存修改' : isTreehole ? '投入树洞' : '发布帖子' }}
        </button>
      </div>
    </div>
  </section>
</template>
