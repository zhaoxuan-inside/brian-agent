/** 归约层共用小工具（≤30 行约束下的最小函数集） */
import type { TaskEvent } from './task-event'
import type { TimelinePoint } from './task-reducer'

export type P = Record<string, unknown>

export const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
export const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
export const bool = (v: unknown): boolean => v === true
export const arr = (v: unknown): P[] => (Array.isArray(v) ? (v as P[]) : [])
export const pl = (ev: TaskEvent): P => ((ev.payload ?? {}) as P)

export function pushPointOf(
  obs: RunObservationLike, ev: TaskEvent,
  point: Omit<TimelinePoint, 'seq' | 'ts' | 'spanDepth'>,
): void {
  const prev = obs.timeline[obs.timeline.length - 1]
  const gapMs = prev ? Math.max(0, ev.ts - prev.ts) : undefined
  const { elapsedMs: explicitMs, ...rest } = point
  obs.timeline.push({
    seq: ev.seq, ts: ev.ts, spanDepth: ev.span?.depth ?? 0,
    ...rest,
    // 耗时口径：显式指定 > span 快照 > 与上一步的 ts 间隔（兜底，供无 span 事件展示）
    elapsedMs: explicitMs ?? ev.span?.total_ms ?? gapMs,
  })
}

type RunObservationLike = { timeline: TimelinePoint[] }
