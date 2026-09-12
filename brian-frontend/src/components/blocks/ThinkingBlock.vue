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
import ComponentInfoModal from '@/components/chat/ComponentInfoModal.vue'

// ===== 可点击组件：Prompt / Soul / LLM / Skill / MCP（点击弹出组件详情） =====
export type ComponentKind = 'prompt' | 'soul' | 'llm' | 'skill' | 'mcp'
const componentView = ref<{ kind: ComponentKind; ref: string } | null>(null)

function openComponent(kind: ComponentKind, ref?: string) {
  if (ref) componentView.value = { kind, ref }
}

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

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '未执行', cls: 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-500 dark:text-apple-gray-300' },
  RUNNING: { label: '思考中', cls: 'bg-brian-blue/10 text-brian-blue' },
  SUCCESS: { label: '已完成', cls: 'bg-success-green/10 text-success-green' },
  ERROR: { label: '执行失败', cls: 'bg-error-red/10 text-error-red' },
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

// ===== Agent 构建组件：名称化 + 可点击查看详情 =====
const componentChips = computed<Array<{ kind: ComponentKind; label: string; ref: string; icon: unknown }>>(() => {
  const info = props.block.agentInfo
  if (!info) return []
  const chips: Array<{ kind: ComponentKind; label: string; ref: string; icon: unknown }> = []
  if (info.promptId) chips.push({ kind: 'prompt', label: String(info.promptId), ref: String(info.promptId), icon: FileText })
  if (info.soulId) chips.push({ kind: 'soul', label: String(info.soulId), ref: String(info.soulId), icon: Sparkles })
  if (info.llmId) chips.push({ kind: 'llm', label: String(info.llmId), ref: String(info.llmId), icon: Cpu })
  for (const s of info.skills || []) chips.push({ kind: 'skill', label: String(s), ref: String(s), icon: Wrench })
  for (const m of info.mcps || []) chips.push({ kind: 'mcp', label: String(m), ref: String(m), icon: Layers })
  return chips
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
    <div class="block-card rounded-xl overflow-hidden shadow-sm">
      <!-- Header 标题栏 -->
      <button
        class="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/60 transition-colors"
        @click="isExpanded = !isExpanded"
        :aria-expanded="isExpanded"
      >
        <div class="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
          <ChevronRight
            :size="14"
            class="text-apple-gray-400 flex-shrink-0 transition-transform duration-200"
            :class="{ 'rotate-90': isExpanded }"
          />
          <Brain :size="15" class="text-brian-blue flex-shrink-0" />
          
          <span class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-100 truncate">
            {{ block.agentInfo?.name || 'Agent' }}
          </span>

          <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-brian-blue/10 text-brian-blue flex-shrink-0">
            {{ agentTypeLabel }}
          </span>

          <!-- 思考方式标签 -->
          <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300 flex-shrink-0">
            {{ thinkingStrategy }}
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
          <!-- Token 用量：输入 / 输出 -->
          <span v-if="totalTokens > 0" class="inline-flex items-center gap-1 font-mono text-[10px] bg-apple-gray-100 dark:bg-apple-gray-700/60 px-2 py-0.5 rounded-md text-apple-gray-600 dark:text-apple-gray-300" title="Token 用量（输入 / 输出）">
            <Zap :size="11" class="text-brian-blue" />
            <span>输入: {{ inputTokens }}</span>
            <span class="opacity-40">|</span>
            <span>输出: {{ outputTokens }}</span>
            <span class="opacity-60 font-normal">({{ totalTokens }})</span>
          </span>
          <span v-if="block.durationMs" class="inline-flex items-center gap-1" title="调用耗时">
            <Clock :size="11" /> {{ formatDuration(block.durationMs) }}
          </span>
        </div>
      </button>

      <!-- Expanded Detail 展开面板 -->
      <div v-if="isExpanded" class="border-t border-apple-gray-100 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900/40 p-3.5 space-y-3">
        
        <!-- 上下文信息环境（若未显式隐藏） -->
        <div v-if="!hideContext" class="p-3 rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50/60 dark:bg-apple-gray-800/40 text-xs space-y-2">
          <div class="flex items-center justify-between font-bold text-apple-gray-900 dark:text-apple-gray-100 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60 pb-1">
            <div class="flex items-center gap-1.5">
              <Database :size="13" class="text-brian-blue" />
              <span>上下文环境</span>
            </div>
            <span v-if="block.context?.strategy" class="text-[10px] font-normal px-2 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300">
              {{ block.context.strategy }}
            </span>
          </div>

          <div v-if="block.context?.citingMessages?.length" class="p-2 rounded bg-white dark:bg-apple-gray-900 border border-apple-gray-200/60 dark:border-apple-gray-700/60">
            <span class="font-semibold text-apple-gray-700 dark:text-apple-gray-200 text-[11px]">引用的历史消息:</span>
            <ul class="space-y-1 mt-1">
              <li v-for="(msg, mIdx) in block.context.citingMessages" :key="mIdx" class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 bg-apple-gray-50 dark:bg-apple-gray-800/60 p-1.5 rounded">
                • {{ msgContent(msg) }}
              </li>
            </ul>
          </div>
        </div>

        <!-- 组件标识区：Agent 构建信息（Prompt / Soul / LLM / Skill / MCP），点击查看对应组件详情 -->
        <div v-if="componentChips.length" class="flex items-center gap-1.5 flex-wrap text-[11px] pb-2 border-b border-apple-gray-100 dark:border-apple-gray-800">
          <span class="text-[10px] text-apple-gray-400 flex-shrink-0">构建组件</span>
          <button
            v-for="chip in componentChips"
            :key="`${chip.kind}-${chip.ref}`"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-brian-blue/10 hover:text-brian-blue transition-colors cursor-pointer"
            :title="`查看 ${chip.label} 组件信息`"
            @click="openComponent(chip.kind, chip.ref)"
          >
            <component :is="chip.icon" :size="11" />
            <span class="max-w-40 truncate">{{ chip.label }}</span>
          </button>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex items-center gap-1 border-b border-apple-gray-100 dark:border-apple-gray-800 pb-1">
          <button
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
            :class="activeTab === 'io' ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-500 hover:text-brian-blue'"
            @click="activeTab = 'io'"
          >
            <FileText :size="12" />
            输入与回复
          </button>

          <button
            class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
            :class="activeTab === 'chain' ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-500 hover:text-brian-blue'"
            @click="activeTab = 'chain'"
          >
            <Brain :size="12" />
            思考步骤 ({{ thinkingStrategy }})
          </button>
        </div>

        <!-- Tab 1: 完整 Prompt 与 模型完整回复 -->
        <div v-if="activeTab === 'io'" class="space-y-3 text-xs">
          <!-- 1. 完整输入 -->
          <div class="p-3 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50/50 dark:bg-apple-gray-800/40 space-y-1.5">
            <div class="flex items-center justify-between font-bold text-apple-gray-900 dark:text-apple-gray-100 text-xs border-b border-apple-gray-200/60 dark:border-apple-gray-700/60 pb-1.5">
              <div class="flex items-center gap-1.5">
                <FileText :size="13" class="text-brian-blue" />
                <span>完整输入</span>
              </div>
              <div class="flex items-center gap-2 font-normal text-[10px] text-apple-gray-500">
                <span class="font-mono">输入 Token: {{ inputTokens }}</span>
                <button
                  class="flex items-center gap-1 px-2 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700/60 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors text-apple-gray-600 dark:text-apple-gray-300 cursor-pointer"
                  @click="copyPromptText"
                >
                  <component :is="copiedPrompt ? Check : Copy" :size="11" />
                  <span>{{ copiedPrompt ? '已复制' : '复制' }}</span>
                </button>
              </div>
            </div>
            <pre class="text-[11px] text-apple-gray-800 dark:text-apple-gray-200 font-mono whitespace-pre-wrap overflow-x-auto max-h-72 overflow-y-auto leading-relaxed bg-white dark:bg-apple-gray-900 p-2.5 rounded-lg border border-apple-gray-200/60 dark:border-apple-gray-700/60">{{ fullPrompt }}</pre>
          </div>

          <!-- 2. 模型回复 -->
          <div class="p-3 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50/50 dark:bg-apple-gray-800/40 space-y-1.5">
            <div class="flex items-center justify-between font-bold text-apple-gray-900 dark:text-apple-gray-100 text-xs border-b border-apple-gray-200/60 dark:border-apple-gray-700/60 pb-1.5">
              <div class="flex items-center gap-1.5">
                <MessageSquare :size="13" class="text-brian-blue" />
                <span>模型回复</span>
              </div>
              <div class="flex items-center gap-2 font-normal text-[10px] text-apple-gray-500">
                <span class="font-mono">输出 Token: {{ outputTokens }}</span>
                <button
                  class="flex items-center gap-1 px-2 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700/60 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors text-apple-gray-600 dark:text-apple-gray-300 cursor-pointer"
                  @click="copyResponseText"
                >
                  <component :is="copiedResponse ? Check : Copy" :size="11" />
                  <span>{{ copiedResponse ? '已复制' : '复制' }}</span>
                </button>
              </div>
            </div>
            <!-- ===== 原始代码（保留参考）===== -->
            <!-- <pre class="text-[11px] text-apple-gray-800 dark:text-apple-gray-200 font-mono whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto leading-relaxed bg-white/70 dark:bg-apple-gray-900/70 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/30">{{ fullRawResponse }}</pre> -->

            <!-- ===== 修改后的代码：渲染 Markdown 内容 ===== -->
            <div
              class="markdown-body text-[11px] text-apple-gray-800 dark:text-apple-gray-200 overflow-x-auto max-h-80 overflow-y-auto leading-relaxed bg-white dark:bg-apple-gray-900 p-2.5 rounded-lg border border-apple-gray-200/60 dark:border-apple-gray-700/60 select-text break-words"
              v-html="renderedRawResponseHtml"
            ></div>
          </div>
        </div>

        <!-- Tab 2: 思考步骤 -->
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
                    class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-brian-blue/10 text-brian-blue"
                  >
                    {{ step.phase }}
                  </span>
                  <span class="text-apple-gray-700 dark:text-apple-gray-200">
                    {{ step.iteration ?? (idx + 1) }}
                  </span>
                </div>

                <span v-if="step.elapsedMs" class="text-[10px] text-apple-gray-400">
                  {{ formatDuration(step.elapsedMs) }}
                </span>
              </div>

              <!-- 本轮输入（发送给 LLM 的 prompt / 用户消息） -->
              <div v-if="step.input" class="rounded-lg bg-white dark:bg-apple-gray-900 border border-apple-gray-200/50 dark:border-apple-gray-700/50 overflow-hidden">
                <p class="px-2 py-1 text-[10px] font-medium text-apple-gray-400 border-b border-apple-gray-100 dark:border-apple-gray-800 flex items-center gap-1">
                  <FileText :size="10" /> 本轮输入
                </p>
                <pre class="px-2 py-1.5 text-[11px] text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap break-all max-h-40 overflow-y-auto leading-relaxed">{{ step.input }}</pre>
              </div>

              <!-- THINK Phase Content -->
              <div v-if="step.phase === 'THINK' && step.content" class="text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap pl-2 border-l-2 border-brian-blue/30">
                {{ step.content }}
              </div>

              <!-- ACT Phase Tools -->
              <div v-if="step.phase === 'ACT'" class="space-y-1.5">
                <div v-for="(tc, tIdx) in step.toolCalls" :key="tIdx" class="p-2 rounded bg-white dark:bg-apple-gray-900 border border-apple-gray-200/50 dark:border-apple-gray-700/50 space-y-1">
                  <div class="flex items-center gap-1.5 text-brian-blue font-medium">
                    <Wrench :size="12" />
                    <span>{{ tc.toolName || tc.toolType || 'Tool' }}</span>
                  </div>
                  <details v-if="tc.params && Object.keys(tc.params).length > 0" class="text-[11px] text-apple-gray-500">
                    <summary class="cursor-pointer hover:underline text-apple-gray-600 dark:text-apple-gray-300">输入参数</summary>
                    <pre class="mt-1 p-1.5 rounded bg-apple-gray-100 dark:bg-apple-gray-800 overflow-x-auto text-[10px]">{{ formatJson(tc.params) }}</pre>
                  </details>
                  <details v-if="tc.result" class="text-[11px] text-apple-gray-500">
                    <summary class="cursor-pointer hover:underline text-apple-gray-600 dark:text-apple-gray-300">返回结果</summary>
                    <pre class="mt-1 p-1.5 rounded bg-apple-gray-100 dark:bg-apple-gray-800 overflow-x-auto text-[10px] max-h-36 overflow-y-auto">{{ formatJson(tc.result) }}</pre>
                  </details>
                </div>
              </div>

              <!-- REFLECT Phase -->
              <div v-if="step.phase === 'REFLECT'" class="space-y-1">
                <div class="flex items-center gap-1.5">
                  <component :is="step.passed ? CheckCircle2 : XCircle" :size="13" :class="step.passed ? 'text-success-green' : 'text-error-red'" />
                  <span class="font-medium" :class="step.passed ? 'text-success-green' : 'text-error-red'">
                    {{ step.passed ? '通过' : '需优化' }}
                  </span>
                </div>
                <p v-if="step.reflection" class="text-apple-gray-600 dark:text-apple-gray-300 text-[11px]">
                  {{ step.reflection }}
                </p>
              </div>

              <!-- 本轮输出（LLM 回复内容） -->
              <div v-if="step.output" class="rounded-lg bg-white dark:bg-apple-gray-900 border border-apple-gray-200/50 dark:border-apple-gray-700/50 overflow-hidden">
                <p class="px-2 py-1 text-[10px] font-medium text-apple-gray-400 border-b border-apple-gray-100 dark:border-apple-gray-800 flex items-center gap-1">
                  <MessageSquare :size="10" /> 本轮输出
                </p>
                <pre class="px-2 py-1.5 text-[11px] text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap break-all max-h-40 overflow-y-auto leading-relaxed">{{ step.output }}</pre>
              </div>
            </div>
          </template>

          <!-- 备用降级文本展示 -->
          <div v-else class="text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap leading-relaxed bg-white dark:bg-apple-gray-900 p-3 rounded-lg border border-apple-gray-200/60 dark:border-apple-gray-700/60">
            {{ block.content || '思考中...' }}
            <span v-if="isThinking" class="inline-block w-1.5 h-4 bg-brian-blue animate-cursor-blink align-middle ml-0.5" />
          </div>
        </div>

      </div>
    </div>
  </div>

  <ComponentInfoModal
    v-if="componentView"
    :kind="componentView.kind"
    :ref-id="componentView.ref"
    @close="componentView = null"
  />
</template>
