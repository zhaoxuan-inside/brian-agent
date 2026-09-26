import { Input, Context, Output } from '../../shared/base';

export class StreamContext extends Context {}

export type SSEMessageType = 'TEXT' | 'DAG' | 'CONTEXT' | 'AGENT_SPEC' | 'TRACE' | 'CONTROL';

export interface BrianSSEMessage<T = unknown> {
  
  msg_id: string;
  
  seq: number;
  
  session_id: string;
  
  run_id: string;
  
  work_id: string;
  
  agent_id?: string;
  
  agent_name?: string;
  
  agent_type?: string;
  
  node_id?: string;
  
  task_id?: string;
  
  event: string;
  
  msg_type: SSEMessageType;
  
  full_length?: number;
  
  chunk_length: number;
  
  accumulated_length: number;
  
  timestamp: number;
  
  data: T;
}

export type StreamWriter = (chunk: string) => boolean | void | Promise<boolean | void>;

export class RegisterStreamInput extends Input {
  session_id!: string;
  writer!: StreamWriter;
  onClose?: () => void;
  
  endpoint_id?: string;
}

export class RegisterStreamOutput extends Output {
  client_id = '';
  
  endpoint_id = '';
  registered = false;
}

export class PushStreamInput<T = unknown> extends Input {
  session_id!: string;
  event!: string;
  msg_type: SSEMessageType = 'TEXT';
  data!: T;
  run_id?: string;
  work_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_type?: string;
  node_id?: string;
  task_id?: string;
  
  enable_chunking?: boolean;
  
  chunk_min?: number;
  
  chunk_max?: number;
  
  chunk_delay_ms?: number;
}

export class PushStreamOutput extends Output {
  msg_id = '';
  seq = 0;
  pushed = false;
}

export class CloseStreamInput extends Input {
  session_id!: string;
  reason?: string;
}

export class CloseStreamOutput extends Output {
  closed = false;
}

export class GetStreamStatsOutput extends Output {
  active_sessions_count = 0;
  active_sessions: string[] = [];
}

export class ConfigStreamInput extends Input {
  sse_heartbeat_interval_ms?: number;
  chunk_min_chars?: number;
  chunk_max_chars?: number;
}

export class ConfigStreamOutput extends Output {
  updated = false;
}

export const STREAM_CONFIG_TABLE = 'stream_config';

export const STREAM_EVENT_TABLE = 'stream_event';

export class PushEventToEndpointInput extends Input {
  
  endpoint_id!: string;
  
  session_key!: string;
  
  run_id?: string;
  
  type!: string;
  
  payload!: unknown;
}

export class PushEventToEndpointOutput extends Output {
  
  seq = 0;
  
  delivered = false;
}

export class ReplayEndpointEventsInput extends Input {
  
  endpoint_id!: string;
  
  session_key!: string;
  
  after_seq?: number;
}

export class ReplayEndpointEventsOutput extends Output {
  
  replayed = 0;
  
  last_seq = 0;
}

export interface StreamConfigRecord {
  id: string;
  sse_heartbeat_interval_ms: number;
  chunk_min_chars: number;
  chunk_max_chars: number;
  created: number;
  updated: number;
}
