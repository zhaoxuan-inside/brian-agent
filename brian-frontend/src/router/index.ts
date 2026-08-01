import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'chat', component: () => import('@/views/ChatView.vue'), meta: { title: '对话' } },
  { path: '/info', name: 'info', component: () => import('@/views/InfoView.vue'), meta: { title: '信息' } },
  { path: '/learning', name: 'learning', component: () => import('@/views/LearningView.vue'), meta: { title: '学习' } },
  { path: '/monitor', name: 'monitor', component: () => import('@/views/MonitorView.vue'), meta: { title: '监控' } },
  { path: '/config', name: 'config', component: () => import('@/views/ConfigView.vue'), meta: { title: '配置' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || 'Brian-Agent'
  document.title = `${title} - Brian-Agent`
})

export default router
