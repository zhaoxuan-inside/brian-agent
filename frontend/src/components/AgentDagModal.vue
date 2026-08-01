<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSessionStore } from '../stores/session'
import { X } from '@lucide/vue'

defineEmits<{ 'close': [] }>()

const sessionStore = useSessionStore()
const selectedNodeId = ref<string | null>(null)
const detailTab = ref<'config' | 'context' | 'input' | 'output'>('config')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DagNodeEx { id: string; name: string; type: string; role: string; description: string; status: string; startTime?: number; endTime?: number; strategy?: string; output?: any[]; thinking?: any; children: string[]; layer: number }
interface Edge { from: string; to: string }

const dagData = computed(() => {
  const chain = sessionStore.agentChain
  if (!chain.length) return { nodes: [] as DagNodeEx[], edges: [] as Edge[], layers: [] as string[][], w: 0, h: 0, layerCounts: [] as number[] }

  const nodes: DagNodeEx[] = []
  const edges: Edge[] = []

  // Direct layer assignment: coordinator=0, workers with coordinator as parent=1, etc.
  const parentMap = new Map<string, string>() // child → parent
  for (const a of chain) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kids = Array.isArray((a as any).children) ? (a as any).children.filter((k: any) => typeof k === 'string') : []
    for (const k of kids) {
      edges.push({ from: a.id, to: k })
      parentMap.set(k, a.id)
    }
  }

  function getLayer(id: string): number {
    const parent = parentMap.get(id)
    if (!parent) return 0
    return getLayer(parent) + 1
  }

  for (const a of chain) {
    const layer = getLayer(a.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodes.push({ id: a.id, name: a.name, type: a.type, role: a.role, description: a.description || '', status: a.status, startTime: (a as any).startTime, endTime: (a as any).endTime, strategy: (a as any).strategy, output: a.output, thinking: (a as any).thinking, children: Array.isArray((a as any).children) ? (a as any).children : [], layer })
  }

  const maxLayer = Math.max(0, ...nodes.map(n => n.layer))
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const n of nodes) layers[n.layer].push(n.id)

  // Filter empty layers
  const filteredLayers = layers.filter(l => l.length > 0)

  const NODE_H = 100; const NODE_GAP = 16
  const maxInLayer = Math.max(...filteredLayers.map(l => l.length), 1)
  const w = filteredLayers.length * 280
  const h = Math.max(maxInLayer * (NODE_H + NODE_GAP) + 60, 300)
  return { nodes, edges, layers: filteredLayers, w, h, layerCounts: filteredLayers.map(l => l.length) }
})

const selectedNode = computed(() => dagData.value.nodes.find(n => n.id === selectedNodeId.value))

function nodesInLayer(layer: number) { return dagData.value.nodes.filter(n => n.layer === layer) }

function layerY(layer: number, nodeIdx: number): number {
  const count = nodesInLayer(layer).length
  const NODE_H = 100; const NODE_GAP = 16
  const total = count * (NODE_H + NODE_GAP) - NODE_GAP
  const startY = (dagData.value.h - total) / 2
  return startY + nodeIdx * (NODE_H + NODE_GAP)
}

function statusDot(s: string): string {
  switch (s) { case 'completed': return 'bg-green-500'; case 'running': return 'bg-blue-500 animate-pulse'; case 'failed': return 'bg-red-500'; default: return 'bg-gray-400' }
}
function statusBorder(s: string): string {
  switch (s) { case 'completed': return 'border-l-green-500'; case 'running': return 'border-l-blue-500'; case 'failed': return 'border-l-red-500'; default: return 'border-l-gray-300 dark:border-l-gray-600' }
}
function formatDur(s?: number, e?: number): string { if (!s) return '-'; const ms = (e || Date.now()) - s; if (ms < 1000) return ms + 'ms'; if (ms < 60000) return (ms / 1000).toFixed(1) + 's'; return (ms / 60000).toFixed(1) + 'min' }
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="$emit('close')">
      <div class="bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl w-[95vw] max-w-7xl h-[88vh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between p-4 border-b border-apple-gray-200 dark:border-apple-gray-700 shrink-0">
          <div>
            <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">Agent DAG 调度图</h2>
            <p class="text-xs text-apple-gray-400 font-mono">
              {{ dagData.nodes.length }}节点 {{ dagData.edges.length }}边 {{ dagData.layers.length }}层
              <span v-if="dagData.nodes.length" class="ml-2">
                children: {{ sessionStore.agentChain.map(a => (a.id||'').slice(-4)+'→['+(((a as any).children||[]).map((c:any)=>String(c).slice(-4)).join(','))+']').join(' ') }}
              </span>
            </p>
          </div>
          <button @click="$emit('close')" class="p-2 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800"><X :size="18" class="text-apple-gray-400" /></button>
        </div>

        <div class="flex-1 flex overflow-hidden">
          <!-- DAG Area with SVG connectors -->
          <div class="flex-1 overflow-auto bg-apple-gray-50/50 dark:bg-apple-gray-950/50">
            <div v-if="dagData.nodes.length === 0" class="flex items-center justify-center h-full text-apple-gray-400 text-sm">暂无数据</div>
            <div v-else class="relative" :style="{ width: dagData.w + 'px', height: dagData.h + 'px' }">
              <!-- SVG connector lines -->
              <svg class="absolute inset-0 w-full h-full pointer-events-none" :style="{ zIndex: 0 }">
                <defs>
                  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#94A3B8" />
                  </marker>
                </defs>
                <line v-for="(edge, ei) in dagData.edges" :key="'e'+ei"
                  :x1="(edge.from ? (dagData.nodes.find(n=>n.id===edge.from)?.layer ?? 0) : 0) * 280 + 240"
                  :y1="(edge.from ? layerY(dagData.nodes.find(n=>n.id===edge.from)?.layer ?? 0, nodesInLayer(dagData.nodes.find(n=>n.id===edge.from)?.layer ?? 0).findIndex(n=>n.id===edge.from)) : 0) + 50"
                  :x2="(edge.to ? (dagData.nodes.find(n=>n.id===edge.to)?.layer ?? 0) : 0) * 280 + 10"
                  :y2="(edge.to ? layerY(dagData.nodes.find(n=>n.id===edge.to)?.layer ?? 0, nodesInLayer(dagData.nodes.find(n=>n.id===edge.to)?.layer ?? 0).findIndex(n=>n.id===edge.to)) : 0) + 50"
                  stroke="#94A3B8" stroke-width="1.5" marker-end="url(#arrowhead)" class="dark:!stroke-slate-600" />
              </svg>

              <!-- Layer columns -->
              <div class="absolute inset-0 flex" style="z-index: 1">
                <div v-for="(_layerIds, li) in dagData.layers" :key="'L'+li"
                  class="relative shrink-0 flex flex-col items-center justify-center" style="width: 280px">

                  <div class="relative z-10 flex flex-col gap-3 w-[240px]">
                    <div v-for="node in nodesInLayer(li)" :key="node.id"
                      :class="['relative rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 border-l-[3px] p-3.5 cursor-pointer transition-all bg-white dark:bg-apple-gray-800 hover:shadow-lg',
                        statusBorder(node.status),
                        selectedNodeId === node.id ? 'ring-2 ring-blue-500 shadow-lg scale-[1.02]' : 'shadow-sm']"
                      @click="selectedNodeId = selectedNodeId === node.id ? null : node.id">

                      <div :class="['absolute top-2.5 right-2.5 w-3 h-3 rounded-full border-2 border-white dark:border-apple-gray-800', statusDot(node.status)]" />

                      <span :class="['inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mb-1.5',
                        node.type === 'coordinator' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300']">
                        {{ node.type === 'coordinator' ? '编排者' : 'Worker' }}
                      </span>
                      <p class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-50 leading-tight mb-0.5">{{ node.name }}</p>
                      <p class="text-[10px] text-apple-gray-400 leading-tight mb-1 line-clamp-2">{{ node.description.slice(0, 60) }}</p>
                      <div class="flex items-center justify-between">
                        <span class="text-[10px] text-apple-gray-400">{{ formatDur(node.startTime, node.endTime) }}</span>
                        <span :class="['text-[10px] font-medium',
                          node.status === 'completed' ? 'text-green-600 dark:text-green-400' :
                          node.status === 'running' ? 'text-blue-600 dark:text-blue-400' :
                          node.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-apple-gray-400']">
                          {{ node.status === 'completed' ? '完成' : node.status === 'running' ? '运行中' : node.status === 'failed' ? '失败' : '就绪' }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Detail Panel -->
          <div v-if="selectedNode" class="w-80 border-l border-apple-gray-200 dark:border-apple-gray-700 flex flex-col shrink-0">
            <div class="p-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
              <p class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ selectedNode.name }}</p>
              <p class="text-[10px] text-apple-gray-400">{{ selectedNode.type }} · {{ selectedNode.status }} · {{ formatDur(selectedNode.startTime, selectedNode.endTime) }}</p>
            </div>
            <div class="flex border-b border-apple-gray-200 dark:border-apple-gray-700">
              <button v-for="tab in (['config','context','input','output'] as const)" :key="tab"
                :class="['flex-1 py-2 text-[11px] font-medium', detailTab===tab?'text-brian-blue border-b-2 border-brian-blue':'text-apple-gray-400']"
                @click="detailTab=tab">{{ {config:'Agent',context:'Context',input:'输入',output:'输出'}[tab] }}</button>
            </div>
            <div class="flex-1 overflow-y-auto p-3 text-xs space-y-2">
              <template v-if="detailTab==='config'">
                <div class="bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg p-2.5"><p class="font-semibold text-apple-gray-500 mb-1">LLM</p><p class="text-apple-gray-700 dark:text-apple-gray-300">{{ (selectedNode as any).llm?.modelId || '-' }} · {{ (selectedNode as any).llm?.providerId || '-' }} · temp={{ (selectedNode as any).llm?.temperature || '-' }}</p></div>
                <div class="bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg p-2.5"><p class="font-semibold text-apple-gray-500 mb-1">策略</p><p class="text-apple-gray-700 dark:text-apple-gray-300">{{ selectedNode.strategy || 'react' }}</p></div>
                <div v-if="(selectedNode as any).skillIds?.length" class="bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg p-2.5"><p class="font-semibold text-apple-gray-500 mb-1">Skills</p><div class="flex flex-wrap gap-1"><span v-for="s in (selectedNode as any).skillIds" :key="s" class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{{ s }}</span></div></div>
                <div v-if="(selectedNode as any).mcpIds?.length" class="bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg p-2.5"><p class="font-semibold text-apple-gray-500 mb-1">MCP</p><div class="flex flex-wrap gap-1"><span v-for="m in (selectedNode as any).mcpIds" :key="m" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{{ m }}</span></div></div>
                <div v-if="(selectedNode as any).soulId" class="bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg p-2.5"><p class="font-semibold text-apple-gray-500 mb-1">Soul</p><p class="text-apple-gray-700 dark:text-apple-gray-300">{{ (selectedNode as any).soulId }}</p></div>
                <div class="bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg p-2.5"><p class="font-semibold text-apple-gray-500 mb-1">Role</p><p class="text-apple-gray-700 dark:text-apple-gray-300">{{ selectedNode.role }}</p></div>
              </template>
              <template v-if="detailTab==='context'">
                <div v-if="selectedNode.thinking?.systemPrompt" class="bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg p-2.5"><p class="font-semibold text-apple-gray-500 mb-1">System Prompt</p><pre class="text-[11px] whitespace-pre-wrap font-mono text-apple-gray-700 dark:text-apple-gray-300 max-h-32 overflow-y-auto">{{ selectedNode.thinking.systemPrompt }}</pre></div>
                <div v-if="selectedNode.thinking?.instruction" class="bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg p-2.5"><p class="font-semibold text-apple-gray-500 mb-1">Instruction</p><pre class="text-[11px] whitespace-pre-wrap font-mono text-apple-gray-700 dark:text-apple-gray-300 max-h-32 overflow-y-auto">{{ selectedNode.thinking.instruction }}</pre></div>
                <div v-if="!selectedNode.thinking" class="text-apple-gray-400 text-center py-8">无 Context</div>
              </template>
              <div v-if="detailTab==='input'">
                <div v-if="selectedNode.thinking?.instruction" class="bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg p-2.5"><p class="font-semibold text-apple-gray-500 mb-1">输入</p><pre class="text-[11px] whitespace-pre-wrap font-mono text-apple-gray-700 dark:text-apple-gray-300 max-h-60 overflow-y-auto">{{ selectedNode.thinking.instruction }}</pre></div>
                <div v-else class="text-apple-gray-400 text-center py-8">无输入</div>
              </div>
              <div v-if="detailTab==='output'">
                <div v-if="selectedNode.thinking?.fullOutput" class="bg-green-50 dark:bg-green-950/30 rounded-lg p-2.5 border border-green-200 dark:border-green-900/30"><p class="font-semibold text-green-600 dark:text-green-400 mb-1">输出</p><pre class="text-[11px] whitespace-pre-wrap font-mono text-apple-gray-700 dark:text-apple-gray-300 max-h-80 overflow-y-auto">{{ selectedNode.thinking.fullOutput.slice(0,2000) }}</pre></div>
                <div v-else class="text-apple-gray-400 text-center py-8">无输出</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
