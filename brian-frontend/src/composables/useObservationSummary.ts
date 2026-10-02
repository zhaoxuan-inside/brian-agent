import { computed, type ComputedRef } from 'vue'
import { useChatUiStore } from '@/stores/chatUi'
import type { RunObservation } from '@brian-agent/shared'
import { observationPhaseLabel, observationToneOf, type ObservationTone } from './observationPhase'

/** 观测摘要（流式胶囊与弹窗头部共用，ADR-013） */
export interface ObservationSummary {
  streaming: boolean
  phaseLabel: string
  pillText: string
  tone: ObservationTone
  tokens: number
  toolCalls: number
  rounds: number
}

export function useObservationSummary(): ComputedRef<ObservationSummary> {
  const chatUi = useChatUiStore()

  return computed<ObservationSummary>(() => {
    const obs: RunObservation | null = chatUi.observation
    const streaming = chatUi.isLive || chatUi.overallStreaming
    const tokens = (obs?.summary.tokensIn ?? 0) + (obs?.summary.tokensOut ?? 0)
    const rounds = obs?.thinking.rounds.length ?? 0
    const phaseLabel = observationPhaseLabel(obs)
    return {
      streaming,
      phaseLabel,
      pillText: streaming ? `${phaseLabel}…` : '思考过程',
      tone: observationToneOf(obs, streaming),
      tokens,
      toolCalls: obs?.summary.toolCalls ?? 0,
      rounds,
    }
  })
}
