<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useI18nStore } from '@/stores/i18n'
import { useAuthStore } from '@/stores/auth'
import { Home, MessageCircle, Brain, BookOpen, BarChart3, Settings, Sun, Moon, Globe, User, Lock, Wrench, Clock } from '@lucide/vue'

/**
 * variant='glass' 为全局默认(iOS 玻璃);variant='chat' 仅对话页挂载
 * Linear 顶栏(DESIGN.md top-nav:canvas 底 + hairline 下缘,ADR-015)。
 */
const props = withDefaults(defineProps<{
  variant?: 'glass' | 'chat'
}>(), {
  variant: 'glass',
})

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()
const i18nStore = useI18nStore()
const authStore = useAuthStore()

const isChat = computed(() => props.variant === 'chat')

const themeLabel = computed(() => (themeStore.isDark ? i18nStore.t('header.toLight') : i18nStore.t('header.toDark')))
const langLabel = computed(() => (i18nStore.locale === 'zh-CN' ? i18nStore.t('header.toEnglish') : i18nStore.t('header.toChinese')))

const navItems = computed(() => [
  { icon: Home, route: '/', name: i18nStore.t('nav.home') },
  { icon: MessageCircle, route: '/chat', name: i18nStore.t('nav.chat') },
  { icon: Brain, route: '/info', name: i18nStore.t('nav.info') },
  { icon: BookOpen, route: '/learning', name: i18nStore.t('nav.learning') },
  { icon: BarChart3, route: '/monitor', name: i18nStore.t('nav.monitor') },
  { icon: Clock, route: '/cron', name: i18nStore.t('nav.cron') },
  { icon: Settings, route: '/config', name: i18nStore.t('nav.config') },
  { icon: Wrench, route: '/tool', name: i18nStore.t('nav.tool') },
])

const currentRoute = computed(() => route.path)

function navigate(routePath: string) {
  router.push(routePath)
}
</script>

<template>
  <header
    class="fixed top-0 left-0 right-0 h-14 z-50 border-b flex items-center justify-between px-2 sm:px-4 select-none"
    :class="isChat ? 'bg-chat-canvas border-chat-hairline' : 'glass-panel'"
  >
    <div class="flex items-center">
      <button
        class="text-xl font-chat-display mr-6 tracking-tight"
        :class="isChat ? 'text-chat-primary' : 'text-brian-blue'"
        @click="navigate('/')"
      >
        Brian
      </button>
    </div>

    <div class="flex items-center gap-0.5 sm:gap-1 max-w-[60vw] overflow-x-auto scrollbar-hide">
      <button
        v-for="item in navItems"
        :key="item.route"
        class="p-2 rounded-lg transition-colors relative group"
        :class="isChat
          ? (currentRoute === item.route
              ? 'text-chat-ink bg-chat-surface-2'
              : 'text-chat-ink-subtle hover:text-chat-ink hover:bg-chat-surface-1')
          : ['icon-btn', currentRoute === item.route ? 'text-brian-blue' : '']"
        :title="item.name"
        :aria-label="item.name"
        @click="navigate(item.route)"
      >
        <component :is="item.icon" :size="18" />
        <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full transition-all"
          :class="currentRoute === item.route
            ? (isChat ? 'bg-chat-primary scale-100' : 'bg-brian-blue scale-100')
            : (isChat ? 'bg-transparent scale-0 group-hover:bg-chat-hairline-tertiary group-hover:scale-100' : 'bg-transparent scale-0 group-hover:bg-apple-gray-300 group-hover:scale-100')" />
      </button>

      <div class="w-px h-5 mx-2" :class="isChat ? 'bg-chat-hairline' : 'bg-apple-gray-200 dark:bg-apple-gray-700'" />

      <button
        class="p-2 rounded-lg transition-colors"
        :class="isChat ? 'text-chat-ink-subtle hover:text-chat-ink hover:bg-chat-surface-1' : 'icon-btn'"
        :title="themeLabel" :aria-label="themeLabel"
        @click="themeStore.toggleTheme()"
      >
        <Sun v-if="themeStore.isDark" :size="18" />
        <Moon v-else :size="18" />
      </button>

      <button
        class="p-2 rounded-lg transition-colors"
        :class="isChat ? 'text-chat-ink-subtle hover:text-chat-ink hover:bg-chat-surface-1' : 'icon-btn'"
        :title="langLabel" :aria-label="langLabel"
        @click="i18nStore.setLocale(i18nStore.locale === 'zh-CN' ? 'en-US' : 'zh-CN')"
      >
        <Globe :size="18" />
      </button>

      <div class="w-px h-5 mx-2" :class="isChat ? 'bg-chat-hairline' : 'bg-apple-gray-200 dark:bg-apple-gray-700'" />

      <button
        class="p-2 rounded-lg transition-colors"
        :class="isChat ? 'text-chat-ink-subtle hover:text-chat-ink hover:bg-chat-surface-1' : 'icon-btn'"
        :title="i18nStore.t('header.lock')" :aria-label="i18nStore.t('header.lock')"
        @click="authStore.lock()"
      >
        <Lock :size="16" />
      </button>
    </div>
  </header>
</template>
