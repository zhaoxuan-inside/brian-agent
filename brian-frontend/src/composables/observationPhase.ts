import type { RunObservation } from '@brian-agent/shared'

/**
 * 观测终态四态口径（stop_reason 区分）：成功 settled / 失败 error / 中断 aborted / 预算耗尽 budget。
 * 弹窗头部胶囊、摘要标签、时间线共用本映射，禁止再散落第二份 phase 字典。
 */
export type ObservationTone = 'live' | 'success' | 'error' | 'warning'

const PHASE_LABELS: Record<string, string> = {
  accepted: '受理中',
  assembling: '组装中',
  reasoning: '推理中',
  acting: '执行技能',
  writing: '写作排版',
  evaluating: '评估中',
  settled: '已完成',
}

export function observationPhaseLabel(obs: RunObservation | null): string {
  const phase = obs?.phase ?? ''
  if (phase === 'failed') return failedLabelOf(obs?.stopReason ?? '')
  return PHASE_LABELS[phase] ?? '等待开始'
}

export function observationToneOf(obs: RunObservation | null, streaming: boolean): ObservationTone {
  if (streaming) return 'live'
  if (obs?.phase === 'settled') return 'success'
  if (obs?.phase === 'failed') return obs.stopReason === 'error' ? 'error' : 'warning'
  return 'live'
}

function failedLabelOf(stopReason: string): string {
  if (stopReason === 'aborted') return '已中断'
  if (stopReason === 'budget') return '预算耗尽'
  return '执行失败'
}
