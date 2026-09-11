<!--
===== ThinkingBlock.vue 组件 =====
展示 Agent 执行详情：
1. Agent 信息、思考方式标签 (CoT, ReACT)
2. Token 用量分别展示输入 Token 和输出 Token
3. Agent 发送给 LLM 的完整 Prompt
4. 模型的完整回复
5. 思考与步骤 (Think / Act / Reflect)
（移除 Canvas 图，保留 CoT / ReACT 思考方式标签）
-->
<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  ChevronRight,
  Loader2,
  Cpu,
  Brain,
  Wrench,
  CheckCircle2,
  XCircle,
  Layers,
  Sparkles,
  Database,
  Zap,
  Clock,
  Copy,
  Check,
  FileText,
  MessageSquare
} from '@lucide/vue'
import type { ThinkingBlock } from '@/api/types'
import { useChatUiStore } from '@/stores/chatUi'
import { copyToClipboard } from '@/utils/clipboard'
import { renderMarkdown } from '@/utils/markdown'
import { formatDuration } from '@/utils/format'
import { useNowTick } from '@/composables/useNowTick'

const props = withDefaults(
  defineProps<{
    block: ThinkingBlock
    // 是否隐藏本 Agent 的上下文区块（"思考过程"弹窗中上下文统一在顶部聚合展示，避免重复）
    hideContext?: boolean
    // 展开后的默认 Tab
    defaultTab?: 'io' | 'chain' | 'prompt'
    // 是否默认展开（"思考过程"弹窗中默认展开以直接展示 Prompt / 模型输出）
    startExpanded?: boolean
  }>(),
  {
    hideContext: true,
    defaultTab: 'io',
    startExpanded: false,
  },
)

const chatUi = useChatUiStore()
const isExpanded = ref(props.startExpanded)
const activeTab = ref<'io' | 'chain' | 'prompt'>(props.defaultTab)

const isStreaming = computed(() => props.block.meta.status === 'streaming')

// 每个 Agent 独立的"思考中"状态：优先取实时执行状态（agentExecutions），其次取 block 流式状态
const runtimeStatus = computed(() => {
  const id = props.block.agentInfo?.id
  if (id) {
    const rt = chatUi.agentExecutions[id]
    if (rt && rt.status) return rt.status
  }
  return isStreaming.value ? 'RUNNING' : 'SUCCESS'
})

const isThinking = computed(() => runtimeStatus.value === 'RUNNING')
const nowMs = useNowTick(isThinking)

const displayDurationMs = computed(() => {
  if (isThinking.value) {
    const id = props.block.agentInfo?.id
    const rt = id ? chatUi.agentExecutions[id] : undefined
    const start = rt?.startedAt || props.block.meta.createdAt
    return Math.max(0, nowMs.value - start)
  }
  return props.block.durationMs || 0
})

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '未执行', cls: 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-500 dark:text-apple-gray-300' },
  RUNNING: { label: '思考中', cls: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300' },
  SUCCESS: { label: '已完成', cls: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300' },
  ERROR: { label: '执行失败', cls: 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300' },
}

const agentTypeLabel = computed(() => {
  const type = (props.block.agentInfo?.type || 'WORKER').toUpperCase()
  switch (type) {
    case 'PLANNER': return '规划 Agent'
    case 'WRITER': return '表达 Agent'
    case 'EVOLUTOR': return '进化 Agent'
    case 'INTENT': return '需求 Agent'
    default: return '执行 Agent'
  }
})

// 思考方式标签 (CoT / ReACT 等)
const thinkingStrategy = computed(() => {
  if (props.block.thinkingStrategy) return props.block.thinkingStrategy
  if (props.block.steps && props.block.steps.some(s => s.phase === 'ACT' && s.toolCalls && s.toolCalls.length > 0)) {
    return 'ReACT'
  }
  return 'CoT'
})

// 分别计算与展示 输入 Token 和 输出 Token
const inputTokens = computed(() => props.block.inputTokens ?? 0)
const outputTokens = computed(() => props.block.outputTokens ?? 0)
const totalTokens = computed(() => {
  if (props.block.tokenUsage) return props.block.tokenUsage
  return inputTokens.value + outputTokens.value
})

// Agent 发送给 LLM 的完整 Prompt
const fullPrompt = computed(() => {
  if (props.block.prompt) return props.block.prompt
  if (typeof props.block.input === 'string') return props.block.input
  if (props.block.input) return JSON.stringify(props.block.input, null, 2)
  return props.block.content || ''
})

// 模型的完整回复
const fullRawResponse = computed(() => {
  if (props.block.rawResponse) return props.block.rawResponse
  if (typeof props.block.output === 'string') return props.block.output
  if (props.block.output) return JSON.stringify(props.block.output, null, 2)
  // 不回退到 block.content（可能是思考内容/用户输入），避免“模型的完整回复”误显示成用户输入
  return ''
})

// Markdown 格式化渲染模型的完整回复
const renderedRawResponseHtml = computed(() => renderMarkdown(fullRawResponse.value))

// ===== 修改后的代码：使用跨平台剪贴板工具函数 copyToClipboard =====
const copiedPrompt = ref(false)
async function copyPromptText() {
  const success = await copyToClipboard(fullPrompt.value)
  if (success) {
    copiedPrompt.value = true
    setTimeout(() => (copiedPrompt.value = false), 1800)
  }
}

const copiedResponse = ref(false)
async function copyResponseText() {
  const success = await copyToClipboard(fullRawResponse.value)
  if (success) {
    copiedResponse.value = true
    setTimeout(() => (copiedResponse.value = false), 1800)
  }
}

function formatJson(val: unknown): string {
  if (typeof val === 'string') return val
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

// 只渲染消息内容（不展示 info_id 等属性）
function msgContent(val: unknown): string {
  if (typeof val === 'string') return val
  if (val && typeof val === 'object' && 'content' in val) {
    const c = (val as { content?: unknown }).content
    return typeof c === 'string' ? c : ''
  }
  return ''
}
</script>

<template>
  <div class="py-1 select-text">
    <div class="block-card border-purple-200/80 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/20 rounded-xl overflow-hidden shadow-sm">
      <!-- Header 标题栏 -->
      <button
        class="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-purple-100/40 dark:hover:bg-purple-900/30 transition-colors"
        @click="isExpanded = !isExpanded"
        :aria-expanded="isExpanded"
      >
        <div class="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
          <ChevronRight
            :size="14"
            class="text-purple-500 flex-shrink-0 transition-transform duration-200"
            :class="{ 'rotate-90': isExpanded }"
          />
          <Brain :size="15" class="text-purple-600 dark:text-purple-400 flex-shrink-0" />
          
          <span class="text-xs font-semibold text-purple-900 dark:text-purple-200 truncate">
            {{ block.agentInfo?.name || 'Agent' }}
          </span>

          <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 flex-shrink-0">
            {{ agentTypeLabel }}
          </span>

          <!-- 思考方式标签 (CoT / ReACT) -->
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-200/80 dark:bg-purple-900/80 text-purple-800 dark:text-purple-200 flex-shrink-0 shadow-xs border border-purple-300/50 dark:border-purple-700/50">
            思考方式: {{ thinkingStrategy }}
          </span>

          <span v-if="block.agentInfo?.llmId" class="hidden md:inline-flex items-center gap-1 text-[10px] text-apple-gray-500 dark:text-apple-gray-400">
            <Cpu :size="11" />
            {{ block.agentInfo.llmId }}
          </span>

          <span class="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0" :class="STATUS_CHIP[runtimeStatus]?.cls">
            <Loader2 v-if="isThinking" :size="9" class="inline animate-spin mr-0.5 align-[-1px]" />
            {{ STATUS_CHIP[runtimeStatus]?.label || runtimeStatus }}
          </span>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0 text-[11px] text-apple-gray-500 dark:text-apple-gray-400">
          <!-- Token 用量分别展示：输入 Token / 输出 Token -->
          <span v-if="totalTokens > 0" class="inline-flex items-center gap-1 font-mono text-[10px] bg-purple-100/70 dark:bg-purple-900/40 px-2 py-0.5 rounded-md text-purple-800 dark:text-purple-200" title="Token 用量（输入 Token / 输出 Token）">
            <Zap :size="11" class="text-amber-500" />
            <span>输入: {{ inputTokens }}</span>
            <span class="text-purple-300 dark:text-purple-700">|</span>
            <span>输出: {{ outputTokens }}</span>
            <span class="text-purple-400 font-normal">({{ totalTokens }})</span>
          </span>
          <span v-if="displayDurationMs" class="inline-flex items-center gap-1" title="调用耗时">
            <Clock :size="11" /> {{ formatDuration(displayDurationMs, isThinking) }}
          </span>
        </div>
      </button>

      <!-- Expanded Detail 展开面板 -->
      <div v-if="isExpanded" class="border-t border-purple-100 dark:border-purple-900/40 bg-white/60 dark:bg-apple-gray-900/40 p-3.5 space-y-3">
        
        <!-- 上下文信息环境（若未显式隐藏） -->
        <div v-if="!hideContext" class="p-3 rounded-lg border border-purple-200/90 dark:border-purple-800/80 bg-gradient-to-r from-purple-50/80 to-blue-50/50 dark:from-purple-950/40 dark:to-blue-950/30 text-xs space-y-2">
          <div class="flex items-center justify-between font-bold text-purple-900 dark:text-purple-200 border-b pb-1">
            <div class="flex items-center gap-1.5">
              <Database :size="13" class="text-purple-600 dark:text-purple-400" />
              <span>运行与对话上下文环境 (Context)</span>
            </div>
            <span v-if="block.context?.strategy" class="text-[10px] font-normal px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
              策略: {{ block.context.strategy }}
            </span>
          </div>

          <div v-if="block.context?.citingMessages?.length" class="p-2 rounded bg-white/80 dark:bg-apple-gray-900/80 border border-purple-100 dark:border-purple-900/40">
            <span class="font-semibold text-purple-800 dark:text-purple-300 text-[11px]">引用的历史上下文消息:</span>
            <ul class="space-y-1 mt-1">
              <li v-for="(msg, mIdx) in block.context.citingMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-purple-50/40 dark:bg-purple-900/20 p-1.5 rounded">
                • {{ msgContent(msg) }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Sub-Header Badges (Soul, Skills, MCPs) -->
        <div class="flex items-center gap-2 flex-wrap text-[11px] pb-2 border-b border-apple-gray-100 dark:border-apple-gray-800">
          <div v-if="block.agentInfo?.soulId" class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50">
            <Sparkles :size="11" />
            <span>Soul: {{ block.agentInfo.soulId }}</span>
          </div>

          <div v-if="block.agentInfo?.skills?.length" class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/50">
            <Wrench :size="11" />
            <span>技能: {{ block.agentInfo.skills.join(', ') }}</span>
          </div>

          <div v-if="block.agentInfo?.mcps?.length" class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50">
            <Layers :size="11" />
            <span>MCP: {{ block.agentInfo.mcps.join(', ') }}</span>
          </div>
        </div>

        <!-- Navigation Tabs (Prompt 与完整回复 / 思考与步骤 / 任务输入输出) -->
        <div class="flex items-center gap-1 border-b border-apple-gray-100 dark:border-apple-gray-800 pb-1">
          <button
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
            :class="activeTab === 'io' ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200' : 'text-apple-gray-500 hover:text-purple-600'"
            @click="activeTab = 'io'"
          >
            <FileText :size="12" />
            完整 Prompt 与模型回复
          </button>

          <button
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
            :class="activeTab === 'chain' ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200' : 'text-apple-gray-500 hover:text-purple-600'"
            @click="activeTab = 'chain'"
          >
            <Brain :size="12" />
            思考与推导步骤 ({{ thinkingStrategy }})
          </button>
        </div>

        <!-- Tab 1: 完整 Prompt 与 模型完整回复 -->
        <div v-if="activeTab === 'io'" class="space-y-3 text-xs">
          <!-- 1. Agent 发送给 LLM 的完整 Prompt -->
          <div class="p-3 rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 space-y-1.5">
            <div class="flex items-center justify-between font-bold text-blue-900 dark:text-blue-200 text-xs border-b border-blue-200/50 dark:border-blue-900/40 pb-1.5">
              <div class="flex items-center gap-1.5">
                <FileText :size="13" class="text-blue-600 dark:text-blue-400" />
                <span>Agent 发送给 LLM 的完整 Prompt</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100/80 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                  PromptProvider 完整 Prompt
                </span>
              </div>
              <div class="flex items-center gap-2 font-normal text-[10px] text-blue-700 dark:text-blue-300">
                <span class="font-mono">输入 Token: {{ inputTokens }}</span>
                <button
                  class="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors text-blue-800 dark:text-blue-200 cursor-pointer"
                  @click="copyPromptText"
                >
                  <component :is="copiedPrompt ? Check : Copy" :size="11" />
                  <span>{{ copiedPrompt ? '已复制 Prompt' : '复制 Prompt' }}</span>
                </button>
              </div>
            </div>
            <pre class="text-[11px] text-apple-gray-800 dark:text-apple-gray-200 font-mono whitespace-pre-wrap overflow-x-auto max-h-72 overflow-y-auto leading-relaxed bg-white/70 dark:bg-apple-gray-900/70 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/30">{{ fullPrompt }}</pre>
          </div>

          <!-- 2. 模型的完整回复 -->
          <div class="p-3 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-1.5">
            <div class="flex items-center justify-between font-bold text-emerald-900 dark:text-emerald-200 text-xs border-b border-emerald-200/50 dark:border-emerald-900/40 pb-1.5">
              <div class="flex items-center gap-1.5">
                <MessageSquare :size="13" class="text-emerald-600 dark:text-emerald-400" />
                <span>模型的完整回复 (LLM Response)</span>
              </div>
              <div class="flex items-center gap-2 font-normal text-[10px] text-emerald-700 dark:text-emerald-300">
                <span class="font-mono">输出 Token: {{ outputTokens }}</span>
                <button
                  class="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors text-emerald-800 dark:text-emerald-200 cursor-pointer"
                  @click="copyResponseText"
                >
                  <component :is="copiedResponse ? Check : Copy" :size="11" />
                  <span>{{ copiedResponse ? '已复制回复' : '复制回复' }}</span>
                </button>
              </div>
            </div>
            <!-- ===== 原始代码（保留参考）===== -->
            <!-- <pre class="text-[11px] text-apple-gray-800 dark:text-apple-gray-200 font-mono whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto leading-relaxed bg-white/70 dark:bg-apple-gray-900/70 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/30">{{ fullRawResponse }}</pre> -->

            <!-- ===== 修改后的代码：渲染 Markdown 内容 ===== -->
            <div
              class="markdown-body text-[11px] text-apple-gray-800 dark:text-apple-gray-200 overflow-x-auto max-h-80 overflow-y-auto leading-relaxed bg-white/70 dark:bg-apple-gray-900/70 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/30 select-text break-words"
              v-html="renderedRawResponseHtml"
            ></div>
          </div>
        </div>

        <!-- Tab 2: 思考链 & 步骤 (Chain & Steps) -->
        <div v-if="activeTab === 'chain'" class="space-y-2.5 text-xs">
          <!-- 结构化步骤列表 -->
          <template v-if="block.steps && block.steps.length > 0">
            <div
              v-for="(step, idx) in block.steps"
              :key="idx"
              class="p-2.5 rounded-lg border bg-apple-gray-50/60 dark:bg-apple-gray-800/40 border-apple-gray-200/60 dark:border-apple-gray-700/60 space-y-1.5"
            >
              <div class="flex items-center justify-between font-medium">
                <div class="flex items-center gap-1.5">
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                    :class="[
                      step.phase === 'THINK' ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300' :
                      step.phase === 'ACT' ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300' :
                      'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                    ]"
                  >
                    {{ step.phase }}
                  </span>
                  <span class="text-apple-gray-700 dark:text-apple-gray-200">
                    Step {{ step.iteration ?? (idx + 1) }}
                  </span>
                </div>

                <span v-if="step.elapsedMs" class="text-[10px] text-apple-gray-400">
                  {{ formatDuration(step.elapsedMs) }}
                </span>
              </div>

              <!-- THINK Phase Content -->
              <div v-if="step.phase === 'THINK' && step.content" class="text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap pl-1 border-l-2 border-purple-300 dark:border-purple-700">
                {{ step.content }}
              </div>

              <!-- ACT Phase Tools -->
              <div v-if="step.phase === 'ACT'" class="space-y-1.5">
                <div v-for="(tc, tIdx) in step.toolCalls" :key="tIdx" class="p-2 rounded bg-white dark:bg-apple-gray-900 border border-apple-gray-200/50 dark:border-apple-gray-700/50 space-y-1">
                  <div class="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
                    <Wrench :size="12" />
                    <span>工具调用: {{ tc.toolName || tc.toolType || 'Tool' }}</span>
                  </div>
                  <details v-if="tc.params && Object.keys(tc.params).length > 0" class="text-[11px] text-apple-gray-500">
                    <summary class="cursor-pointer hover:underline text-apple-gray-600 dark:text-apple-gray-300">输入参数 (Params)</summary>
                    <pre class="mt-1 p-1.5 rounded bg-apple-gray-100 dark:bg-apple-gray-800 overflow-x-auto text-[10px]">{{ formatJson(tc.params) }}</pre>
                  </details>
                  <details v-if="tc.result" class="text-[11px] text-apple-gray-500">
                    <summary class="cursor-pointer hover:underline text-apple-gray-600 dark:text-apple-gray-300">返回结果 (Result)</summary>
                    <pre class="mt-1 p-1.5 rounded bg-apple-gray-100 dark:bg-apple-gray-800 overflow-x-auto text-[10px] max-h-36 overflow-y-auto">{{ formatJson(tc.result) }}</pre>
                  </details>
                </div>
              </div>

              <!-- REFLECT Phase -->
              <div v-if="step.phase === 'REFLECT'" class="space-y-1">
                <div class="flex items-center gap-1.5">
                  <component :is="step.passed ? CheckCircle2 : XCircle" :size="13" :class="step.passed ? 'text-emerald-500' : 'text-amber-500'" />
                  <span class="font-medium" :class="step.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
                    {{ step.passed ? '自我反思通过' : '需求进一步优化' }}
                  </span>
                </div>
                <p v-if="step.reflection" class="text-apple-gray-600 dark:text-apple-gray-300 text-[11px]">
                  {{ step.reflection }}
                </p>
              </div>
            </div>
          </template>

          <!-- 备用降级文本展示 -->
          <div v-else class="text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap leading-relaxed bg-white/80 dark:bg-apple-gray-900/80 p-3 rounded-lg border border-purple-100 dark:border-purple-900/40">
            {{ block.content || '思考中...' }}
            <span v-if="isThinking" class="inline-block w-1.5 h-4 bg-purple-500 animate-cursor-blink align-middle ml-0.5" />
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
