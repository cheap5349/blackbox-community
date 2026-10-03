<script setup>
import { useStore } from '../store.js'
const store = useStore()
</script>

<template>
  <section class="write-page-wrap view-enter">
    <button class="back-button" @click="store.goBackFromCreateCommunity">← 返回社区列表</button>
    <div class="card form-card write-page">
      <p class="eyebrow blue">CREATE A COMMUNITY</p>
      <h1>创建社区</h1>
      <p class="form-tip">为同频的人建立一个专属角落，名称和简介都很重要。</p>
      <input v-model="store.communityDraft.name" maxlength="80" placeholder="社区名称（最长 80 字）" />
      <textarea
        v-model="store.communityDraft.description"
        maxlength="500"
        placeholder="社区简介，让同频的人找到你…"
      ></textarea>
      <p v-if="store.communityMessage" class="profile-message">{{ store.communityMessage }}</p>
      <div class="write-actions">
        <button class="primary" @click="store.createCommunity">创建社区</button
        ><button class="link" @click="store.goBackFromCreateCommunity">取消</button>
      </div>
    </div>
  </section>
</template>
