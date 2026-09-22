import { Input, Context, Output } from '@brian-agent/base';

export class ChatContext extends Context {
}

export class SubmitWorkInput extends Input {
  session_id!: string;
  msg_content!: string;
  citing_msg_ids?: string[];
  selected_msg_ids?: string[];
  force_orchestration_strategy?: string;
}

export class SubmitWorkOutput extends Output {
  work_id = '';
  run_id = '';
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

export class PurgeOrphanSessionsInput extends Input {
  /** 仅扫描统计不执行删除（用于观测 / 联调） */
  dry_run?: boolean;
}

export class PurgeOrphanSessionsOutput extends Output {
  /** 被清理（或 dry_run 下被识别）的孤儿会话数量 */
  purged_count = 0;
  /** 被清理（或 dry_run 下被识别）的孤儿会话 ID 列表 */
  purged_session_ids: string[] = [];
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
    last_message: string;
    created: number;
    updated: number;
    qa_count: number;
    question_chars: number;
    answer_chars: number;
    input_tokens: number;
    output_tokens: number;
    tags: string[];
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
  run_id?: string;
  lastN?: number;
  page_current?: number;
  page_size?: number;
}

export class GetChatHistoryOutput extends Output {
  messages: Array<{
    info_id: string;
    info_type: string;
    info_creator_role: string;
    info: string;
    created: number;
    pin: boolean;
    work_id?: string;
    run_id?: string;
    trace_id?: string;
    citing_count: number;
    cited_count: number;
    citing_info_ids: string[];
    cited_info_ids: string[];
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
    info_type: string;
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

export class ConfirmIntentInput extends Input {
  session_id!: string;
  work_id!: string;
  action!: 'APPROVE' | 'KEEP' | 'CANCEL';
  understood_requirement?: string;
}

export class ConfirmIntentOutput extends Output {
  success = false;
  action_applied = '';
  next_status = '';
  final_response = '';
  run_id = '';
}

export class SubmitClarificationInput extends Input {
  session_id!: string;
  work_id!: string;
  answers!: Array<{ question: string; answer: string }>;
}

export class SubmitClarificationOutput extends Output {
  success = false;
  final_response = '';
  run_id = '';
  clarifications: Array<{ question: string; domain?: string }> = [];
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
  /** SSE 端点 ID（前端创建 SSE 端点时生成；本请求的业务事件经 Report→StreamProvider 推到该端点） */
  stream_endpoint_id?: string;
  session_id!: string;
  msg_content!: string;
  citing_msg_ids?: string[];
  selected_msg_ids?: string[];
  force_orchestration_strategy?: string;
}

export class OpenChatStreamOutput extends Output {
  events: SSEEvent[] = [];
}
