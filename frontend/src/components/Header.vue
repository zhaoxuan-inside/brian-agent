<script setup lang="ts">
import { MessageCircle, Brain, BookOpen, BarChart3, Settings, Sun, Moon, User, Globe } from '@lucide/vue'
import { ref } from 'vue'
import { useThemeStore } from '../stores/theme'
import { useRouter, useRoute } from 'vue-router'

const themeStore = useThemeStore()
const router = useRouter()
const route = useRoute()

const menuItems = [
  { icon: MessageCircle, route: '/', label: '对话' },
  { icon: Brain, route: '/info', label: '信息' },
  { icon: BookOpen, route: '/learning', label: '学习' },
  { icon: BarChart3, route: '/monitor', label: '监控' },
  { icon: Settings, route: '/config', label: '配置' },
]

// i18n 语言切换
const languages = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en-US', label: 'English' },
]
const currentLang = ref(localStorage.getItem('brian-lang') || 'zh-CN')
const showLangMenu = ref(false)

function selectLang(code: string) {
  currentLang.value = code
  localStorage.setItem('brian-lang', code)
  showLangMenu.value = false
  // 实际国际化需要 vue-i18n，这里仅切换 localStorage 标记
  console.log('[i18n] Language switched to:', code)
}

function isActive(menuRoute: string): boolean {
  return route.path === menuRoute
}

function handleThemeToggle() {
  themeStore.toggleTheme()
}
</script>

<template>
  <header class="fixed top-0 left-0 right-0 z-50 px-5 h-12 flex items-center justify-between">
    <!-- Logo -->
    <div class="flex items-center">
      <h1 class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 tracking-tight">
        Brian
      </h1>
    </div>

    <!-- 右侧功能区（从左到右：功能ICON区 -> 暗模式 -> i18n -> 分隔线 -> 用户画像） -->
    <div class="flex items-center gap-2">
      <!-- 功能 ICON 区（5项） -->
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

      <!-- 暗模式切换 -->
      <button
        class="icon-btn text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue dark:hover:text-brian-blue transition-colors"
        :title="themeStore.isDark ? '切换到浅色模式' : '切换到深色模式'"
        @click="handleThemeToggle"
      >
        <Sun v-if="themeStore.isDark" :size="22" />
        <Moon v-else :size="22" />
      </button>

      <!-- i18n 语言选择 -->
      <div class="relative">
        <button
          class="icon-btn text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue dark:hover:text-brian-blue transition-colors"
          :title="`语言: ${currentLang}`"
          @click="showLangMenu = !showLangMenu"
        >
          <Globe :size="22" />
        </button>
        <div
          v-if="showLangMenu"
          class="absolute right-0 top-full mt-1 bg-white dark:bg-apple-gray-800 rounded-lg shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 py-1 min-w-[120px]"
        >
          <button
            v-for="lang in languages"
            :key="lang.code"
            :class="[
              'w-full text-left px-4 py-2 text-sm transition-colors',
              currentLang === lang.code
                ? 'text-brian-blue bg-brian-blue/5'
                : 'text-apple-gray-700 dark:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'
            ]"
            @click="selectLang(lang.code)"
          >
            {{ lang.label }}
          </button>
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="w-px h-6 bg-apple-gray-200 dark:bg-apple-gray-700 mx-2" />

      <!-- 用户画像 -->
      <button class="icon-btn text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue dark:hover:text-brian-blue transition-colors" title="用户画像" @click="router.push('/profile')">
        <User :size="22" />
      </button>
    </div>
  </header>
</template>
