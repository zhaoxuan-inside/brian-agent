import { describe, it, expect } from 'vitest'
import {
  replayObservation, makeTaskEvent, usageStageLabel, usageStageRank,
  type TaskEvent, type UsageStage,
} from '@brian-agent/shared'
import { buildUsageBars } from '@/composables/useObservationPresentation'
import { observationPhaseLabel, observationToneOf } from '@/composables/observationPhase'

/**
 * 观测摘要四态终态（stop_reason）与分阶段用量聚合（token/耗时分布条）。
 * reducer 走 shared replayObservation（与历史重放/实时叠加同一入口）。
 */
let seq = 0
function evOf(type: string, payload: Record<string, unknown>, ts = 1000): TaskEvent {
  seq += 1
  return makeTaskEvent({ seq, ts, session_id: 's-test', run_id: 'r-test', work_id: 'w-test', type, payload })
}

function llmEv(caller: string, tokensIn: number, tokensOut: number, durationMs: number, ts = 1000): TaskEvent {
  return evOf('llm.invoked', { caller, input_tokens: tokensIn, output_tokens: tokensOut, duration_ms: durationMs }, ts)
}

describe('四态终态：run.finished / run.failed(stop_reason)', () => {
  it('run.finished → 已完成（success）', () => {
    const obs = replayObservation([
      evOf('run.accepted', {}),
      evOf('run.finished', { stop_reason: 'stop' }, 2000),
    ])
    expect(obs?.phase).toBe('settled')
    expect(observationPhaseLabel(obs)).toBe('已完成')
    expect(observationToneOf(obs, false)).toBe('success')
  })

  it('run.failed aborted → 已中断（warning）', () => {
    const obs = replayObservation([
      evOf('run.accepted', {}),
      evOf('run.failed', { stop_reason: 'aborted' }, 2000),
    ])
    expect(obs?.phase).toBe('failed')
    expect(obs?.stopReason).toBe('aborted')
    expect(observationPhaseLabel(obs)).toBe('已中断')
    expect(observationToneOf(obs, false)).toBe('warning')
  })

  it('run.failed budget → 预算耗尽（warning）；error → 执行失败（error）', () => {
    const budget = replayObservation([evOf('run.failed', { stop_reason: 'budget' })])
    expect(observationPhaseLabel(budget)).toBe('预算耗尽')
    expect(observationToneOf(budget, false)).toBe('warning')
    const errored = replayObservation([evOf('run.failed', { stop_reason: 'error', error: 'boom' })])
    expect(observationPhaseLabel(errored)).toBe('执行失败')
    expect(observationToneOf(errored, false)).toBe('error')
    expect(errored?.error).toBe('boom')
  })

  it('run.failed 缺 stop_reason 时回退 error 文案', () => {
    const obs = replayObservation([evOf('run.failed', {})])
    expect(observationPhaseLabel(obs)).toBe('执行失败')
  })
})

describe('分阶段用量聚合：llm.invoked 按 caller 归组', () => {
  it('多 caller 累计正确、顺序按固定阶段序、总量与 summary 一致', () => {
    const obs = replayObservation([
      llmEv('AgentDefService.matchAgentDef', 100, 10, 500, 1000),
      llmEv('AgentLoopService.callLLMTurn', 1000, 200, 3000, 2000),
      llmEv('AgentLoopService.callLLMTurn', 800, 150, 2500, 3000),
      llmEv('WriterAgent.execWrite', 600, 900, 4000, 4000),
    ])
    const stages = obs?.usageStages ?? []
    expect(stages.map((s) => s.label)).toEqual(['组件选举', '主循环问答', '写作排版'])
    expect(stages[0]).toMatchObject({ tokensIn: 100, tokensOut: 10, durationMs: 500, calls: 1 })
    expect(stages[1]).toMatchObject({ tokensIn: 1800, tokensOut: 350, durationMs: 5500, calls: 2 })
    expect(stages[2]).toMatchObject({ tokensIn: 600, tokensOut: 900, durationMs: 4000, calls: 1 })
    expect(obs?.summary.tokensIn).toBe(2500)
    expect(obs?.summary.tokensOut).toBe(1260)
  })

  it('未知 caller 归入其他调用，展示层排序后移到末尾', () => {
    expect(usageStageLabel('SomeoneElse.doThing')).toBe('其他调用')
    const obs = replayObservation([
      llmEv('SomeoneElse.doThing', 1, 1, 10),
      llmEv('AgentLoopService.callLLMTurn', 2, 2, 20),
    ])
    expect(obs?.usageStages.map((s) => s.label)).toEqual(['其他调用', '主循环问答'])
    expect(usageStageRank('其他调用')).toBeGreaterThan(usageStageRank('主循环问答'))
    expect(buildUsageBars(obs?.usageStages ?? [])[0].segments.map((s) => s.label))
      .toEqual(['主循环问答', '其他调用'])
  })
})

describe('分布条视图模型 buildUsageBars', () => {
  const stages: UsageStage[] = [
    { label: '主循环问答', tokensIn: 1800, tokensOut: 200, durationMs: 5000, calls: 2 },
    { label: '组件选举', tokensIn: 100, tokensOut: 0, durationMs: 1000, calls: 1 },
  ]

  it('token 条与耗时条分段占比合计 100%，含其他段', () => {
    const bars = buildUsageBars(stages, 10000)
    expect(bars.map((b) => b.key)).toEqual(['tokens', 'duration'])
    const tokenSegs = bars[0].segments
    expect(tokenSegs.map((s) => s.label)).toEqual(['组件选举', '主循环问答'])
    expect(tokenSegs.reduce((sum, s) => sum + s.pct, 0)).toBeCloseTo(100)
    const durationSegs = bars[1].segments
    expect(durationSegs.at(-1)?.label).toBe('其他')
    expect(durationSegs.reduce((sum, s) => sum + s.pct, 0)).toBeCloseTo(100)
    expect(durationSegs.at(-1)?.title).toContain('4.0s')
  })

  it('无总耗时不生成其他段；空/零数据不生成条', () => {
    const bars = buildUsageBars(stages)
    expect(bars[1].segments.some((s) => s.label === '其他')).toBe(false)
    expect(bars[1].segments.reduce((sum, s) => sum + s.pct, 0)).toBeCloseTo(100)
    expect(buildUsageBars([])).toEqual([])
    expect(buildUsageBars([{ label: '主循环问答', tokensIn: 0, tokensOut: 0, durationMs: 0, calls: 1 }])).toEqual([])
  })
})
