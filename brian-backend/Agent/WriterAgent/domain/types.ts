import { Input, Context, Output } from '@brian-agent/base';

export class WriterAgentContext extends Context {
  selected_msg_ids?: string[];
}

export interface WriterAgentConfigRecord {
  id: string;
  created: number;
  updated: number;
  write_prompt_template_id: string;
  default_language: string;
  default_style: string;
  default_depth: string;
  default_format: string;
  llm_id: string | null;
}

export interface WriterAgentUserProfileRecord {
  id: string;
  created: number;
  updated: number;
  session_id: string;
  language: string;
  style: string;
  depth: string;
  format: string;
  additional_preferences: string;
}

export class WriteInput extends Input {
  work_id!: string;
  run_id!: string;
  user_query!: string;
  agent_results!: Array<{ agent_id: string; task_content?: string; result?: string; answer?: string; handle_result_type?: string }>;
  user_preferences?: { language?: string; style?: string; depth?: string; format?: string };
}

export interface BlockMeta {
  level?: number;
  language?: string;
  streaming_status?: 'streaming' | 'completed';
  [key: string]: unknown;
}

export interface Block {
  id: string;
  type: 'text_paragraph' | 'heading' | 'code_block' | 'list_item' | 'artifact_preview' | 'error_fallback';
  content: string;
  meta?: BlockMeta;
}

export class WriteOutput extends Output {
  // 本次 write 实际使用的系统 Writer Agent 的 agent_id（用于编排层记录执行轨迹）
  agent_id = '';
  response = '';
  response_format = '';
  token_usage = 0;
  blocks: Block[] = [];
  // 最终回复的处理结果类型（错误透传时标记 call_error / internal_error，供下游评估跳过）
  handle_result_type = '';
  // 本次 write 的轨迹 id（已落库 agent_execution_trace，供编排层关联 orchestration_agent_execution）
  trace_id = '';
}

export class SaveUserProfileInput extends Input {
  session_id!: string;
  language?: string;
  style?: string;
  depth?: string;
  format?: string;
  additional_preferences?: string;
}

export class SaveUserProfileOutput extends Output {}

export class GetUserProfileInput extends Input {
  session_id!: string;
}

export class GetUserProfileOutput extends Output {
  user_profile: { language: string; style: string; depth: string; format: string; additional_preferences: string } = { language: 'zh-CN', style: 'clear', depth: 'medium', format: 'MARKDOWN', additional_preferences: '' };
}

export class ConfigWriterAgentInput extends Input {
  write_prompt_template_id?: string;
  default_language?: string;
  default_style?: string;
  default_depth?: string;
  default_format?: string;
  llm_id?: string | null;
}

export class ConfigWriterAgentOutput extends Output {
  config: WriterAgentConfigRecord | null = null;
}

export const WRITER_AGENT_CONFIG_TABLE = 'writer_agent_config';
export const WRITER_AGENT_USER_PROFILE_TABLE = 'writer_agent_user_profile';
