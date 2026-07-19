import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'chat',
    component: () => import('../views/ChatView.vue'),
  },
  {
    path: '/memory',
    name: 'memory',
    component: () => import('../views/MemoryView.vue'),
  },
  {
    path: '/library',
    name: 'library',
    component: () => import('../views/LibraryView.vue'),
  },
  {
    path: '/monitor',
    name: 'monitor',
    component: () => import('../views/MonitorView.vue'),
  },
  {
    path: '/visual',
    name: 'visual',
    component: () => import('../views/VisualView.vue'),
  },
  {
    path: '/learning',
    name: 'learning',
    component: () => import('../views/LearningView.vue'),
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/ProfileView.vue'),
  },
  {
    path: '/soul',
    name: 'soul',
    component: () => import('../views/SoulView.vue'),
  },
  {
    path: '/work',
    name: 'work',
    component: () => import('../views/WorkView.vue'),
  },
  {
    path: '/skill',
    name: 'skill',
    component: () => import('../views/SkillView.vue'),
  },
  {
    path: '/mcp',
    name: 'mcp',
    component: () => import('../views/MCPView.vue'),
  },
  {
    path: '/models',
    name: 'models',
    component: () => import('../views/ModelConfigView.vue'),
  },
  {
    path: '/agent',
    name: 'agent',
    component: () => import('../views/AgentView.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('../views/HistoryView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router