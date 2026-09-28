<script setup lang="ts">
import { useI18nStore } from '@/stores/i18n'
const i18nStore = useI18nStore()
import { ref } from 'vue'
import { Fingerprint, Braces, FileCode, Regex, Copy, CheckCircle2, XCircle, Loader2 } from '@lucide/vue'
import { toolApi } from '@/api'
import type { ToolCheckResult, ToolTransformResult, ToolRegexResult } from '@/api'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'

type TabKey = 'id' | 'json' | 'xml' | 'regex'

const activeTab = ref<TabKey>('id')
import { copyToClipboard } from '@/utils/clipboard'

const tabs = [
  { key: 'id' as const, label: 'ID 生成', icon: Fingerprint },
  { key: 'json' as const, label: 'JSON', icon: Braces },
  { key: 'xml' as const, label: 'XML', icon: FileCode },
  { key: 'regex' as const, label: '正则', icon: Regex },
]

async function copyText(text: string) {
  if (!text) return
  await copyToClipboard(text)
}

const idCount = ref(1)
const idList = ref<string[]>([])

async function generateIds() {
  const count = Math.max(1, Math.min(Number(idCount.value) || 1, 1000))
  try {
    const res = await toolApi.generateId(count)
    idList.value = res.ids || []
  } catch (e) {
    console.error('[ToolView] 生成 ID 失败', e)
    idList.value = []
  }
}

const jsonText = ref('')
const jsonIndent = ref(2)
const jsonOutput = ref('')
const jsonState = ref<'idle' | 'ok' | 'error'>('idle')
const jsonMessage = ref('')

function setJsonResult(out: ToolCheckResult | ToolTransformResult | null, outputText = '') {
  if (!out) { jsonState.value = 'idle'; return }
  if (out.valid) {
    jsonState.value = 'ok'
    jsonMessage.value = outputText || ''
    jsonOutput.value = outputText
  } else {
    jsonState.value = 'error'
    jsonMessage.value = out.error || '处理失败'
    jsonOutput.value = ''
  }
}

async function jsonCheck() {
  try {
    setJsonResult(await toolApi.jsonCheck(jsonText.value))
  } catch (e) {
    setJsonResult({ valid: false, error: e instanceof Error ? e.message : '请求失败' })
  }
}
async function jsonFormat() {
  try {
    const out = await toolApi.jsonFormat(jsonText.value, Number(jsonIndent.value) || 2)
    setJsonResult(out, (out as ToolTransformResult).result || '')
  } catch (e) {
    setJsonResult({ valid: false, error: e instanceof Error ? e.message : '请求失败' })
  }
}
async function jsonMinify() {
  try {
    const out = await toolApi.jsonMinify(jsonText.value)
    setJsonResult(out, (out as ToolTransformResult).result || '')
  } catch (e) {
    setJsonResult({ valid: false, error: e instanceof Error ? e.message : '请求失败' })
  }
}

const xmlText = ref('')
const xmlIndent = ref(2)
const xmlOutput = ref('')
const xmlState = ref<'idle' | 'ok' | 'error'>('idle')
const xmlMessage = ref('')

function setXmlResult(out: ToolCheckResult | ToolTransformResult | null, outputText = '') {
  if (!out) { xmlState.value = 'idle'; return }
  if (out.valid) {
    xmlState.value = 'ok'
    xmlMessage.value = outputText || ''
    xmlOutput.value = outputText
  } else {
    xmlState.value = 'error'
    xmlMessage.value = out.error || '处理失败'
    xmlOutput.value = ''
  }
}

async function xmlCheck() {
  try {
    setXmlResult(await toolApi.xmlCheck(xmlText.value))
  } catch (e) {
    setXmlResult({ valid: false, error: e instanceof Error ? e.message : '请求失败' })
  }
}
async function xmlFormat() {
  try {
    const out = await toolApi.xmlFormat(xmlText.value, Number(xmlIndent.value) || 2)
    setXmlResult(out, (out as ToolTransformResult).result || '')
  } catch (e) {
    setXmlResult({ valid: false, error: e instanceof Error ? e.message : '请求失败' })
  }
}
async function xmlMinify() {
  try {
    const out = await toolApi.xmlMinify(xmlText.value)
    setXmlResult(out, (out as ToolTransformResult).result || '')
  } catch (e) {
    setXmlResult({ valid: false, error: e instanceof Error ? e.message : '请求失败' })
  }
}

const regexPattern = ref('')
const regexFlags = ref('')
const regexText = ref('')
const regexResult = ref<ToolRegexResult | null>(null)
const regexLoading = ref(false)

async function runRegex() {
  regexLoading.value = true
  try {
    regexResult.value = await toolApi.regex(regexPattern.value, regexText.value, regexFlags.value)
  } catch {
    regexResult.value = { valid: false, error: '请求失败', matched: false, matches: [], count: 0 }
  } finally {
    regexLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-14 relative z-10">
      <div class="sticky top-14 z-30 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <div class="h-10 flex items-center px-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <PageBreadcrumb :path="[i18nStore.t('nav.tool')]" />
        </div>
        <div class="px-6">
          <div class="flex items-center gap-1 mt-3 mb-4 border-b border-apple-gray-200 dark:border-apple-gray-700 pb-2">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              :class="[
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.key ? 'bg-brian-blue text-white' : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
              ]"
              @click="activeTab = tab.key"
            >
              <component :is="tab.icon" :size="15" />
              {{ tab.label }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'id'" class="max-w-3xl space-y-4">
        <div class="block-card rounded-xl p-6">
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <Fingerprint :size="20" class="text-brian-blue" /> UUID 生成器
          </h3>
          <p class="text-xs text-apple-gray-400 mt-1">生成 UUID v4 全局唯一标识符</p>
          <div class="flex items-center gap-3 mt-4">
            <label class="text-sm text-apple-gray-500">数量</label>
            <input v-model.number="idCount" type="number" min="1" max="1000"
              class="w-28 px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            <button class="btn-primary" @click="generateIds">生成</button>
          </div>
        </div>
        <div v-if="idList.length" class="block-card rounded-xl p-4 space-y-2">
          <div v-for="id in idList" :key="id" class="flex items-center justify-between gap-3 p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
            <code class="text-sm font-mono break-all">{{ id }}</code>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 flex-shrink-0" title="复制" @click="copyText(id)">
              <Copy :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'json'" class="space-y-4">
        <div class="block-card rounded-xl p-6">
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <Braces :size="20" class="text-brian-blue" /> JSON 工具
          </h3>
          <div class="flex items-center gap-4 mt-4 mb-2">
            <label class="text-sm text-apple-gray-500">缩进</label>
            <select v-model.number="jsonIndent" class="px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue">
              <option :value="2">2 空格</option>
              <option :value="4">4 空格</option>
            </select>
            <div class="flex items-center gap-2 ml-auto">
              <button class="btn-secondary" @click="jsonCheck">检查</button>
              <button class="btn-secondary" @click="jsonFormat">格式化</button>
              <button class="btn-secondary" @click="jsonMinify">压缩</button>
            </div>
          </div>
          <textarea v-model="jsonText" rows="8" placeholder='{"key": "value"}' class="w-full px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brian-blue resize-y" />
          <div v-if="jsonState !== 'idle'" class="mt-3">
            <div v-if="jsonState === 'ok'" class="flex items-center gap-2 text-sm text-success-green mb-2">
              <CheckCircle2 :size="16" /> 处理成功
            </div>
            <div v-else class="flex items-center gap-2 text-sm text-error-red mb-2">
              <XCircle :size="16" /> {{ jsonMessage }}
            </div>
            <div v-if="jsonState === 'ok' && jsonOutput" class="relative">
              <button class="absolute top-2 right-2 p-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 hover:text-brian-blue" title="复制" @click="copyText(jsonOutput)">
                <Copy :size="14" />
              </button>
              <pre class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700 text-sm font-mono whitespace-pre-wrap break-all max-h-96 overflow-y-auto">{{ jsonOutput }}</pre>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'xml'" class="space-y-4">
        <div class="block-card rounded-xl p-6">
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <FileCode :size="20" class="text-brian-blue" /> XML 工具
          </h3>
          <div class="flex items-center gap-4 mt-4 mb-2">
            <label class="text-sm text-apple-gray-500">缩进</label>
            <select v-model.number="xmlIndent" class="px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue">
              <option :value="2">2 空格</option>
              <option :value="4">4 空格</option>
            </select>
            <div class="flex items-center gap-2 ml-auto">
              <button class="btn-secondary" @click="xmlCheck">检查</button>
              <button class="btn-secondary" @click="xmlFormat">格式化</button>
              <button class="btn-secondary" @click="xmlMinify">压缩</button>
            </div>
          </div>
          <textarea v-model="xmlText" rows="8" placeholder="<root><a>1</a></root>" class="w-full px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brian-blue resize-y" />
          <div v-if="xmlState !== 'idle'" class="mt-3">
            <div v-if="xmlState === 'ok'" class="flex items-center gap-2 text-sm text-success-green mb-2">
              <CheckCircle2 :size="16" /> 处理成功
            </div>
            <div v-else class="flex items-center gap-2 text-sm text-error-red mb-2">
              <XCircle :size="16" /> {{ xmlMessage }}
            </div>
            <div v-if="xmlState === 'ok' && xmlOutput" class="relative">
              <button class="absolute top-2 right-2 p-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 hover:text-brian-blue" title="复制" @click="copyText(xmlOutput)">
                <Copy :size="14" />
              </button>
              <pre class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700 text-sm font-mono whitespace-pre-wrap break-all max-h-96 overflow-y-auto">{{ xmlOutput }}</pre>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'regex'" class="space-y-4">
        <div class="block-card rounded-xl p-6">
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <Regex :size="20" class="text-brian-blue" /> 正则表达式匹配
          </h3>
          <div class="flex gap-3 mt-4 mb-2">
            <input v-model="regexPattern" placeholder="正则表达式，如 \d+" class="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            <input v-model="regexFlags" placeholder="标志 g/i/m/s" class="w-32 px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            <button class="btn-primary flex items-center gap-1.5" :disabled="regexLoading" @click="runRegex">
              <Loader2 v-if="regexLoading" :size="14" class="animate-spin" />
              <Regex v-else :size="14" />
              匹配
            </button>
          </div>
          <textarea v-model="regexText" rows="6" placeholder="待匹配文本" class="w-full px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brian-blue resize-y" />

          <div v-if="regexResult" class="mt-3">
            <div v-if="!regexResult.valid" class="flex items-center gap-2 text-sm text-error-red mb-2">
              <XCircle :size="16" /> {{ regexResult.error }}
            </div>
            <div v-else class="space-y-2">
              <div class="flex items-center gap-3 text-sm">
                <span :class="regexResult.matched ? 'text-success-green' : 'text-apple-gray-400'" class="flex items-center gap-1">
                  <component :is="regexResult.matched ? CheckCircle2 : XCircle" :size="15" />
                  {{ regexResult.matched ? '匹配成功' : '无匹配' }}
                </span>
                <span class="text-apple-gray-400">匹配次数: {{ regexResult.count }}</span>
              </div>
              <div v-if="regexResult.matches.length" class="space-y-1">
                <div v-for="(m, i) in regexResult.matches" :key="i" class="p-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700 text-sm font-mono break-all">{{ m }}</div>
              </div>
              <div v-if="regexResult.groups && regexResult.groups.length" class="p-3 rounded-lg bg-brian-blue/5 border border-brian-blue/20">
                <p class="text-xs text-apple-gray-400 mb-1">捕获组</p>
                <pre class="text-sm font-mono break-all">{{ JSON.stringify(regexResult.groups, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
