<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from '../store.js'

const store = useStore()
const route = useRoute()

onMounted(() => {
  // 受保护页面登录后跳回原目标（如 /write），登录成功由 store.submitAuth 消费
  if (route.query.redirect) store.authRedirect = String(route.query.redirect)
})
</script>

<template>
  <section class="card auth view-enter">
    <p class="eyebrow blue">BLACKBOX COMMUNITY</p>
    <h1>{{ store.mode === 'register' ? '加入黑盒社区' : '欢迎回来' }}</h1>
    <input v-if="store.mode === 'register'" v-model="store.form.name" placeholder="昵称" />
    <input v-model="store.form.email" placeholder="邮箱" />
    <input v-model="store.form.password" type="password" placeholder="密码" @keyup.enter="store.submitAuth" />
    <button class="primary" @click="store.submitAuth">
      {{ store.mode === 'register' ? '注册并进入社区' : '登录' }}
    </button>
    <button class="link" @click="store.mode = store.mode === 'login' ? 'register' : 'login'">
      {{ store.mode === 'login' ? '没有账号？注册' : '已有账号？登录' }}
    </button>
    <p v-if="store.error" class="error">{{ store.error }}</p>
  </section>
</template>
