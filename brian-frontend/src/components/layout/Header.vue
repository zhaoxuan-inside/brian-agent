<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useI18nStore } from '@/stores/i18n'
import { useAuthStore } from '@/stores/auth'
import { MessageCircle, Brain, BookOpen, BarChart3, Settings, Sun, Moon, Globe, User, Lock } from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()
const i18nStore = useI18nStore()
const authStore = useAuthStore()

const navItems = [
  { icon: MessageCircle, route: '/', name: i18nStore.t('nav.chat') },
  { icon: Brain, route: '/info', name: i18nStore.t('nav.info') },
  { icon: BookOpen, route: '/learning', name: i18nStore.t('nav.learning') },
  { icon: BarChart3, route: '/monitor', name: i18nStore.t('nav.monitor') },
  { icon: Settings, route: '/config', name: i18nStore.t('nav.config') },
]

const currentRoute = computed(() => route.path)

function navigate(routePath: string) {
  router.push(routePath)
}
</script>

<template>
  <header class="fixed top-0 left-0 right-0 h-14 z-50 glass-panel border-b flex items-center justify-between px-4 select-none">
    <div class="flex items-center">
      <button class="text-xl font-bold text-brian-blue mr-6" @click="navigate('/')">
        Brian
      </button>
    </div>

    <div class="flex items-center gap-1">
      <button
        v-for="item in navItems"
        :key="item.route"
        class="icon-btn relative group"
        :class="{ 'text-brian-blue': currentRoute === item.route }"
        :title="item.name"
        @click="navigate(item.route)"
      >
        <component :is="item.icon" :size="18" />
        <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full transition-all"
          :class="currentRoute === item.route ? 'bg-brian-blue scale-100' : 'bg-transparent scale-0 group-hover:bg-apple-gray-300 group-hover:scale-100'" />
      </button>

      <div class="w-px h-5 bg-apple-gray-200 dark:bg-apple-gray-700 mx-2" />

      <!-- Theme Toggle -->
      <button class="icon-btn" :title="themeStore.isDark ? '浅色模式' : '深色模式'" @click="themeStore.toggleTheme()">
        <Sun v-if="themeStore.isDark" :size="18" />
        <Moon v-else :size="18" />
      </button>

      <!-- i18n -->
      <button
        class="icon-btn"
        :title="i18nStore.locale === 'zh-CN' ? 'English' : '中文'"
        @click="i18nStore.setLocale(i18nStore.locale === 'zh-CN' ? 'en-US' : 'zh-CN')"
      >
        <Globe :size="18" />
      </button>

      <div class="w-px h-5 bg-apple-gray-200 dark:bg-apple-gray-700 mx-2" />

      <!-- User / Lock -->
      <button class="icon-btn" title="锁定" @click="authStore.lock()">
        <Lock :size="16" />
      </button>
      <button class="icon-btn" title="用户">
        <User :size="18" />
      </button>
    </div>
  </header>
</template>
