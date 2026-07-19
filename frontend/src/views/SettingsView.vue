<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { 
  Shield, Settings, Info, Monitor, Database, Activity
} from '@lucide/vue'
import NeuralBackground from '../components/NeuralBackground.vue'
import Header from '../components/Header.vue'

const activeTab = ref<'general' | 'security' | 'about'>('general')

onMounted(() => {
})

const tabs = [
  { id: 'general' as const, label: '通用设置', icon: Settings },
  { id: 'security' as const, label: '安全与授权', icon: Shield },
  { id: 'about' as const, label: '关于', icon: Info },
]

const detectedOS = computed(() => {
  const ua = navigator.platform || navigator.userAgent
  if (/win/i.test(ua)) return 'windows'
  if (/mac/i.test(ua)) return 'macos'
  return 'linux'
})

const osLabel = computed(() => {
  switch (detectedOS.value) {
    case 'windows': return 'Windows'
    case 'macos': return 'macOS'
    default: return 'Linux'
  }
})

const safeCommands = computed(() => {
  if (detectedOS.value === 'windows') return ['dir', 'type', 'echo', 'date', 'whoami', 'findstr', 'cd']
  return ['ls', 'cat', 'head', 'tail', 'grep', 'find', 'pwd', 'echo', 'date', 'whoami', 'df', 'du', 'wc', 'sort', 'uniq']
})

const warnCommands = computed(() => {
  if (detectedOS.value === 'windows') return ['copy', 'move', 'mkdir', 'npm', 'pip', 'git', 'curl']
  return ['cp', 'mv', 'mkdir', 'touch', 'chmod', 'chown', 'npm', 'pip', 'git', 'docker', 'curl', 'wget', 'kill']
})

const dangerCommands = computed(() => {
  if (detectedOS.value === 'windows') return ['del', 'rmdir', 'format', 'shutdown', 'regedit']
  return ['rm', 'rmdir', 'dd', 'mkfs', 'shutdown', 'reboot', 'sudo', 'su', 'iptables']
})

const editingDataDir = ref(false)
const dataDirInput = ref('')

function startEditDataDir() {
  dataDirInput.value = './data'
  editingDataDir.value = true
}

async function handleMigrate() {
  try {
    await fetch('/api/config/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: './data', newPath: dataDirInput.value, type: 'dataDir' }),
    })
  } catch { /* ignore */ }
  editingDataDir.value = false
}

</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative">
    <NeuralBackground />
    <Header />
    <div class="pt-16 h-full relative z-10 flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-white/80 dark:bg-apple-gray-950/80 backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-brian-blue/10 rounded-lg"><Settings :size="20" class="text-brian-blue" /></div>
          <div>
            <h1 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">设置</h1>
            <p class="text-xs text-apple-gray-400">系统配置</p>
          </div>
        </div>
      </div>

    <div class="flex-1 flex">
      <div class="w-64 flex-shrink-0 border-r border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-950 py-4">
        <nav class="space-y-1 px-3">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            :class="[
              'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.id 
                ? 'bg-brian-blue/10 text-brian-blue' 
                : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
            ]"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" :size="18" />
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <div class="flex-1 overflow-y-auto scrollbar-hide">
        <div v-if="activeTab === 'general'" class="p-6 space-y-6">
          <div>
            <div class="flex items-center gap-3 mb-4">
              <Database :size="20" class="text-apple-gray-400" />
              <h2 class="text-base font-semibold">数据路径</h2>
            </div>
            <div class="glass-panel rounded-xl p-5 space-y-4">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm text-apple-gray-500">数据目录</span>
                  <button class="text-sm text-brian-blue hover:underline" @click="startEditDataDir()">编辑</button>
                </div>
                <div v-if="!editingDataDir" class="text-base font-mono text-apple-gray-700 dark:text-apple-gray-300">./data</div>
                <div v-else class="flex items-center gap-3">
                  <input v-model="dataDirInput" class="flex-1 px-4 py-2.5 text-sm rounded bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
                  <button class="px-4 py-2.5 text-sm font-medium bg-brian-blue text-white rounded-lg" @click="handleMigrate">迁移</button>
                  <button class="px-4 py-2.5 text-sm font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg" @click="editingDataDir = false">取消</button>
                </div>
              </div>

              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <Database :size="14" class="text-apple-gray-400" />
                  <span class="text-sm text-apple-gray-500">DB 路径</span>
                </div>
                <span class="text-sm font-mono text-apple-gray-400">./data/db.sqlite</span>
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <Activity :size="14" class="text-apple-gray-400" />
                  <span class="text-sm text-apple-gray-500">Vector DB 路径</span>
                </div>
                <span class="text-sm font-mono text-apple-gray-400">./data/vectors</span>
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <Activity :size="14" class="text-apple-gray-400" />
                  <span class="text-sm text-apple-gray-500">Graph DB 路径</span>
                </div>
                <span class="text-sm font-mono text-apple-gray-400">./data/graph</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'security'" class="p-6 space-y-5">
          <div class="glass-panel rounded-xl p-5 flex items-center gap-4">
            <div class="p-3 bg-brian-blue/10 rounded-lg"><Monitor :size="20" class="text-brian-blue" /></div>
            <div>
              <p class="text-base font-medium text-apple-gray-900 dark:text-apple-gray-50">检测到操作系统：{{ osLabel }}</p>
              <p class="text-sm text-apple-gray-400">命令策略已基于 {{ osLabel }} 自动适配</p>
            </div>
          </div>

          <div class="glass-panel rounded-xl p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-3 h-3 rounded-full bg-success-green" />
              <h2 class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-50">安全命令（自动执行）</h2>
            </div>
            <div class="flex flex-wrap gap-2">
              <span v-for="cmd in safeCommands" :key="cmd"
                class="text-sm px-3 py-1.5 rounded-md bg-success-green/10 text-success-green border border-success-green/20 font-mono">{{ cmd }}</span>
            </div>
          </div>

          <div class="glass-panel rounded-xl p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-3 h-3 rounded-full bg-warning-orange" />
              <h2 class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-50">需授权命令（确认后执行）</h2>
            </div>
            <div class="flex flex-wrap gap-2">
              <span v-for="cmd in warnCommands" :key="cmd"
                class="text-sm px-3 py-1.5 rounded-md bg-warning-orange/10 text-warning-orange border border-warning-orange/20 font-mono">{{ cmd }}</span>
            </div>
          </div>

          <div class="glass-panel rounded-xl p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-3 h-3 rounded-full bg-error-red" />
              <h2 class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-50">危险命令（确认+回滚）</h2>
            </div>
            <div class="flex flex-wrap gap-2">
              <span v-for="cmd in dangerCommands" :key="cmd"
                class="text-sm px-3 py-1.5 rounded-md bg-error-red/10 text-error-red border border-error-red/20 font-mono">{{ cmd }}</span>
            </div>
          </div>

          <div class="text-sm text-apple-gray-400 text-center py-3">
            策略基于操作系统自动适配。您可以在对话中随时调整授权级别。
          </div>
        </div>

        <div v-if="activeTab === 'about'" class="p-6">
          <div class="glass-panel rounded-xl p-8 text-center">
            <div class="p-4 bg-brian-blue/10 rounded-full inline-flex mb-5"><Settings :size="32" class="text-brian-blue" /></div>
            <h2 class="text-xl font-bold">Brian Agent</h2>
            <p class="text-base text-apple-gray-400 mt-2">v1.0.0-beta</p>
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>