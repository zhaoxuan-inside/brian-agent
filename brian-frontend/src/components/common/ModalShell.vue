<script setup lang="ts">
import { useI18nStore } from '@/stores/i18n'
/**
 * ModalShell —— 统一弹层骨架(ADR-008 令牌契约)
 * 遮罩统一 bg-black/40 backdrop-blur-[2px]、z-modal 层级、Esc 关闭、焦点圈闭(focus trap)、aria-modal。
 * 内容样式由调用方通过默认插槽决定;panelClass 可覆盖面板外观。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  /** 宽度类,默认 max-w-md */
  panelClass?: string
  /** 关闭方式:esc/backdrop 均默认开启 */
  closeOnEsc?: boolean
  closeOnBackdrop?: boolean
  /** aria-label,缺省用 title */
  label?: string
  /** 'default' 为全局默认(iOS);'chat' 仅对话页挂 Claude 主题令牌(ADR-015) */
  variant?: 'default' | 'chat'
}>(), {
  title: '',
  panelClass: 'max-w-md',
  closeOnEsc: true,
  closeOnBackdrop: true,
  label: '',
  variant: 'default',
})

const emit = defineEmits<{ (e: 'close'): void }>()

const shellRef = ref<HTMLElement | null>(null)
const i18nStore = useI18nStore()

function requestClose() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.closeOnEsc) {
    event.stopPropagation()
    requestClose()
    return
  }
  // 焦点圈闭:Tab 循环限制在弹层内
  if (event.key === 'Tab' && shellRef.value) {
    const focusables = shellRef.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}

function onBackdrop() {
  if (props.closeOnBackdrop) requestClose()
}

function lockBody(lock: boolean) {
  document.body.style.overflow = lock ? 'hidden' : ''
}

watch(() => props.open, async (open) => {
  lockBody(open)
  if (open) {
    await nextTick()
    const target = shellRef.value?.querySelector<HTMLElement>('input, textarea, button')
    target?.focus()
  }
})

onMounted(() => lockBody(props.open))
onBeforeUnmount(() => lockBody(false))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-modal flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-[2px]"
        :class="{ 'theme-chat': props.variant === 'chat' }"
        role="dialog"
        aria-modal="true"
        :aria-label="label || title || '对话框'"
        @keydown="onKeydown"
      >
        <div class="absolute inset-0" @click="onBackdrop" />
        <Transition
          appear
          enter-active-class="transition duration-200 ease-ios"
          enter-from-class="opacity-0 scale-95 translate-y-2"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            ref="shellRef"
            class="relative flex flex-col w-full max-w-[calc(100vw-2rem)] max-h-[85vh] animate-pop-in"
            :class="[
              props.variant === 'chat'
                ? 'bg-chat-surface-1 rounded-chat-lg border border-chat-hairline-strong shadow-[0_24px_64px_rgba(0,0,0,0.55)]'
                : 'bg-white dark:bg-apple-gray-800 rounded-2xl shadow-lift dark:shadow-lift-dark border border-apple-gray-200/60 dark:border-apple-gray-700/60',
              panelClass,
            ]"
          >
            <header v-if="title" class="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-2">
              <h2 class="text-[15px] font-semibold tracking-tight" :class="props.variant === 'chat' ? 'text-chat-ink' : ''">{{ title }}</h2>
              <button
                type="button"
                :class="props.variant === 'chat'
                  ? 'p-2 rounded-chat-md text-chat-ink-tertiary hover:text-chat-ink hover:bg-chat-surface-2 transition-colors'
                  : 'icon-btn'"
                :aria-label="i18nStore.t('common.close')"
                @click="requestClose"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </header>
            <div class="flex-1 min-h-0 px-5 pb-5 overflow-y-auto">
              <slot />
            </div>
            <footer v-if="$slots.footer" class="flex-shrink-0 flex items-center justify-end gap-2 px-5 pb-5 pt-1">
              <slot name="footer" />
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
