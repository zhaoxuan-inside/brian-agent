/**
 * 分 kind 事件归约（每函数 ≤30 行）+ 时间线标题生成。
 * payload 均为服务端已 parsePayload 的宽松对象，读取时做防御式取值。
 */
import type { TaskEvent } from './task-event'
import { TaskEventType as T } from './task-event'
import type { RunObservation } from './task-reducer'
import { arr, bool, num, pl, pushPointOf as pushPoint, str, type P } from './task-reduce-util'

const p = pl

// ── lifecycle ──────────────────────────────────────────────

export function reduceLifecycle(obs: RunObservation, ev: TaskEvent): void {
  switch (ev.type) {
    case T.RunAccepted:
      obs.summary.startedTs = ev.ts
      pushPoint(obs, ev, { type: ev.type, kind: 'lifecycle', title: '开始受理请求', detail: `run ${ev.run_id.slice(0, 8)}`, target: '' })
      break
    case T.RunStarted: reduceRunStarted(obs, ev); break
    case T.RunFinished: reduceRunFinished(obs, ev); break
    case T.RunFailed:
      obs.phase = 'failed'
      obs.stopReason = str(p(ev).stop_reason, 'error')
      obs.error = str(p(ev).error, obs.stopReason)
      obs.thinking.active = false
      pushPoint(obs, ev, { type: ev.type, kind: 'lifecycle-fail', title: '执行失败', detail: obs.error, target: '' })
      break
    case T.LoopTurnStarted: reduceTurnStarted(obs, ev); break
    case T.LoopTurnResult: reduceTurnResult(obs, ev); break
    case T.LoopTurnCompleted: reduceTurnCompleted(obs, ev); break
    case T.IntentStarted:
      pushPoint(obs, ev, { type: ev.type, kind: 'intent', title: '需求确认 / 意图分析中…', detail: num(p(ev).candidates_count) ? `候选 ${num(p(ev).candidates_count)} 个 Agent` : '', target: 'agent-0' })
      break
    case T.IntentAnalyzed: reduceIntentAnalyzed(obs, ev); break
    case T.RunMerge: reduceRunMerge(obs, ev); break
    default: break
  }
}

function reduceRunStarted(obs: RunObservation, ev: TaskEvent): void {
  obs.phase = 'assembling'
  obs.summary.agentId = str(p(ev).agent_id) || obs.summary.agentId
  obs.summary.agentName = str(p(ev).agent_name) || obs.summary.agentName
  pushPoint(obs, ev, { type: ev.type, kind: 'lifecycle', title: '开始执行', detail: str(p(ev).agent_name) || str(p(ev).agent_id), target: '' })
}

function reduceRunFinished(obs: RunObservation, ev: TaskEvent): void {
  obs.phase = 'settled'
  obs.summary.settledTs = ev.ts
  obs.stopReason = str(p(ev).stop_reason, 'stop')
  obs.thinking.active = false
  pushPoint(obs, ev, { type: ev.type, kind: 'lifecycle-ok', title: '执行完成', detail: obs.stopReason, target: '' })
}

function reduceTurnStarted(obs: RunObservation, ev: TaskEvent): void {
  const round = num(p(ev).round, obs.round + 1)
  obs.phase = 'reasoning'
  obs.round = round
  obs.thinking.active = true
  const mode = str(p(ev).thought_mode) || obs.summary.thoughtMode || ''
  obs.summary.thoughtMode = mode || obs.summary.thoughtMode
  obs.thinking.rounds.push({ round, text: '', startedTs: ev.ts, thoughtMode: mode })
  pushPoint(obs, ev, {
    type: ev.type, kind: 'think', target: 'agent-0',
    title: `第 ${round} 轮 Agent 执行开始`,
    detail: mode ? `思维模型：${mode}${bool(p(ev).final_turn) ? '（收尾轮）' : ''}` : '',
  })
}

const NEXT_ACTION_TITLE: Record<string, string> = { continue: '继续执行', stop: '执行收敛', error: '执行失败', budget: '预算耗尽' }

function reduceTurnResult(obs: RunObservation, ev: TaskEvent): void {
  const round = num(p(ev).round, obs.round)
  const nextAction = str(p(ev).next_action, 'stop')
  const reason = str(p(ev).decision_reason)
  const preview = str(p(ev).result_preview)
  const cur = obs.thinking.rounds.find((r) => r.round === round)
  if (cur) {
    cur.finishReason = str(p(ev).finish_reason)
    cur.nextAction = nextAction
    cur.text += `[第 ${round} 轮结果] finish_reason=${cur.finishReason || 'none'}`
      + `${preview ? `\n产出：${preview.slice(0, 200)}` : ''}`
      + `\n[继续执行] ${NEXT_ACTION_TITLE[nextAction] ?? nextAction}${reason ? `：${reason.slice(0, 200)}` : ''}\n`
  }
  pushPoint(obs, ev, {
    type: ev.type, kind: nextAction === 'error' ? 'lifecycle-fail' : nextAction === 'continue' ? 'think' : 'lifecycle-ok',
    title: `第 ${round} 轮完成：${NEXT_ACTION_TITLE[nextAction] ?? nextAction}`,
    detail: reason.slice(0, 120) || preview.slice(0, 80), target: 'agent-0',
  })
}

function reduceTurnCompleted(obs: RunObservation, ev: TaskEvent): void {
  const round = num(p(ev).round, obs.round)
  const cur = obs.thinking.rounds.find((r) => r.round === round)
  if (cur && cur.durationMs === undefined) cur.durationMs = Math.max(0, ev.ts - cur.startedTs)
}

function reduceIntentAnalyzed(obs: RunObservation, ev: TaskEvent): void {
  const adopted = bool(p(ev).adopted)
  pushPoint(obs, ev, {
    type: ev.type, kind: 'intent', target: 'agent-0',
    title: `意图分析：打分 ${num(p(ev).score)}（${adopted ? '采纳' : '未达阈值'}）`,
    detail: str(p(ev).reason).slice(0, 200) || str(p(ev).agent_name), elapsedMs: undefined,
  })
}

function reduceRunMerge(obs: RunObservation, ev: TaskEvent): void {
  const children = (Array.isArray(p(ev).children) ? p(ev).children : []) as P[]
  obs.merge = {
    children: children.map((c) => ({
      subRunId: str(c.sub_run_id), agentName: str(c.agent_name, '子代理'),
      task: str(c.task), output: str(c.output), status: str(c.status), durationMs: num(c.duration_ms) || undefined,
    })),
  }
  pushPoint(obs, ev, { type: ev.type, kind: 'lifecycle-ok', title: `子任务汇聚：${children.length} 个`, detail: '', target: 'agent-0' })
}
