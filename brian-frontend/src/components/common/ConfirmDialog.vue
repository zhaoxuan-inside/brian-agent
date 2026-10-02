<script setup lang="ts">
/**
 * ConfirmDialog —— 统一确认弹窗(基于 ModalShell)
 * 替代各页逐字重复的"确认删除"骨架;intent=danger 时主按钮为 btn-danger。
 * variant='chat' 仅对话页挂载 Claude 主题令牌(ADR-015),默认 default 不影响其他页。
 */
import ModalShell from './ModalShell.vue'
import { useI18nStore } from '@/stores/i18n'

const i18nStore = useI18nStore()

withDefaults(defineProps<{
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  /** danger=红色主按钮;primary=蓝色主按钮 */
  intent?: 'danger' | 'primary'
  variant?: 'default' | 'chat'
}>(), {
  title: '',
  confirmText: '',
  cancelText: '',
  intent: 'danger',
  variant: 'default',
})

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()
</script>

<template>
  <ModalShell
    :open="open"
    :title="title"
    panel-class="max-w-sm"
    :label="title || message"
    :variant="variant"
    @close="emit('cancel')"
  >
    <p class="text-sm leading-relaxed" :class="variant === 'chat' ? 'text-chat-ink-muted' : 'text-apple-gray-600 dark:text-apple-gray-300'">{{ message }}</p>
    <template #footer>
      <button
        type="button"
        class="text-sm font-medium transition-colors"
        :class="variant === 'chat'
          ? 'px-4 py-2 rounded-chat-md bg-chat-surface-2 border border-chat-hairline text-chat-ink hover:border-chat-hairline-strong'
          : 'btn-secondary text-sm'"
        @click="emit('cancel')"
      >{{ cancelText || i18nStore.t('common.cancel') }}</button>
      <button
        type="button"
        class="text-sm font-medium transition-colors"
        :class="variant === 'chat'
          ? (intent === 'danger'
              ? 'px-4 py-2 rounded-chat-md bg-chat-error text-white hover:bg-chat-error/90'
              : 'px-4 py-2 rounded-chat-md bg-chat-primary text-chat-on-primary hover:bg-chat-primary-hover')
          : (intent === 'danger' ? 'btn-danger' : 'btn-primary')"
        @click="emit('confirm')"
      >{{ confirmText || (intent === 'danger' ? i18nStore.t('common.delete') : i18nStore.t('common.confirm')) }}</button>
    </template>
  </ModalShell>
</template>
