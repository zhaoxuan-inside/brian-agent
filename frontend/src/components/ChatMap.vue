<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { VueFlow, useVueFlow, MarkerType } from '@vue-flow/core'
import type { Node, Edge } from '@vue-flow/core'
import dagre from '@dagrejs/dagre'
import { X, User, Sparkles } from '@lucide/vue'
import { useSessionStore } from '../stores/session'
import { chatApi } from '../api'
import ChatMapNode, { type ChatMapNodeData } from './ChatMapNode.vue'

const emit = defineEmits<{
  locate: [msgId: string]
  openAgentChain: [exchangeId: string]
}>()

const sessionStore = useSessionStore()
const { setCenter, fitView, onNodeClick } = useVueFlow()

const NODE_W = 200
const NODE_H = 64
const SEQ_COLOR = '#C7C7CC'
const REF_COLOR = '#007AFF'

// ============================================================
// dagre 布局：仅主链消息（无 outgoing 引用的消息）参与布局，保证主链垂直干净；
// 分支消息（有 outgoing 引用，即通过 checkbox 选中上下文发送的）定位到被引用节点右侧。
// 引用边仅作渲染（右侧出/入的平滑曲线，向右 = 引用）。
// ============================================================
// 分支消息 msgId 集合（后端按 exchange 级判定并直接输出 isBranch，前后端保持一致）
const branchMsgIds = computed(() => {
  const set = new Set<string>()
  for (const n of sessionStore.dagNodes) {
    if (n.isBranch) set.add(n.msgId)
  }
  return set
})

const layoutPositions = computed(() => {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 50, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  // 仅主链节点参与 dagre 布局
  for (const n of sessionStore.dagNodes) {
    if (!branchMsgIds.value.has(n.msgId)) {
      g.setNode(n.msgId, { width: NODE_W, height: NODE_H })
    }
  }
  for (const e of sessionStore.dagEdges) {
    if (e.type === 'sequence') {
      if (!branchMsgIds.value.has(e.from) && !branchMsgIds.value.has(e.to)) {
        g.setEdge(e.from, e.to)
      }
    }
  }
  dagre.layout(g)
  const map = new Map<string, { x: number; y: number }>()
  for (const n of sessionStore.dagNodes) {
    if (!branchMsgIds.value.has(n.msgId)) {
      const p = g.node(n.msgId)
      if (p) map.set(n.msgId, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 })
    }
  }

  // 分支节点定位：放在被引用节点右侧
  // 先处理有直接引用边的分支节点
  const positionedInExchange = new Map<string, string[]>() // exchangeId -> [msgIds]
  const positionedMsgIds = new Set(map.keys())
  for (const n of sessionStore.dagNodes) {
    if (branchMsgIds.value.has(n.msgId) && !map.has(n.msgId)) {
      const refEdges = sessionStore.dagEdges.filter(e => e.type === 'reference' && e.to === n.msgId)
      const refPositions = refEdges
        .map(r => map.get(r.from))
        .filter((p): p is { x: number; y: number } => !!p)
      if (refPositions.length > 0) {
        const rightmost = Math.max(...refPositions.map(p => p.x)) + NODE_W + 60
        const avgY = refPositions.reduce((s, p) => s + p.y, 0) / refPositions.length
        const pos = { x: rightmost, y: Math.max(avgY, 20) }
        map.set(n.msgId, pos)
        positionedMsgIds.add(n.msgId)
        // 记录 exchange 分组，后续同 exchange 节点垂直排列
        const list = positionedInExchange.get(n.exchangeId) ?? []
        list.push(n.msgId)
        positionedInExchange.set(n.exchangeId, list)
      }
    }
  }
  // 同 exchange 内其他分支节点（如 assistant 回复）：垂直排列在已定位节点下方
  for (const n of sessionStore.dagNodes) {
    if (branchMsgIds.value.has(n.msgId) && !map.has(n.msgId)) {
      const group = positionedInExchange.get(n.exchangeId)
      if (group && group.length > 0) {
        const lastId = group[group.length - 1]
        const lastPos = map.get(lastId)
        if (lastPos) {
          const pos = { x: lastPos.x, y: lastPos.y + NODE_H + 20 }
          map.set(n.msgId, pos)
          group.push(n.msgId)
        }
      } else {
        // 无位置参考：放到最底部偏右
        const allY = Array.from(map.values()).map(p => p.y)
        const maxY = allY.length > 0 ? Math.max(...allY) + NODE_H + 20 : 20
        map.set(n.msgId, { x: NODE_W + 60, y: maxY })
      }
    }
  }

  return map
})

// 当前高亮节点（对话区点击 / 节点点击 / 引用跳转）
const activeMsgId = ref<string | null>(null)

const flowNodes = computed<Node[]>(() =>
  sessionStore.dagNodes.map(n => ({
    id: n.msgId,
    type: 'chatMessage',
    position: layoutPositions.value.get(n.msgId) ?? { x: 0, y: 0 },
    draggable: false,
    data: {
      msgId: n.msgId,
      exchangeId: n.exchangeId,
      role: n.role,
      summary: n.summary,
      referencesOut: n.referencesOut,
      referencesIn: n.referencesIn,
      checked: sessionStore.selectedMsgIds.has(n.msgId),
      highlighted: activeMsgId.value === n.msgId,
      onToggle: (id: string) => sessionStore.toggleMsgSelection(id),
      onDetail: (id: string) => openPopup(id, 'detail'),
      onBadge: (id: string) => openPopup(id, 'refs'),
      onAgentChain: (exchangeId: string) => emit('openAgentChain', exchangeId),
    } satisfies ChatMapNodeData,
  }))
)

const flowEdges = computed<Edge[]>(() =>
  sessionStore.dagEdges.map(e =>
    e.type === 'sequence'
      ? {
          id: `seq-${e.from}-${e.to}`,
          source: e.from,
          target: e.to,
          sourceHandle: 'seq-src',
          targetHandle: 'seq-tgt',
          style: { stroke: SEQ_COLOR, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: SEQ_COLOR, width: 14, height: 14 },
        }
      : {
          // 引用边：被引用方 -> 引用方（信息流向，向右 = 引用；后端 from=被引用, to=引用）
          id: `ref-${e.from}-${e.to}`,
          source: e.from,
          target: e.to,
          sourceHandle: 'ref-src',
          targetHandle: 'ref-tgt',
          style: { stroke: REF_COLOR, strokeWidth: 1.2, strokeDasharray: '5 3' },
          markerEnd: { type: MarkerType.ArrowClosed, color: REF_COLOR, width: 12, height: 12 },
        }
  )
)

// ============================================================
// 联动：对话区点击消息 -> 整个 DAG 平移居中（不改变节点相对位置）
// ============================================================
function centerOn(msgId: string) {
  const pos = layoutPositions.value.get(msgId)
  if (!pos) return
  setCenter(pos.x + NODE_W / 2, pos.y + NODE_H / 2, { duration: 400, zoom: 1.2 })
}

watch(
  () => sessionStore.focusedMsgId,
  async msgId => {
    if (!msgId) return
    activeMsgId.value = msgId
    await nextTick()
    centerOn(msgId)
  }
)

// 首次加载 / 会话切换后自动适配视图
watch(
  () => sessionStore.dagNodes.length,
  async (len, prev) => {
    if (len > 0 && (prev === 0 || !prev)) {
      await nextTick()
      fitView({ padding: 0.15 })
    }
  }
)

// 节点点击 -> 对话区滚动定位 + 打开 Agent 链（保留原有行为）
onNodeClick(({ node }) => {
  activeMsgId.value = node.id
  emit('locate', node.id)
  const dagNode = sessionStore.dagNodes.find(n => n.msgId === node.id)
  if (dagNode) {
    emit('openAgentChain', dagNode.exchangeId)
  }
})

// ============================================================
// 弹窗：查看详情 / 引用关系
// ============================================================
type MessageDetail = Awaited<ReturnType<typeof chatApi.message>>

const popupVisible = ref(false)
const popupMode = ref<'detail' | 'refs'>('detail')
const popupLoading = ref(false)
const popupData = ref<MessageDetail | null>(null)

async function openPopup(msgId: string, mode: 'detail' | 'refs') {
  popupMode.value = mode
  popupVisible.value = true
  popupLoading.value = true
  popupData.value = null
  try {
    popupData.value = await chatApi.message(msgId)
  } catch (e) {
    console.error('[ChatMap] load message detail failed:', e)
  } finally {
    popupLoading.value = false
  }
}

function closePopup() {
  popupVisible.value = false
  popupData.value = null
}

// 引用弹窗条目点击 -> DAG 居中 + 对话区定位 + 关闭弹窗
function gotoMessage(msgId: string) {
  sessionStore.focusMessage(msgId)
  emit('locate', msgId)
  closePopup()
}
</script>

<template>
  <div class="chatmap-container">
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :nodes-draggable="false"
      :min-zoom="0.2"
      :max-zoom="2"
      fit-view-on-init
      class="chatmap-flow"
    >
      <template #node-chatMessage="nodeProps">
        <ChatMapNode v-bind="nodeProps" />
      </template>
    </VueFlow>

    <div v-if="sessionStore.dagNodes.length === 0" class="empty-hint">
      暂无对话，发送消息后此处将展示消息 DAG 图
    </div>

    <div v-if="sessionStore.selectedMsgIds.size > 0" class="selection-bar">
      <span>已选 {{ sessionStore.selectedMsgIds.size }} 条消息作为上下文</span>
      <button class="clear-btn" @click="sessionStore.clearMsgSelection()">清空</button>
    </div>

    <!-- 详情 / 引用弹窗 -->
    <div v-if="popupVisible" class="popup-overlay" @click.self="closePopup">
      <div class="popup">
        <div class="popup-header">
          <span class="popup-title">{{ popupMode === 'detail' ? '消息详情' : '引用关系' }}</span>
          <button class="popup-close" @click="closePopup"><X :size="14" /></button>
        </div>

        <div v-if="popupLoading" class="popup-body loading">加载中...</div>

        <template v-else-if="popupData">
          <!-- 详情模式：完整内容 -->
          <div v-if="popupMode === 'detail'" class="popup-body">
            <div class="detail-role">
              <User v-if="popupData.role === 'user'" :size="12" class="node-icon user" />
              <Sparkles v-else :size="12" class="node-icon assistant" />
              <span>{{ popupData.role === 'user' ? '用户' : '助手' }}</span>
              <span class="detail-time">{{ new Date(popupData.createdAt).toLocaleString('zh-CN') }}</span>
            </div>
            <div class="detail-content">{{ popupData.content }}</div>
          </div>

          <!-- 引用模式：双向引用列表 -->
          <div v-else class="popup-body">
            <div class="ref-section">
              <div class="ref-section-title">引用了 {{ popupData.referencesOut.length }} 条消息</div>
              <div v-if="popupData.referencesOut.length === 0" class="ref-empty">无</div>
              <button
                v-for="ref in popupData.referencesOut"
                :key="ref.msgId"
                class="ref-item"
                @click="gotoMessage(ref.msgId)"
              >
                <User v-if="ref.role === 'user'" :size="11" class="node-icon user" />
                <Sparkles v-else :size="11" class="node-icon assistant" />
                <span class="ref-summary">{{ ref.summary }}</span>
              </button>
            </div>
            <div class="ref-section">
              <div class="ref-section-title">被 {{ popupData.referencesIn.length }} 条消息引用</div>
              <div v-if="popupData.referencesIn.length === 0" class="ref-empty">无</div>
              <button
                v-for="ref in popupData.referencesIn"
                :key="ref.msgId"
                class="ref-item"
                @click="gotoMessage(ref.msgId)"
              >
                <User v-if="ref.role === 'user'" :size="11" class="node-icon user" />
                <Sparkles v-else :size="11" class="node-icon assistant" />
                <span class="ref-summary">{{ ref.summary }}</span>
              </button>
            </div>
          </div>
        </template>

        <div v-else class="popup-body loading">加载失败</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chatmap-container {
  position: relative;
  height: 100%;
  width: 100%;
  background: #FAFAFC;
}

:root.dark .chatmap-container {
  background: #1C1C1E;
}

.chatmap-flow {
  height: 100%;
  width: 100%;
}

.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #AEAEB2;
  font-size: 12px;
  pointer-events: none;
}

.selection-bar {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-radius: 16px;
  background: rgba(52, 199, 89, 0.12);
  border: 1px solid rgba(52, 199, 89, 0.35);
  color: #34C759;
  font-size: 11px;
  z-index: 10;
}

.clear-btn {
  border: none;
  background: none;
  padding: 0;
  color: #34C759;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.popup-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.popup {
  width: 320px;
  max-height: 70%;
  display: flex;
  flex-direction: column;
  background: #FFFFFF;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

:root.dark .popup {
  background: #2C2C2E;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #E5E5EA;
}

:root.dark .popup-header {
  border-color: #3A3A3C;
}

.popup-title {
  font-size: 12px;
  font-weight: 600;
  color: #1D1D1F;
}

:root.dark .popup-title {
  color: #F5F5F7;
}

.popup-close {
  display: flex;
  border: none;
  background: none;
  color: #86868B;
  cursor: pointer;
  padding: 2px;
}

.popup-body {
  padding: 12px 14px;
  overflow-y: auto;
  font-size: 12px;
  color: #1D1D1F;
}

:root.dark .popup-body {
  color: #F5F5F7;
}

.popup-body.loading {
  color: #AEAEB2;
  text-align: center;
  padding: 24px;
}

.detail-role {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
  color: #86868B;
  font-size: 11px;
}

.detail-time {
  margin-left: auto;
  font-size: 10px;
  color: #AEAEB2;
}

.detail-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  max-height: 300px;
  overflow-y: auto;
}

.ref-section + .ref-section {
  margin-top: 12px;
}

.ref-section-title {
  font-size: 11px;
  font-weight: 600;
  color: #86868B;
  margin-bottom: 6px;
}

.ref-empty {
  font-size: 11px;
  color: #AEAEB2;
  padding: 4px 0;
}

.ref-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 4px;
  border: 1px solid #E5E5EA;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}

:root.dark .ref-item {
  border-color: #3A3A3C;
}

.ref-item:hover {
  background: #F5F5F7;
  border-color: #007AFF;
}

:root.dark .ref-item:hover {
  background: #3A3A3C;
}

.ref-summary {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: #1D1D1F;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:root.dark .ref-summary {
  color: #F5F5F7;
}

.node-icon.user {
  color: #34C759;
  flex-shrink: 0;
}

.node-icon.assistant {
  color: #007AFF;
  flex-shrink: 0;
}
</style>
