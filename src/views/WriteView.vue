<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStore } from '../store.js'
import { clearDraft, draftTime, readDraft, saveDraft } from '../draft.js'
import AppIcon from '../components/AppIcon.vue'

const store = useStore()

const TITLE_MAX = 160
const BODY_MAX = 2000
const MAX_IMAGES = 9
const AUTOSAVE_DELAY = 1200
const EMOJIS = ['🌙', '✨', '🍃', '🎧', '📷', '💡', '🫧', '🔥', '🌊', '🌻', '☕', '🎨']

const fileInput = ref(null)
const bodyEl = ref(null)
const dragging = ref(false)
const previews = ref([])
const immersive = ref(false)
const panel = ref('')
const draftSavedAt = ref(0)
const draftDirty = ref(false)

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
const titlePlaceholder = computed(() => (isTreehole.value ? '想倾诉什么？（一句话标题）' : '请输入标题'))
const bodyPlaceholder = computed(() =>
  isTreehole.value ? '把心里话写在这里，会有人静静读完…' : '请输入正文，说说你的想法…'
)
const submitLabel = computed(() => (store.editingPost ? '保存修改' : isTreehole.value ? '投入树洞' : '发布帖子'))
const authorName = computed(() => (isTreehole.value ? '匿名' : store.user && store.user.name ? store.user.name : '我'))
const previewCommunity = computed(
  () => targetName.value || (isTreehole.value ? store.treeholeCommunity.name : '未选择社区')
)
const draftState = computed(() => {
  if (!draftSavedAt.value) return titleReady.value || contentReady.value ? '未保存' : ''
  const at = draftTime(draftSavedAt.value)
  return draftDirty.value ? `草稿 ${at} · 有改动` : '已存草稿'
})

function setMode(from) {
  if (store.editingPost) return
  store.writeFrom = from
  if (from === 'discussions') {
    store.post.communityId = store.treeholeCommunity.id
    store.selectedCommunity = store.treeholeCommunity
  } else {
    store.post.communityId = ''
    store.selectedCommunity = null
  }
  markDirty()
}

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
  store.post.images = [...store.post.images, ...picked].slice(0, MAX_IMAGES)
  syncPreviews()
  markDirty()
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
  markDirty()
}

function insertEmoji(emoji) {
  const el = bodyEl.value
  const text = store.post.content
  const start = el && typeof el.selectionStart === 'number' ? el.selectionStart : text.length
  const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : start
  store.post.content = `${text.slice(0, start)}${emoji}${text.slice(end)}`
  panel.value = ''
  markDirty()
  nextTick(() => {
    if (!el) return
    el.focus()
    el.setSelectionRange(start + emoji.length, start + emoji.length)
  })
}

function saveDraftNow() {
  const at = saveDraft(store.post)
  if (at) {
    draftSavedAt.value = at
    draftDirty.value = false
  }
}

function readDraftBack() {
  const draft = readDraft()
  if (!draft) return
  store.post.title = draft.title
  store.post.content = draft.content
  if (draft.communityId !== '' && !isTreehole.value) store.post.communityId = draft.communityId
  draftSavedAt.value = draft.savedAt || Date.now()
  draftDirty.value = false
}

function discardDraft() {
  clearDraft()
  store.post.title = ''
  store.post.content = ''
  draftSavedAt.value = 0
  draftDirty.value = false
}

function markDirty() {
  if (!store.editingPost) draftDirty.value = true
}

async function submit() {
  if (!canPublish.value) return
  const result = store.publish()
  // 同步 publish（测试替身）直接收尾，异步 publish 等落定后再收尾，避免清草稿早于成功判断
  if (result && typeof result.then === 'function') await result
  if (!store.postMessage && !store.post.title) {
    clearDraft()
    draftSavedAt.value = 0
    draftDirty.value = false
  }
}

function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault()
    saveDraftNow()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    submit()
    return
  }
  if (event.key === 'Escape') store.goBackFromWrite()
}

let autosaveTimer = null
function scheduleAutosave() {
  if (store.editingPost || !draftDirty.value) return
  if (autosaveTimer) window.clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null
    if (draftDirty.value) saveDraftNow()
  }, AUTOSAVE_DELAY)
}

watch(() => [store.post.title, store.post.content, store.post.communityId], scheduleAutosave)

// 在首次渲染前就把草稿填回去，避免先闪一屏空白编辑器
if (!store.editingPost) readDraftBack()

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (autosaveTimer) window.clearTimeout(autosaveTimer)
  release()
})
</script>

<template>
  <section class="write-page-wrap view-enter">
    <button class="back-button write-back" type="button" @click="store.goBackFromWrite">
      <AppIcon name="arrowUp" :size="14" class="write-back-icon" />返回
    </button>

    <div class="write-shell" :class="{ 'is-immersive': immersive }">
      <div class="card write-editor">
        <div class="write-tabs" role="tablist">
          <button
            class="write-tab"
            :class="{ 'is-active': !isTreehole }"
            type="button"
            role="tab"
            :aria-selected="!isTreehole"
            :disabled="Boolean(store.editingPost)"
            @click="setMode('home')"
          >
            发布图文
          </button>
          <button
            class="write-tab"
            :class="{ 'is-active': isTreehole }"
            type="button"
            role="tab"
            :aria-selected="isTreehole"
            :disabled="Boolean(store.editingPost)"
            @click="setMode('discussions')"
          >
            匿名倾诉
          </button>
          <button
            class="write-tool write-tool-immersive"
            type="button"
            aria-label="沉浸模式"
            :aria-pressed="immersive"
            @click="immersive = !immersive"
          >
            <AppIcon name="expand" :size="15" />
          </button>
        </div>

        <p v-if="store.editingPost" class="write-note">
          <AppIcon name="edit" :size="15" />
          正在编辑已有帖子，保存后会同步更新到所有页面；编辑模式暂不支持更换图片。
        </p>
        <p v-else-if="isTreehole" class="write-note write-note-anon">
          <AppIcon name="shield" :size="15" />
          将以匿名身份发布到「{{ store.treeholeCommunity.name }}」，你的昵称与头像不会出现。
        </p>

        <div v-if="!store.editingPost" class="write-field write-field-images">
          <div
            class="write-drop"
            :class="{ 'is-dragging': dragging }"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <ul v-if="previews.length" class="write-thumbs">
              <li v-for="(item, index) in previews" :key="item.key" class="write-thumb">
                <img :src="item.url" :alt="item.name" />
                <button
                  type="button"
                  class="write-thumb-remove"
                  :aria-label="`移除 ${item.name}`"
                  @click="removeImage(index)"
                >
                  <AppIcon name="close" :size="12" />
                </button>
              </li>
            </ul>
            <button
              v-if="previews.length < MAX_IMAGES"
              type="button"
              class="write-tile-add"
              aria-label="添加图片"
              @click="fileInput && fileInput.click()"
            >
              <AppIcon name="plus" :size="22" />
              <span>添加图片</span>
            </button>
          </div>
          <p class="write-drop-note">
            拖拽或点击上传 · {{ previews.length }}/{{ MAX_IMAGES }} 张 · 支持 JPG / PNG / GIF / WebP，单张不超过 50 MB
          </p>
          <input ref="fileInput" class="write-file" type="file" accept="image/*" multiple @change="onPick" />
        </div>

        <label class="write-field write-field-title">
          <input
            v-model="store.post.title"
            class="write-title"
            type="text"
            :maxlength="TITLE_MAX"
            :placeholder="titlePlaceholder"
            @input="markDirty"
          />
          <span class="write-count">{{ store.post.title.length }}/{{ TITLE_MAX }}</span>
        </label>

        <label v-if="!isTreehole" class="write-field write-field-select">
          <span class="write-label">关联社区</span>
          <select v-model="store.post.communityId" class="write-select" aria-label="选择社区" @change="markDirty">
            <option value="">选择社区</option>
            <option v-for="c in store.communities" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <span class="write-label write-label-hint">发布后归属到该社区</span>
        </label>
        <p v-else class="write-field write-anon-line">
          <AppIcon name="shield" :size="14" />匿名内容固定在「{{ store.treeholeCommunity.name }}」，无需选择社区
        </p>

        <div class="write-field write-field-body">
          <textarea
            ref="bodyEl"
            v-model="store.post.content"
            class="write-body"
            :maxlength="BODY_MAX"
            :placeholder="bodyPlaceholder"
            @input="markDirty"
          ></textarea>
          <div class="write-toolbar">
            <button
              class="write-tool"
              type="button"
              aria-label="插入表情"
              @click="panel = panel === 'emoji' ? '' : 'emoji'"
            >
              <AppIcon name="smile" :size="15" />
            </button>
            <button class="write-tool" type="button" aria-label="插入图片" @click="fileInput && fileInput.click()">
              <AppIcon name="image" :size="15" />
            </button>
            <span class="write-count">{{ store.post.content.length }}/{{ BODY_MAX }}</span>
          </div>
          <div v-if="panel === 'emoji'" class="write-emoji-panel">
            <button
              v-for="emoji in EMOJIS"
              :key="emoji"
              class="write-emoji"
              type="button"
              :aria-label="`插入 ${emoji}`"
              @click="insertEmoji(emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </div>

        <p v-if="store.postMessage" class="write-message">{{ store.postMessage }}</p>

        <div class="write-actions">
          <template v-if="!store.editingPost">
            <button class="write-draft" type="button" @click="saveDraftNow">
              <AppIcon name="save" :size="14" />存草稿
            </button>
            <span class="write-draft-state">{{ draftState }}</span>
            <button v-if="draftSavedAt" class="write-draft-discard" type="button" @click="discardDraft">
              丢弃草稿
            </button>
          </template>
          <span class="write-hint">{{ blockedHint }}</span>
          <span class="write-actions-gap"></span>
          <button class="link" type="button" @click="store.goBackFromWrite">取消</button>
          <button class="primary write-submit" type="button" :disabled="!canPublish" @click="submit">
            <AppIcon :name="isTreehole ? 'shield' : 'spark'" :size="15" />
            {{ submitLabel }}
          </button>
        </div>
      </div>

      <aside class="write-side">
        <div class="card write-preview-card">
          <h2 class="write-side-title">预览</h2>
          <article class="post-card preview-card">
            <header class="post-head">
              <span class="post-avatar tone-2 preview-avatar">{{ store.initials(authorName) }}</span>
              <div class="preview-meta">
                <b class="preview-author">{{ authorName }}</b>
                <p class="preview-sub">
                  {{ store.relativeDate(Date.now()) }} ·
                  <span class="preview-community">{{ previewCommunity }}</span>
                </p>
              </div>
            </header>
            <div class="post-content preview-content">
              <strong class="preview-title">{{ store.post.title || '标题' }}</strong>
              <p class="preview-body">{{ store.post.content || '正文' }}</p>
            </div>
            <div v-if="previews.length" class="post-cover preview-cover">
              <img :src="previews[0].url" :alt="previews[0].name" />
            </div>
          </article>
        </div>

        <div class="card write-help">
          <h2 class="write-side-title">帮助说明</h2>
          <ul class="write-help-list">
            <li><kbd>Ctrl</kbd><kbd>Enter</kbd><span>发布帖子</span></li>
            <li><kbd>Ctrl</kbd><kbd>S</kbd><span>保存草稿</span></li>
            <li><kbd>Esc</kbd><span>返回上一页</span></li>
          </ul>
          <p class="write-help-note">
            草稿只存在这台设备的浏览器里；标题最多 {{ TITLE_MAX }} 字，正文最多 {{ BODY_MAX }} 字，配图最多
            {{ MAX_IMAGES }} 张。
          </p>
        </div>
      </aside>
    </div>
  </section>
</template>
