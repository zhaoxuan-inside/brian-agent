<script setup lang="ts">
import { Brain, Library, Settings, Sun, Moon, User, Layers, Puzzle, Wand2, Server, MessageCircle, Cpu, GitBranch, BookOpen, BarChart3, History, Bot } from '@lucide/vue'
import { useThemeStore } from '../stores/theme'
import { useRouter, useRoute } from 'vue-router'

const themeStore = useThemeStore()
const router = useRouter()
const route = useRoute()

const menuItems = [
  { icon: MessageCircle, route: '/', label: '对话' },
  { icon: History, route: '/history', label: '历史' },
  { icon: Brain, route: '/memory', label: '记忆' },
  { icon: BarChart3, route: '/monitor', label: '监控' },
  { icon: GitBranch, route: '/visual', label: '可视化' },
  { icon: BookOpen, route: '/learning', label: '学习' },
  { icon: Library, route: '/library', label: '资料库' },
  { icon: Layers, route: '/soul', label: 'Soul' },
  { icon: Puzzle, route: '/work', label: 'Work' },
  { icon: Wand2, route: '/skill', label: 'Skill' },
  { icon: Cpu, route: '/models', label: '模型' },
  { icon: Bot, route: '/agent', label: 'Agent管理' },
]

function isActive(menuRoute: string): boolean {
  return route.path === menuRoute
}

function handleThemeToggle() {
  console.log('[Theme] before toggle - isDark:', themeStore.isDark)
  themeStore.toggleTheme()
  console.log('[Theme] after toggle - isDark:', themeStore.isDark)
}
</script>

<template>
  <header class="fixed top-0 left-0 right-0 z-50 p-5 flex items-center justify-between">
    <div class="flex items-center">
      <h1 class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 tracking-tight">
        Brian
      </h1>
    </div>

    <div class="flex items-center gap-2">
      <button 
        v-for="item in menuItems" 
        :key="item.route"
        :class="[
          'icon-btn transition-colors',
          isActive(item.route) 
            ? 'text-brian-blue' 
            : 'text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue dark:hover:text-brian-blue'
        ]"
        :title="item.label"
        @click="router.push(item.route)"
      >
        <component :is="item.icon" :size="22" />
      </button>
      
      <button 
        class="icon-btn text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue dark:hover:text-brian-blue transition-colors"
        :title="themeStore.isDark ? '切换到浅色模式' : '切换到深色模式'"
        @click="handleThemeToggle"
      >
        <Sun v-if="themeStore.isDark" :size="22" />
        <Moon v-else :size="22" />
      </button>
      
      <button 
        class="icon-btn text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue dark:hover:text-brian-blue transition-colors"
        title="设置"
        @click="router.push('/settings')"
      >
        <Settings :size="22" />
      </button>
      
      <div class="w-px h-6 bg-apple-gray-200 dark:bg-apple-gray-700 mx-2" />
      
      <button class="icon-btn" title="用户画像" @click="router.push('/profile')">
        <User :size="22" class="text-apple-gray-600 dark:text-apple-gray-400" />
      </button>
    </div>
  </header>
</template>
