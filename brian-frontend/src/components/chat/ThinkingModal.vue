<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { Brain, Loader2, X } from '@lucide/vue'
import { useChatUiStore } from '@/stores/chatUi'
import { useObservationSummary } from '@/composables/useObservationSummary'
import { type ObservationTone } from '@/composables/observationPhase'
import ObservationView from './ObservationView.vue'

/**
 * 思考弹窗外壳（ADR-013）：genie 动画 + 头部 + ObservationView。
 * 实时与历史共用同一数据源（chatUi.observation），本组件不含业务数据处理。
 */
const chatUi = useChatUiStore()
const summary = useObservationSummary()

const visible = computed(() => chatUi.thinkingModalVisible)
const targetMsgId = computed(() => chatUi.thinkingTargetMsgId)
const isReplay = computed(() => !!targetMsgId.value)
const headerTitle = computed(() => (isReplay.value ? '思考过程' : '任务思考与执行实时推演'))

const PILL_CLASS: Record<ObservationTone, string> = {
  live: 'bg-chat-primary/10 text-chat-primary-hover',
  success: 'bg-chat-success/10 text-chat-success',
  error: 'bg-chat-error/10 text-chat-error',
  warning: 'bg-chat-warning/10 text-chat-warning',
}
const pillClass = computed(() => PILL_CLASS[summary.value.tone])

function close() {
  chatUi.closeThinkingModal()
}

function onAfterLeave() {
  chatUi.cleanupThinkingModal()
}

// ── genie 动画（样式行为，保持原有交互不变） ──
interface GenieTarget { dx: number; dy: number; s: number }

function getCardEl(overlay: Element): HTMLElement | null {
  return overlay.querySelector('.thinking-card')
}

function genieTarget(cardRect: DOMRect): GenieTarget | null {
  const o = chatUi.thinkingOrigin
  if (!o || !cardRect.width || !cardRect.height) return null
  const cx = cardRect.left + cardRect.width / 2
  const cy = cardRect.top + cardRect.height / 2
  const s = Math.max(0.04, Math.min(0.22, o.width / cardRect.width, o.height / cardRect.height))
  return { dx: o.left + o.width / 2 - cx, dy: o.top + o.height / 2 - cy, s }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const liveAnims = new Set<Animation>()
let animToken = 0
function trackAnim(a: Animation): Animation {
  liveAnims.add(a)
  a.finished.catch(() => undefined).finally(() => { liveAnims.delete(a) })
  return a
}
function cancelAnims() {
  liveAnims.forEach((a) => { try { a.cancel() } catch { /* ignore */ } })
  liveAnims.clear()
}
function playAnims(anims: Animation[], done: () => void, timeoutMs: number, cleanup: () => void) {
  cancelAnims()
  const token = ++animToken
  let settled = false
  const finish = () => {
    if (settled || token !== animToken) return
    settled = true
    cleanup()
    done()
  }
  anims.forEach(trackAnim)
  Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(finish)
  setTimeout(finish, timeoutMs)
}

function onGenieBeforeEnter(overlay: Element) {
  const oEl = overlay as HTMLElement
  oEl.style.opacity = '0'
  const card = getCardEl(overlay)
  if (card) card.style.opacity = '0'
}

function onGenieEnter(overlay: Element, done: () => void) {
  const oEl = overlay as HTMLElement
  const card = getCardEl(overlay)
  if (!card || prefersReducedMotion() || typeof oEl.animate !== 'function') {
    oEl.style.opacity = ''
    if (card) card.style.opacity = ''
    done()
    return
  }
  const target = genieTarget(card.getBoundingClientRect())
  const oAnim = oEl.animate(
    [
      { opacity: 0, backdropFilter: 'blur(0px)' },
      { opacity: 1, backdropFilter: 'blur(4px)' },
    ],
    { duration: 320, easing: 'ease-out', fill: 'both' },
  )
  const cAnim = target
    ? card.animate(
        [
          { opacity: 0, transform: `translate(${target.dx}px, ${target.dy}px) scale(${target.s})` },
          { opacity: 1, transform: 'translate(0, 0) scale(1)' },
        ],
        { duration: 340, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
      )
    : card.animate(
        [
          { opacity: 0, transform: 'scale(0.96)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 240, easing: 'ease-out', fill: 'both' },
      )
  playAnims([oAnim, cAnim], done, 400, () => {})
}

function onGenieLeave(overlay: Element, done: () => void) {
  const oEl = overlay as HTMLElement
  const card = getCardEl(overlay)
  if (!card || prefersReducedMotion() || typeof oEl.animate !== 'function') {
    done()
    return
  }
  const target = genieTarget(card.getBoundingClientRect())
  const oAnim = oEl.animate(
    [
      { opacity: 1, backdropFilter: 'blur(4px)' },
      { opacity: 0, backdropFilter: 'blur(0px)' },
    ],
    { duration: 260, easing: 'ease-in', fill: 'both' },
  )
  const cAnim = target
    ? card.animate(
        [
          { opacity: 1, transform: 'translate(0, 0) scale(1)' },
          { opacity: 0, transform: `translate(${target.dx}px, ${target.dy}px) scale(${target.s})` },
        ],
        { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' },
      )
    : card.animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.96)' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' },
      )
  playAnims([oAnim, cAnim], done, 450, () => cancelAnims())
}

function onGenieCancelled() {
  animToken++
  cancelAnims()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      :css="false"
      @before-enter="onGenieBeforeEnter"
      @enter="onGenieEnter"
      @enter-cancelled="onGenieCancelled"
      @leave="onGenieLeave"
      @leave-cancelled="onGenieCancelled"
      @after-leave="onAfterLeave"
    >
      <div
        v-if="visible"
        class="thinking-overlay fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-[2px] theme-chat"
        @click.self="close"
      >
        <div
          class="thinking-card bg-chat-surface-1 rounded-chat-lg shadow-[0_24px_64px_rgba(0,0,0,0.55)] border border-chat-hairline-strong w-full max-w-4xl mx-4 overflow-hidden flex flex-col h-[min(88vh,760px)]"
        >
          <div class="px-5 py-3.5 border-b border-chat-hairline flex items-center justify-between flex-shrink-0">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-7 h-7 rounded-full bg-chat-primary/15 text-chat-primary-hover flex items-center justify-center flex-shrink-0">
                <Brain :size="15" />
              </span>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="text-[15px] font-semibold tracking-tight text-chat-ink">{{ headerTitle }}</h3>
                  <Loader2 v-if="summary.streaming" :size="13" class="animate-spin text-chat-primary-hover" />
                  <span
                    v-else
                    class="px-1.5 py-0.5 rounded-chat-pill text-4xs font-medium"
                    :class="pillClass"
                  >
                    {{ summary.phaseLabel }}
                  </span>
                </div>
                <p v-if="!isReplay" class="text-2xs text-chat-ink-tertiary truncate">
                  各环节随执行实时更新，数据与结束后回放完全一致
                </p>
              </div>
            </div>
            <button
              class="p-1.5 rounded-chat-md text-chat-ink-tertiary hover:text-chat-ink hover:bg-chat-surface-2 transition-colors flex-shrink-0"
              title="关闭 (Esc)"
              @click="close"
            >
              <X :size="18" />
            </button>
          </div>

          <ObservationView />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.thinking-card {
  will-change: opacity, transform, filter;
}
</style>
