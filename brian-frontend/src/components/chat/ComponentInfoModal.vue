<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X, Loader2, FileText, Sparkles, Cpu, Wrench, Layers } from '@lucide/vue'
import { configApi, skillApi } from '@/api'

type ComponentKind = 'prompt' | 'soul' | 'llm' | 'skill' | 'mcp'

const props = defineProps<{
  kind: ComponentKind
  refId: string
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const loading = ref(false)
const error = ref('')
const record = ref<Record<string, unknown> | null>(null)

const KIND_META: Record<ComponentKind, { label: string; icon: unknown }> = {
  prompt: { label: 'Prompt 提示词模板', icon: FileText },
  soul: { label: 'Soul 人格', icon: Sparkles },
  llm: { label: 'LLM 模型', icon: Cpu },
  skill: { label: 'Skill 技能', icon: Wrench },
  mcp: { label: 'MCP 服务', icon: Layers },
}

const FRIENDLY_FIELDS: Record<ComponentKind, string[]> = {
  prompt: ['title', 'brief', 'enabled', 'template'],
  soul: ['name', 'description', 'traits', 'enabled', 'enabled_scope'],
  llm: ['modelName', 'model_name', 'providerName', 'provider_name', 'baseURL', 'base_url', 'maxTokens', 'max_tokens', 'isDefault', 'is_default', 'enable'],
  skill: ['name', 'brief', 'description', 'enabled', 'prompt_template_id', 'reg_rate', 'similarity_threshold'],
  mcp: ['id', 'title', 'mcp_provider_title', 'brief', 'mcp_provider_brief', 'server_name', 'url', 'mcp_provider_url', 'config', 'enabled', 'enable', 'mcp_provider_id', 'install_id'],
}

const meta = computed(() => KIND_META[props.kind])

const friendlyRows = computed<Array<{ key: string; value: unknown }>>(() => {
  if (!record.value) return []
  return FRIENDLY_FIELDS[props.kind]
    .filter((k) => record.value![k] !== undefined && record.value![k] !== null && record.value![k] !== '')
    .map((k) => ({ key: k, value: record.value![k] }))
})

const jsonText = computed(() => {
  if (!record.value) return ''
  try { return JSON.stringify(record.value, null, 2) } catch { return String(record.value) }
})

function normalize(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      const t = value.trim()
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        return JSON.parse(t)
      }
    } catch { /* 保留原文 */ }
  }
  return value
}

function displayValue(v: unknown): string {
  const n = normalize(v)
  if (n === null || n === undefined) return ''
  if (typeof n === 'string') return n
  try { return JSON.stringify(n, null, 2) } catch { return String(n) }
}

async function load() {
  loading.value = true
  error.value = ''
  record.value = null
  try {
    const id = props.refId
    if (props.kind === 'prompt') {
      record.value = (await configApi.prompts.get(id)) as unknown as Record<string, unknown>
    } else if (props.kind === 'soul') {
      const list = await configApi.soul.list()
      const found = (list as Array<Record<string, unknown>>).find((s) => String(s.id) === id || String(s.name) === id)
      record.value = found ? { ...found } : { id, notFound: true }
    } else if (props.kind === 'llm') {
      const list = await configApi.model.list()
      const found = (list as unknown as Array<Record<string, unknown>>).find((m) => String(m.id) === id || String(m.modelName) === id || String(m.model_name) === id)
      record.value = found ? { ...found } : { id, notFound: true }
    } else if (props.kind === 'skill') {
      const data = (await skillApi.get(id)) as Record<string, unknown> | undefined
      record.value = data && Object.keys(data).length > 0 ? { ...data } : { id, notFound: true }
    } else {
      const list = await configApi.mcp.list()
      const found = (list as Array<Record<string, unknown>>).find((m) => String(m.id) === id || String(m.install_id) === id || String(m.title) === id || String(m.server_name) === id || String(m.mcp_provider_title) === id)
      record.value = found ? { ...found } : { id, notFound: true }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => [props.kind, props.refId] as const, () => { load() }, { immediate: true })

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

import { onMounted, onBeforeUnmount } from 'vue'
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-modal-top flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 theme-chat"
      @click.self="emit('close')"
    >
      <div class="bg-chat-surface-1 rounded-chat-lg shadow-[0_24px_64px_rgba(0,0,0,0.55)] border border-chat-hairline-strong w-full max-w-xl overflow-hidden flex flex-col max-h-[80vh]">
        <div class="px-5 py-3.5 border-b border-chat-hairline flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-7 h-7 rounded-full bg-chat-primary/15 text-chat-primary-hover flex items-center justify-center flex-shrink-0">
              <component :is="meta.icon" :size="15" />
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-semibold tracking-tight text-chat-ink">{{ meta.label }}</h3>
              <p class="text-2xs text-chat-ink-tertiary font-mono truncate">{{ refId }}</p>
            </div>
          </div>
          <button class="p-1.5 rounded-chat-md text-chat-ink-tertiary hover:text-chat-ink hover:bg-chat-surface-2 transition-colors flex-shrink-0" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <div class="px-5 py-4 overflow-y-auto space-y-4">
          <div v-if="loading" class="flex flex-col items-center justify-center py-10 space-y-2">
            <Loader2 :size="20" class="animate-spin text-chat-primary-hover" />
            <p class="text-xs text-chat-ink-tertiary">正在加载组件信息…</p>
          </div>

          <div v-else-if="error" class="rounded-chat-md bg-chat-error/10 text-chat-error text-xs px-3 py-2.5">{{ error }}</div>

          <template v-else-if="record">
            <div v-if="record.notFound" class="rounded-chat-md bg-chat-surface-2 text-chat-ink-subtle text-xs px-3 py-2.5">
              未找到该组件（可能是已删除的内置/历史组件），以下为原始引用：
            </div>

            <div v-if="friendlyRows.length" class="space-y-2">
              <div
                v-for="row in friendlyRows"
                :key="row.key"
                class="rounded-chat-md border border-chat-hairline overflow-hidden"
              >
                <p class="px-3 py-1.5 text-4xs font-medium text-chat-ink-tertiary bg-chat-surface-2 border-b border-chat-hairline font-mono">{{ row.key }}</p>
                <pre class="px-3 py-2 text-2xs leading-relaxed whitespace-pre-wrap break-all max-h-48 overflow-y-auto text-chat-ink-muted bg-chat-canvas">{{ displayValue(row.value) }}</pre>
              </div>
            </div>

            <details v-if="jsonText" class="text-2xs text-chat-ink-subtle">
              <summary class="cursor-pointer hover:underline text-chat-ink-muted font-medium">完整数据</summary>
              <pre class="mt-1 p-2.5 rounded-chat-sm bg-chat-canvas border border-chat-hairline overflow-x-auto text-4xs leading-relaxed max-h-56 overflow-y-auto">{{ jsonText }}</pre>
            </details>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
