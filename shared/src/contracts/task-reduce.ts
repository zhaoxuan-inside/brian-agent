/**
 * reduceObservation：唯一事件→视图状态入口（seq 幂等）。
 * 各 kind 的具体归约见 task-reduce-kind.ts，每函数 ≤30 行。
 */
import type { TaskEvent } from './task-event'
import { TaskEventType as T } from './task-event'
import { initialObservation, type RunObservation } from './task-reducer'
import {
  reduceLifecycle,
} from './task-reduce-kind'
import {
  reduceAssembly, reduceContext, reduceError, reduceEvalWriter,
  reduceLlm, reducePermission, reduceReply, reduceReasoning, reduceTool,
} from './task-reduce-kind2'

export function reduceObservation(prev: RunObservation | null, ev: TaskEvent): RunObservation {
  if (prev && ev.seq <= prev.lastSeq) return prev
  const obs = prev ?? initialObservation(ev)
  obs.lastSeq = ev.seq
  switch (ev.kind) {
    case 'lifecycle': reduceLifecycle(obs, ev); break
    case 'assembly': reduceAssembly(obs, ev); break
    case 'context': reduceContext(obs, ev); break
    case 'reasoning': reduceReasoning(obs, ev); break
    case 'reply': reduceReply(obs, ev); break
    case 'tool': reduceTool(obs, ev); break
    case 'llm': reduceLlm(obs, ev); break
    case 'permission': reducePermission(obs, ev); break
    case 'eval': case 'writer': reduceEvalWriter(obs, ev); break
    case 'error': reduceError(obs, ev); break
    default: break
  }
  return obs
}

/** 全量重放辅助：事件列表 → 投影（历史查询与单测共用） */
export function replayObservation(events: TaskEvent[]): RunObservation | null {
  let obs: RunObservation | null = null
  for (const ev of events) obs = reduceObservation(obs, ev)
  return obs
}

/** 时间线是否需要收录该事件（delta 流与纯计费事件不入时间线） */
export function isTimelineEvent(type: string): boolean {
  return type !== T.ThinkDelta && type !== T.ReplyDelta && type !== T.ComponentFunnel
}
