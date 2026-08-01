import { Input, Context, Output } from '@brian-agent/base';

export class WriterAgentContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
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
  interact_id!: string;
  user_query!: string;
  agent_results!: Array<{ agent_id: string; task_content: string; result: string }>;
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
  response = '';
  response_format = '';
  token_usage = 0;
  blocks: Block[] = [];
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
}

export class ConfigWriterAgentOutput extends Output {
  config: WriterAgentConfigRecord | null = null;
}

export const WRITER_AGENT_CONFIG_TABLE = 'writer_agent_config';
export const WRITER_AGENT_USER_PROFILE_TABLE = 'writer_agent_user_profile';
