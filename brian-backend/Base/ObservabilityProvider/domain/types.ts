import { Input, Output, Context } from '../../shared/base';
import type { EventRef, EventSpan } from '@brian-agent/shared';

export class ObservabilityContext extends Context {}

/** task_event_record：唯一事件持久化表（取代 stream_event_record，ADR-013） */
export const TASK_EVENT_TABLE = 'task_event_record';

/** run_state_record：run 状态快照（O(1) 状态查询，事件重放的缓存面） */
export const RUN_STATE_TABLE = 'run_state_record';

/** 发射元信息（由 Report 透传） */
export interface EmitMeta {
  session_id?: string;
  run_id?: string;
  work_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_type?: string;
  node_id?: string;
  task_id?: string;
  round?: number;
  trace_id?: string;
  stream_endpoint_id?: string;
  span?: EventSpan;
  ref?: EventRef;
}

export class FlushEventsInput extends Input {}
export class FlushEventsOutput extends Output {
  flushed = 0;
}

export class SoEventsInput extends Input {
  run_id = '';
  session_id = '';
  info_id = '';
  after_seq = 0;
  limit = 5000;
}
export interface TaskEventRow {
  seq: number;
  kind: string;
  event_type: string;
  ts: number;
  agent_id: string;
  round: number | null;
  span_json: string;
  ref_json: string;
  payload_json: string;
}
export class SoEventsOutput extends Output {
  run_id = '';
  session_id = '';
  phase = '';
  last_seq = 0;
  events: TaskEventRow[] = [];
}

export interface RunStatePatch {
  phase?: string;
  round?: number;
  agent_id?: string;
  llm_id?: string;
  thought_mode?: string;
  tokens_in?: number;
  tokens_out?: number;
  tool_calls?: number;
  started_ts?: number;
  settled_ts?: number;
  stop_reason?: string;
  error?: string;
}
