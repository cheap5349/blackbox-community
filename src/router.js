// 路由表 + 守卫。视图用懒加载，避免 router → views → store 的循环导入
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/post/:id', name: 'post', component: () => import('./views/PostView.vue') },
  { path: '/community/:id', name: 'community', component: () => import('./views/CommunityView.vue') },
  { path: '/communities', name: 'communities', component: () => import('./views/CommunitiesView.vue') },
  { path: '/discussions', name: 'discussions', component: () => import('./views/DiscussionsView.vue') },
  { path: '/write', name: 'write', component: () => import('./views/WriteView.vue'), meta: { requiresAuth: true } },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('./views/ProfileView.vue'),
    meta: { requiresAuth: true },
  },
  { path: '/login', name: 'login', component: () => import('./views/AuthView.vue') },
  {
    path: '/create-community',
    name: 'create-community',
    component: () => import('./views/CreateCommunityView.vue'),
    meta: { requiresAuth: true },
  },
  { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { requiresAdmin: true } },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const user = JSON.parse(localStorage.user || 'null')
  if (to.meta.requiresAuth && !user) return { path: '/login', query: { redirect: to.fullPath } }
  if (to.meta.requiresAdmin && user?.role !== 'admin') return '/'
})
