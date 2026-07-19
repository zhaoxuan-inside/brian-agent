<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { GitBranch, Clock, Activity, ChevronRight } from '@lucide/vue'
import { visualApi } from '../../api'
import type { GraphData } from '../../api'
import { useRoute } from 'vue-router'

const route = useRoute()

interface ChatFlowMessage {
  role: string
  content: string
  timestamp: number
  createdAt: number
}

interface AgentInfo {
  id: string
  name?: string
  status?: string
  strategy?: string
  type?: string
}

interface AgentStatus {
  agents?: AgentInfo[]
}

const activeTab = ref<'dag' | 'timeline' | 'chain'>('dag')
const graphData = ref<GraphData | null>(null)
const chatFlow = ref<ChatFlowMessage[] | null>(null)
const agentStatus = ref<AgentStatus | null>(null)
const loading = ref(false)
const userId = ref('default')
const chatId = ref(route.query.chatId as string || '')

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true
  try {
    const [graph, flow, status] = await Promise.allSettled([
      visualApi.memoryGraph(userId.value),
      chatId.value ? visualApi.chatFlow(chatId.value, userId.value) : Promise.resolve(null),
      visualApi.agentStatus(),
    ])
    if (graph.status === 'fulfilled') graphData.value = graph.value
    if (flow.status === 'fulfilled') chatFlow.value = flow.value as unknown as ChatFlowMessage[]
    if (status.status === 'fulfilled') agentStatus.value = status.value as unknown as AgentStatus
  } catch (e) {
    console.error('Failed to load visual data:', e)
  }
  loading.value = false
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString()
}

function getNodeColor(nodeId: string) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
  const hash = nodeId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return colors[hash % colors.length]
}
</script>

<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50">可视化流程</h2>
        <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
          Multi-Agent 调用链路与 DAG 图
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-for="tab in [
            { id: 'dag', label: 'DAG 图', icon: GitBranch },
            { id: 'timeline', label: '时间线', icon: Clock },
            { id: 'chain', label: '调用链', icon: Activity },
          ]" :key="tab.id"
          :class="[
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === tab.id
              ? 'bg-brian-blue text-white'
              : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
          ]"
          @click="activeTab = tab.id as any"
        >
          <component :is="tab.icon" :size="16" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="animate-spin w-8 h-8 border-2 border-brian-blue border-t-transparent rounded-full" />
    </div>

    <div v-else class="flex-1 overflow-auto">
      <!-- DAG Graph -->
      <div v-if="activeTab === 'dag'" class="h-full">
        <div v-if="graphData?.nodes?.length" class="h-full flex flex-col">
          <div class="flex-1 relative glass-panel rounded-xl p-4 overflow-auto">
            <svg class="w-full h-full min-h-[400px]">
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                </marker>
              </defs>
              <g v-for="(edge, i) in graphData.edges || []" :key="'e'+i">
                <line
                  :x1="(graphData.nodes.findIndex((n: any) => n.id === edge.source_node_id) + 1) * (100 / (graphData.nodes.length + 1)) + '%'"
                  :y1="'20%'"
                  :x2="(graphData.nodes.findIndex((n: any) => n.id === edge.target_node_id) + 1) * (100 / (graphData.nodes.length + 1)) + '%'"
                  :y2="'60%'"
                  stroke="#94a3b8"
                  stroke-width="2"
                  marker-end="url(#arrowhead)"
                  class="opacity-50"
                />
              </g>
              <g v-for="(node, i) in graphData.nodes || []" :key="node.id">
                <circle
                  :cx="((i + 1) * 100 / (graphData.nodes.length + 1)) + '%'"
                  cy="20%"
                  r="24"
                  :fill="getNodeColor(node.id)"
                  class="opacity-80"
                />
                <text
                  :x="((i + 1) * 100 / (graphData.nodes.length + 1)) + '%'"
                  y="20%"
                  text-anchor="middle"
                  dy=".35em"
                  fill="white"
                  font-size="10"
                  font-weight="bold"
                >
                  {{ (node.label || node.type || 'N').slice(0, 2) }}
                </text>
                <text
                  :x="((i + 1) * 100 / (graphData.nodes.length + 1)) + '%'"
                  y="28%"
                  text-anchor="middle"
                  fill="currentColor"
                  font-size="11"
                  class="fill-apple-gray-700 dark:fill-apple-gray-300"
                >
                  {{ node.label || node.type || node.id }}
                </text>
              </g>
            </svg>
          </div>
          <div class="mt-4 p-4 glass-panel rounded-xl">
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-2">节点详情</h4>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
              <div v-for="node in graphData.nodes" :key="node.id"
                class="flex items-center gap-2 p-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800">
                <div class="w-3 h-3 rounded-full" :style="{ background: getNodeColor(node.id) }" />
                <span class="text-xs text-apple-gray-700 dark:text-apple-gray-300 truncate">
                  {{ node.label || node.type || node.id }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-64 text-apple-gray-400">
          暂无 DAG 数据
        </div>
      </div>

      <!-- Timeline -->
      <div v-if="activeTab === 'timeline'" class="space-y-4">
        <div v-if="chatFlow?.length" class="space-y-3">
          <div v-for="(msg, i) in chatFlow" :key="i"
            class="flex gap-4 p-4 rounded-xl glass-panel">
            <div class="flex flex-col items-center">
              <div :class="[
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white',
                msg.role === 'user' ? 'bg-brian-blue' : 'bg-emerald-500'
              ]">
                {{ msg.role === 'user' ? 'U' : 'A' }}
              </div>
              <div v-if="i < chatFlow.length - 1" class="w-0.5 flex-1 bg-apple-gray-200 dark:bg-apple-gray-700 mt-1" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">
                  {{ msg.role === 'user' ? '用户' : '助手' }}
                </span>
                <span class="text-xs text-apple-gray-400">{{ formatTime(msg.timestamp || msg.createdAt) }}</span>
              </div>
              <p class="text-sm text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap line-clamp-3">
                {{ msg.content }}
              </p>
            </div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-64 text-apple-gray-400">
          暂无时间线数据
        </div>
      </div>

      <!-- Call Chain -->
      <div v-if="activeTab === 'chain'" class="space-y-4">
        <div v-if="agentStatus?.agents?.length" class="space-y-3">
          <div v-for="agent in agentStatus.agents" :key="agent.id"
            class="flex items-center gap-4 p-4 rounded-xl glass-panel">
            <div class="w-3 h-3 rounded-full" :class="agent.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-apple-gray-400'" />
            <div class="flex-1">
              <span class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ agent.name || agent.id }}</span>
              <span class="ml-2 text-xs text-apple-gray-500">{{ agent.strategy || agent.type }}</span>
            </div>
            <span class="text-xs px-2 py-1 rounded-full"
              :class="agent.status === 'running' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-apple-gray-100 text-apple-gray-600 dark:bg-apple-gray-800 dark:text-apple-gray-400'">
              {{ agent.status || 'idle' }}
            </span>
          </div>
        </div>
        <div v-else class="space-y-3">
          <div class="p-4 rounded-xl glass-panel">
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-3">Agent 调度流程</h4>
            <div class="flex items-center gap-2 flex-wrap">
              <template v-for="(name, j) in ['Planner', 'Worker', 'Synthesizer', 'Evaluator']" :key="name">
                <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brian-blue/10 border border-brian-blue/20">
                  <div class="w-2 h-2 rounded-full bg-brian-blue" />
                  <span class="text-sm font-medium text-brian-blue">{{ name }} Agent</span>
                </div>
                <div v-if="j < 3" class="text-apple-gray-400">
                  <ChevronRight :size="16" />
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>