import { Input, Context, Output } from '@brian-agent/base';

export class ChatContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

export class SubmitWorkInput extends Input {
  session_id!: string;
  msg_content!: string;
  citing_msg_ids?: string[];
  force_orchestration_strategy?: string;
}

export class SubmitWorkOutput extends Output {
  work_id = '';
  interact_id = '';
}

export class CreateSessionInput extends Input {
  session_title?: string;
}

export class CreateSessionOutput extends Output {
  session_id = '';
  session_title = '';
  created = 0;
}

export class DeleteSessionInput extends Input {
  session_ids!: string[];
}

export class DeleteSessionOutput extends Output {
  deleted_count = 0;
}

export class SearchSessionInput extends Input {
  keyword?: string;
  start_time?: number;
  end_time?: number;
  order_by?: string;
  page_current?: number;
  page_size?: number;
}

export class SearchSessionOutput extends Output {
  sessions: Array<{
    session_id: string;
    session_title: string;
    message_count: number;
    last_message_time: number;
    created: number;
    updated: number;
  }> = [];
  total = 0;
}

export class GetSessionDetailInput extends Input {
  session_id!: string;
}

export class GetSessionDetailOutput extends Output {
  session: Record<string, unknown> = {};
}

export class UpdateSessionTitleInput extends Input {
  session_id!: string;
  session_title!: string;
}

export class UpdateSessionTitleOutput extends Output {}

export class CheckSessionOverflowInput extends Input {
  session_id!: string;
}

export class CheckSessionOverflowOutput extends Output {
  is_overflowed = false;
  message_count = 0;
  max_messages = 0;
}

export class GetChatHistoryInput extends Input {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
  lastN?: number;
  page_current?: number;
  page_size?: number;
}

export class GetChatHistoryOutput extends Output {
  messages: Array<{
    info_id: string;
    info_creator_role: string;
    info: string;
    created: number;
    pin: boolean;
    citing_count: number;
  }> = [];
  total = 0;
}

export class SearchMessageInput extends Input {
  keyword!: string;
  session_id?: string;
  page_current?: number;
  page_size?: number;
}

export class SearchMessageOutput extends Output {
  messages: Array<{
    info_id: string;
    info_creator_role: string;
    info: string;
    summary: string;
    created: number;
    session_id: string;
  }> = [];
  total = 0;
}

export class PinMessageInput extends Input {
  info_id!: string;
}

export class PinMessageOutput extends Output {
  pin = false;
}

export class GetMessageGraphInput extends Input {
  session_id!: string;
}

export class GetMessageGraphOutput extends Output {
  graph_structure: Record<string, unknown> = {};
}

export class CancelWorkInput extends Input {
  work_id!: string;
  reason?: string;
}

export class CancelWorkOutput extends Output {
  cancelled = false;
}

export class ConfigChatInput extends Input {
  max_messages_per_session?: number;
  sse_heartbeat_interval_ms?: number;
  default_history_lastN?: number;
}

export class ConfigChatOutput extends Output {
  config: Record<string, unknown> = {};
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export class OpenChatStreamInput extends Input {
  session_id!: string;
  msg_content!: string;
  citing_msg_ids?: string[];
  force_orchestration_strategy?: string;
}

export class OpenChatStreamOutput extends Output {
  events: SSEEvent[] = [];
}
