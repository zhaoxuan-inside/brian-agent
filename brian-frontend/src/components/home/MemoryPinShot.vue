<script setup lang="ts">
import { ref } from 'vue'
import { Brain, User, Pin, Gauge, Copy, ChevronDown } from '@lucide/vue'
import { useOnceVisible } from '@/composables/useOnceVisible'

// MemoryPinShot：首页「Memory Pin」动态示意——
// 钉住的消息卡片右上角 Pin 图标持续红色高亮脉冲，替代原静态截图 memory-pin.png。

const rootEl = ref<Element | null>(null)
const entered = ref(false)
useOnceVisible(rootEl, () => { entered.value = true }, 0.3)
</script>

<template>
  <div ref="rootEl" class="select-none" :class="{ on: entered }" role="img" aria-label="Memory Pin 示意：把关键消息钉住，每轮对话都生效">
    <div class="bg-[#17171A] px-4 py-5 space-y-4 text-left">
      <!-- 被钉住的用户消息 -->
      <div class="mp-msg flex items-start gap-2" style="animation-delay: 0.1s">
        <span class="mp-avatar"><User :size="11" /></span>
        <div class="mp-card relative flex-1 max-w-[88%]">
          <div class="flex items-center text-[9.5px] text-apple-gray-500">
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
          <p class="text-[12px] font-semibold text-apple-gray-100">回复的内容不要啰嗦</p>
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

      <!-- 钉住后生效的 AI 回复 -->
      <div class="mp-msg flex items-start gap-2 justify-end" style="animation-delay: 0.45s">
        <div class="mp-card w-[86%]">
          <div class="flex items-center text-[9.5px] text-apple-gray-500">
            13:48
            <span class="ml-auto flex items-center gap-2">
              <i class="mp-check" />
              <Pin :size="11" class="text-apple-gray-600" />
            </span>
          </div>
          <p class="mp-fold">▸ 摘要</p>
          <p class="mp-fold">▾ 原文</p>
          <p class="text-[12px] font-semibold text-apple-gray-100">北京今日（8月27日）游玩推荐</p>
          <p class="mt-1 text-[10.5px] leading-[1.6] text-apple-gray-300">
            今日北京多云转小雨，适合优先安排室内或半户外活动，下午 4 点后建议全部转入室内。
          </p>
          <p class="mt-1 text-[10.5px] leading-[1.6] text-apple-gray-300">推荐方案</p>
          <p class="mt-1 text-[10.5px] leading-[1.6] text-apple-gray-500">回复简洁直接，不重复已知信息，按「推荐方案」分点给出。</p>
        </div>
        <span class="mp-avatar mp-avatar-ai"><Brain :size="11" /></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mp-msg { opacity: 0; }
.on .mp-msg { animation: mp-up 0.6s ease forwards; }
.mp-avatar { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: rgba(10, 132, 255, 0.18); color: #6DB2FF; display: grid; place-items: center; }
.mp-avatar-ai { background: rgba(175, 82, 222, 0.2); color: #C77DFF; }
.mp-card { background: #232327; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 9px 11px; }
.mp-check { display: inline-block; width: 9px; height: 9px; border: 1px solid #5A5A5F; border-radius: 2px; }
.mp-ring { position: absolute; inset: -2px -3px; border: 1.5px solid rgba(255, 69, 58, 0.9); border-radius: 5px; animation: mp-pulse 1.8s ease-in-out infinite; }
.mp-fold { font-size: 9px; color: #6E6E73; margin: 2px 0; }
.mp-chips { display: flex; align-items: center; gap: 4px; margin-top: 5px; flex-wrap: wrap; }
.mp-chip { display: inline-flex; align-items: center; gap: 2px; padding: 1.5px 6px; border-radius: 999px; font-size: 9px; }
.mp-chip.blue { background: rgba(10, 132, 255, 0.14); color: #6DB2FF; }
.mp-chip.gray { background: rgba(255, 255, 255, 0.08); color: #B8B8BD; }
.mp-chip.amber { background: rgba(255, 159, 10, 0.14); color: #FFB84D; }
.mp-plain { font-size: 9px; color: #6E6E73; }

@keyframes mp-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes mp-pulse { 0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(255, 69, 58, 0.5); } 50% { opacity: 0.35; box-shadow: 0 0 1px rgba(255, 69, 58, 0.2); } }

@media (prefers-reduced-motion: reduce) {
  .on .mp-msg, .mp-msg { opacity: 1; animation: none; }
  .mp-ring { animation: none; }
}
</style>
