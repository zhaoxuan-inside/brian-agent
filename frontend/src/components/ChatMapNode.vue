<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { User, Sparkles, GitBranch } from '@lucide/vue'

export interface ChatMapNodeData {
  msgId: string
  exchangeId: string
  role: 'user' | 'assistant' | 'system'
  summary: string
  referencesOut: number
  referencesIn: number
  checked: boolean
  highlighted: boolean
  onToggle: (msgId: string) => void
  onDetail: (msgId: string) => void
  onBadge: (msgId: string) => void
  onAgentChain: (exchangeId: string) => void
}

const props = defineProps<{
  data: ChatMapNodeData
  selected?: boolean
}>()

function handleToggle(e: MouseEvent) {
  e.stopPropagation()
  props.data.onToggle(props.data.msgId)
}

function handleDetail(e: MouseEvent) {
  e.stopPropagation()
  props.data.onDetail(props.data.msgId)
}

function handleBadge(e: MouseEvent) {
  e.stopPropagation()
  props.data.onBadge(props.data.msgId)
}

function handleAgentChain(e: MouseEvent) {
  e.stopPropagation()
  props.data.onAgentChain(props.data.exchangeId)
}
</script>

<template>
  <div
    class="chatmap-node"
    :class="[data.role, { checked: data.checked, highlighted: data.highlighted }]"
  >
    <!-- 顺序边连接点：上入下出（向下 = 顺序） -->
    <Handle id="seq-tgt" type="target" :position="Position.Top" class="handle-seq" />
    <Handle id="seq-src" type="source" :position="Position.Bottom" class="handle-seq" />
    <!-- 引用边连接点：被引用方右侧出（ref-src），引用方左侧入（ref-tgt），箭头朝右 = 信息流向 -->
    <Handle id="ref-src" type="source" :position="Position.Right" class="handle-ref" />
    <Handle id="ref-tgt" type="target" :position="Position.Left" class="handle-ref" />

    <div class="node-main">
      <label class="node-checkbox" @click.stop>
        <input type="checkbox" :checked="data.checked" @click="handleToggle" />
      </label>
      <User v-if="data.role === 'user'" :size="12" class="node-icon user" />
      <Sparkles v-else :size="12" class="node-icon assistant" />
      <span class="node-summary" :title="data.summary">{{ data.summary }}</span>
    </div>

    <div class="node-footer">
      <button
        v-if="data.referencesOut > 0 || data.referencesIn > 0"
        class="ref-badge"
        :title="`引用 ${data.referencesOut} / 被引用 ${data.referencesIn}`"
        @click="handleBadge"
      >
        {{ data.referencesOut }}/{{ data.referencesIn }}
      </button>
      <span v-else></span>
      <div class="footer-actions">
        <button
          v-if="data.role === 'assistant'"
          class="icon-btn"
          title="查看 Agent 链"
          @click="handleAgentChain"
        >
          <GitBranch :size="10" />
        </button>
        <button class="detail-btn" @click="handleDetail">查看详情</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chatmap-node {
  width: 200px;
  padding: 8px 10px 6px;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 10px;
  font-size: 11px;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

:root.dark .chatmap-node {
  background: #2C2C2E;
  border-color: #3A3A3C;
}

.chatmap-node:hover {
  border-color: #C7C7CC;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.chatmap-node.checked {
  border-color: #34C759;
  box-shadow: 0 2px 8px rgba(52, 199, 89, 0.15);
}

.chatmap-node.highlighted {
  border-color: #007AFF;
  box-shadow: 0 2px 10px rgba(0, 122, 255, 0.2);
}

.node-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.node-checkbox {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
}

.node-checkbox input {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: #34C759;
  cursor: pointer;
}

.node-icon {
  flex-shrink: 0;
}

.node-icon.user {
  color: #34C759;
}

.node-icon.assistant {
  color: #007AFF;
}

.node-summary {
  flex: 1;
  min-width: 0;
  color: #1D1D1F;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:root.dark .node-summary {
  color: #F5F5F7;
}

.node-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 5px;
  min-height: 16px;
}

.ref-badge {
  min-width: 30px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  border: none;
  background: rgba(0, 122, 255, 0.12);
  color: #007AFF;
  font-size: 9px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  cursor: pointer;
  transition: background 0.15s;
}

.ref-badge:hover {
  background: rgba(0, 122, 255, 0.25);
}

.detail-btn {
  border: none;
  background: none;
  padding: 0;
  color: #86868B;
  font-size: 9px;
  cursor: pointer;
  transition: color 0.15s;
}

.detail-btn:hover {
  color: #007AFF;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  display: flex;
  align-items: center;
  border: none;
  background: none;
  padding: 1px;
  color: #86868B;
  cursor: pointer;
  transition: color 0.15s;
}

.icon-btn:hover {
  color: #007AFF;
}

/* Vue Flow 连接点：缩小并淡化，不干扰节点视觉 */
.handle-seq,
.handle-ref {
  width: 5px !important;
  height: 5px !important;
  min-width: 0 !important;
  min-height: 0 !important;
  border: none !important;
  background: #C7C7CC !important;
  opacity: 0.6;
}
</style>
