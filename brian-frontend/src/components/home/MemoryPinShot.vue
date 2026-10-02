<script setup lang="ts">
import { ref } from 'vue'
import { Brain, User, Pin, Gauge, Copy, ChevronDown } from '@lucide/vue'
import { useOnceVisible } from '@/composables/useOnceVisible'

const rootEl = ref<Element | null>(null)
const entered = ref(false)
useOnceVisible(rootEl, () => { entered.value = true }, 0.3)
</script>

<template>
  <div ref="rootEl" class="theme-chat select-none" :class="{ on: entered }" role="img" aria-label="Memory Pin 示意：把关键消息钉住，每轮对话都生效">
    <div class="bg-chat-canvas px-4 py-5 space-y-4 text-left">
      <div class="mp-msg flex items-start gap-2" style="animation-delay: 0.1s">
        <span class="mp-avatar"><User :size="11" /></span>
        <div class="mp-card relative flex-1 max-w-[88%]">
          <div class="flex items-center text-[9.5px] text-chat-ink-tertiary">
            13:47
            <span class="ml-auto flex items-center gap-2">
              <i class="mp-check" />
              <span class="relative inline-flex p-0.5">
                <Pin :size="12" class="text-warning-orange" />
                <i class="mp-ring" />
              </span>
            </span>
          </div>
          <p class="mp-fold">▸ 摘要</p>
          <p class="mp-fold">▾ 原文</p>
          <p class="text-xs font-semibold text-chat-ink">回复的内容不要啰嗦</p>
          <div class="mp-chips">
            <span class="mp-chip blue">引用 0 <ChevronDown :size="8" class="inline" /></span>
            <span class="mp-chip gray">被引用 1 <ChevronDown :size="8" class="inline" /></span>
            <span class="mp-chip blue"><Brain :size="8" class="inline" /> 思考过程</span>
            <span class="mp-chip amber"><Gauge :size="8" class="inline" /> 评估结果</span>
            <span class="mp-plain"><Copy :size="8" class="inline" /> 复制 TraceId</span>
            <span class="mp-plain">9字</span>
          </div>
        </div>
      </div>

      <div class="mp-msg flex items-start gap-2 justify-end" style="animation-delay: 0.45s">
        <div class="mp-card w-[86%]">
          <div class="flex items-center text-[9.5px] text-chat-ink-tertiary">
            13:48
            <span class="ml-auto flex items-center gap-2">
              <i class="mp-check" />
              <Pin :size="11" class="text-chat-ink-tertiary" />
            </span>
          </div>
          <p class="mp-fold">▸ 摘要</p>
          <p class="mp-fold">▾ 原文</p>
          <p class="text-xs font-semibold text-chat-ink">北京今日（8月27日）游玩推荐</p>
          <p class="mt-1 text-4xs leading-[1.6] text-chat-ink-subtle">
            今日北京多云转小雨，适合优先安排室内或半户外活动，下午 4 点后建议全部转入室内。
          </p>
          <p class="mt-1 text-4xs leading-[1.6] text-chat-ink-subtle">推荐方案</p>
          <p class="mt-1 text-4xs leading-[1.6] text-chat-ink-tertiary">回复简洁直接，不重复已知信息，按「推荐方案」分点给出。</p>
        </div>
        <span class="mp-avatar mp-avatar-ai"><Brain :size="11" /></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mp-msg { opacity: 0; }
.on .mp-msg { animation: mp-up 0.6s ease forwards; }
.mp-avatar { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: rgb(var(--chat-primary) / 0.16); color: rgb(var(--chat-primary-hover)); display: grid; place-items: center; }
.mp-avatar-ai { background: rgba(175, 82, 222, 0.2); color: #C77DFF; }
.mp-card { background: rgb(var(--chat-surface-1)); border: 1px solid rgb(var(--chat-hairline)); border-radius: 10px; padding: 9px 11px; }
.mp-check { display: inline-block; width: 9px; height: 9px; border: 1px solid rgb(var(--chat-hairline-strong)); border-radius: 2px; }
.mp-ring { position: absolute; inset: -2px -3px; border: 1.5px solid rgb(var(--chat-error) / 0.9); border-radius: 5px; animation: mp-pulse 1.8s ease-in-out infinite; }
.mp-fold { font-size: 9px; color: rgb(var(--chat-ink-tertiary)); margin: 2px 0; }
.mp-chips { display: flex; align-items: center; gap: 4px; margin-top: 5px; flex-wrap: wrap; }
.mp-chip { display: inline-flex; align-items: center; gap: 2px; padding: 1.5px 6px; border-radius: 999px; font-size: 9px; }
.mp-chip.blue { background: rgb(var(--chat-primary) / 0.12); color: rgb(var(--chat-primary-hover)); }
.mp-chip.gray { background: rgb(var(--chat-ink) / 0.06); color: rgb(var(--chat-ink-subtle)); }
.mp-chip.amber { background: rgb(var(--chat-warning) / 0.12); color: rgb(var(--chat-warning)); }
.mp-plain { font-size: 9px; color: rgb(var(--chat-ink-tertiary)); }

@keyframes mp-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes mp-pulse { 0%, 100% { opacity: 1; box-shadow: 0 0 6px rgb(var(--chat-error) / 0.5); } 50% { opacity: 0.35; box-shadow: 0 0 1px rgb(var(--chat-error) / 0.2); } }

@media (prefers-reduced-motion: reduce) {
  .on .mp-msg, .mp-msg { opacity: 1; animation: none; }
  .mp-ring { animation: none; }
}
</style>
