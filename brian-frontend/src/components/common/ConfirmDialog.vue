<script setup lang="ts">
/**
 * ConfirmDialog —— 统一确认弹窗(基于 ModalShell)
 * 替代各页逐字重复的"确认删除"骨架;intent=danger 时主按钮为 btn-danger。
 */
import ModalShell from './ModalShell.vue'

withDefaults(defineProps<{
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  /** danger=红色主按钮;primary=蓝色主按钮 */
  intent?: 'danger' | 'primary'
}>(), {
  title: '',
  confirmText: '确认',
  cancelText: '取消',
  intent: 'danger',
})

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()
</script>

<template>
  <ModalShell
    :open="open"
    :title="title"
    panel-class="max-w-sm"
    :label="title || message"
    @close="emit('cancel')"
  >
    <p class="text-sm text-apple-gray-600 dark:text-apple-gray-300 leading-relaxed">{{ message }}</p>
    <template #footer>
      <button type="button" class="btn-secondary text-sm" @click="emit('cancel')">{{ cancelText }}</button>
      <button
        type="button"
        class="text-sm font-medium text-white rounded-xl transition-colors"
        :class="intent === 'danger' ? 'btn-danger' : 'btn-primary'"
        @click="emit('confirm')"
      >{{ confirmText }}</button>
    </template>
  </ModalShell>
</template>
