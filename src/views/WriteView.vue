<script setup>
import { useStore } from '../store.js'
const store = useStore()

// 内联多语句（a = '' ; b = null）会被 Prettier 拆行，Vue 模板表达式解析不了，收敛成方法
function clearCommunity() {
  store.post.communityId = ''
  store.selectedCommunity = null
}
</script>

<template>
  <section class="write-page-wrap view-enter">
    <button class="back-button" @click="store.goBackFromWrite">← 返回</button>
    <div class="card form-card write-page" :class="{ 'treehole-write': store.writeFrom === 'discussions' }">
      <p class="eyebrow blue">
        {{
          store.editingPost ? 'EDIT A POST' : store.writeFrom === 'discussions' ? 'TREEHOLE LETTER' : 'CREATE A POST'
        }}
      </p>
      <h1>{{ store.editingPost ? '编辑帖子' : store.writeFrom === 'discussions' ? '匿名倾诉' : '发起新讨论' }}</h1>
      <p v-if="store.editingPost" class="write-target">
        正在编辑帖子，保存后将同步更新到所有页面。<span class="write-target-note">编辑模式暂不支持更换图片/视频。</span>
      </p>
      <p v-if="!store.editingPost && store.writeFrom === 'discussions'" class="write-target treehole-write-tip">
        🔒 将以匿名身份发布到这里，你的昵称、头像都不会出现在帖子里。
      </p>
      <p
        v-if="
          !store.editingPost && store.writeFrom !== 'discussions' && store.post.communityId && store.selectedCommunity
        "
        class="write-target"
      >
        将发布到「{{ store.selectedCommunity.name }}」<button class="link" @click="clearCommunity">更换社区</button>
      </p>
      <input
        v-model="store.post.title"
        maxlength="160"
        :placeholder="store.writeFrom === 'discussions' && !store.editingPost ? '想倾诉什么？（一句话标题）' : '标题'"
      />
      <select v-if="store.writeFrom !== 'discussions'" v-model="store.post.communityId">
        <option value="">选择社区</option>
        <option v-for="c in store.communities" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <textarea
        v-model="store.post.content"
        :placeholder="
          store.writeFrom === 'discussions' && !store.editingPost
            ? '把心里话写在这里，会有人静静读完…'
            : '分享你的想法…'
        "
      ></textarea>
      <label v-if="!store.editingPost"
        >图片 <input type="file" multiple accept="image/*" @change="store.post.images = [...$event.target.files]"
      /></label>
      <label v-if="!store.editingPost"
        >视频 <input type="file" accept="video/*" @change="store.post.video = $event.target.files[0]"
      /></label>
      <p v-if="store.postMessage" class="profile-message">{{ store.postMessage }}</p>
      <div class="write-actions">
        <button class="primary" @click="store.publish">
          {{ store.editingPost ? '保存修改' : store.writeFrom === 'discussions' ? '投入树洞' : '发布帖子' }}</button
        ><button class="link" @click="store.goBackFromWrite">取消</button>
      </div>
    </div>
  </section>
</template>
