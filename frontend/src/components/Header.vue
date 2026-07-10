<script setup lang="ts">
import { Brain, Library, Settings, Sun, Moon, User, Activity, Layers, Puzzle, Wand2, Server } from '@lucide/vue'
import { useThemeStore } from '../stores/theme'
import { usePanelStore, type PanelType } from '../stores/panel'

const themeStore = useThemeStore()
const panelStore = usePanelStore()

const menuItems = [
  { icon: Brain, panel: 'memory' as PanelType, label: '记忆' },
  { icon: Library, panel: 'library' as PanelType, label: '资料库' },
  { icon: Activity, panel: 'monitor' as PanelType, label: '监控' },
  { icon: Layers, panel: 'soul' as PanelType, label: 'Soul' },
  { icon: Puzzle, panel: 'work' as PanelType, label: 'Work' },
  { icon: Wand2, panel: 'skill' as PanelType, label: 'Skill' },
  { icon: Server, panel: 'mcp' as PanelType, label: 'MCP' },
  { icon: Settings, panel: 'settings' as PanelType, label: '设置' },
]

function handleMenuClick(panel: PanelType) {
  panelStore.togglePanel(panel)
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
        :key="item.panel"
        class="icon-btn text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue dark:hover:text-brian-blue transition-colors"
        :title="item.label"
        @click="handleMenuClick(item.panel)"
      >
        <component :is="item.icon" :size="22" />
      </button>
      
      <button 
        class="icon-btn text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue dark:hover:text-brian-blue transition-colors"
        :title="themeStore.isDark ? '切换到浅色模式' : '切换到深色模式'"
        @click="themeStore.toggleTheme"
      >
        <Sun v-if="themeStore.isDark" :size="22" />
        <Moon v-else :size="22" />
      </button>
      
      <div class="w-px h-6 bg-apple-gray-200 dark:bg-apple-gray-700 mx-2" />
      
      <button class="icon-btn">
        <User :size="22" class="text-apple-gray-600 dark:text-apple-gray-400" />
      </button>
    </div>
  </header>
</template>
