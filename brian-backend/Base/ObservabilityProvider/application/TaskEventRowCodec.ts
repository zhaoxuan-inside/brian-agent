import { parsePayload, makeTaskEvent, type EventRef, type EventSpan, type TaskEvent } from '@brian-agent/shared';
import type { TaskEventRow } from '../domain/types';

/** task_event_record 行 → TaskEvent（历史重放读侧的唯一解码口） */
export function toTaskEvent(row: TaskEventRow): TaskEvent {
  return makeTaskEvent({
    seq: row.seq,
    ts: row.ts,
    type: row.event_type,
    payload: parsePayload(row.event_type, safeJson(row.payload_json)),
    agent_id: row.agent_id || undefined,
    round: row.round ?? undefined,
    span: safeJson(row.span_json) as EventSpan | undefined,
    ref: safeJson(row.ref_json) as EventRef | undefined,
  }).valueOf() as TaskEvent;
}

/** 会话归属（供重放接口回填 session_id） */
export function withSession(ev: TaskEvent, sessionId: string, runId: string, workId: string): TaskEvent {
  return { ...ev, session_id: sessionId, run_id: runId, work_id: workId };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}
