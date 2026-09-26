import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  
  
  
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '首页' } },
  { path: '/chat', name: 'chat', component: () => import('@/views/ChatView.vue'), meta: { title: '对话' } },
  { path: '/info', name: 'info', component: () => import('@/views/InfoView.vue'), meta: { title: '信息' } },
  { path: '/learning', name: 'learning', component: () => import('@/views/LearningView.vue'), meta: { title: '学习' } },
  { path: '/monitor', name: 'monitor', component: () => import('@/views/MonitorView.vue'), meta: { title: '监控' } },
  { path: '/config', name: 'config', component: () => import('@/views/ConfigView.vue'), meta: { title: '配置' } },
  { path: '/tool', name: 'tool', component: () => import('@/views/ToolView.vue'), meta: { title: '工具' } },
  { path: '/cron', name: 'cron', component: () => import('@/views/CronView.vue'), meta: { title: '定时任务' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || 'Brian-Agent'
  document.title = `${title} - Brian-Agent`
})

export default router
