<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../stores/session'

const sessionStore = useSessionStore()
const isDragging = ref(false)
const isHovering = ref(false)

function onMouseDown(e: MouseEvent) {
  e.preventDefault()
  isDragging.value = true
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  const container = (e.target as HTMLElement).closest('.chat-area-container') as HTMLElement
  if (!container) return
  const rect = container.getBoundingClientRect()
  const ratio = ((e.clientX - rect.left) / rect.width) * 100
  const clamped = Math.max(30, Math.min(70, ratio))
  sessionStore.setSplitRatio(Math.round(clamped))
}

function onMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <div
    class="resizable-divider"
    :class="{ 'is-dragging': isDragging, 'is-hovering': isHovering }"
    @mousedown="onMouseDown"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
  />
</template>

<style scoped>
.resizable-divider {
  width: 6px;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  background: transparent;
  transition: background 0.2s;
  margin: 0 -3px;
  z-index: 1;
}

.resizable-divider::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  background: transparent;
  transition: background 0.2s;
}

.resizable-divider.is-hovering::after {
  background: #D1D1D6;
}

:root.dark .resizable-divider.is-hovering::after {
  background: #48484A;
}

.resizable-divider.is-dragging::after {
  background: #007AFF;
  width: 2px;
}
</style>