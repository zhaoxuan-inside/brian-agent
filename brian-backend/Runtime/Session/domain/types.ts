import { Input, Context, Output } from '@brian-agent/base';

export class SessionContext extends Context {}

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
}

export enum SessionStatus {
  Active = 'active',
}

export enum PartType {
  Reasoning = 'reasoning',
  Text = 'text',
  Tool = 'tool',
  Steering = 'steering',
  Subtask = 'subtask',
}

export enum PartStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Error = 'error',
  Aborted = 'aborted',
}

export interface MessageWithParts {
  id: string;
  role: MessageRole;
  content: string;
  seq: number;
  run_id?: string;
  created: number;
  parts: PartRecord[];
}

export interface PartRecord {
  id: string;
  msg_id: string;
  run_id?: string;
  part_type: PartType;
  part_order: number;
  content: string;
  tool_id?: string;
  execute_id?: string;
  status: PartStatus;
  block_type?: string;
  block_meta?: string;
  token_count: number;
  elapsed_ms: number;
  created: number;
  updated: number;
}

export class AddSessionInput extends Input {
  
  session_key!: string;
  
  title?: string;
  
  agent_def_id?: string;
}

export class AddSessionOutput extends Output {
  
  session_id!: string;
  
  created!: boolean;
}

export class AddMessageInput extends Input {
  
  session_id!: string;
  
  run_id?: string;
  
  role!: MessageRole;
  
  content!: string;
  
  token_count?: number;
}

export class AddMessageOutput extends Output {
  
  msg_id!: string;
  
  seq!: number;
}

export class AddPartInput extends Input {
  
  msg_id!: string;
  
  run_id?: string;
  
  part_type!: PartType;
  
  content?: string;
  
  tool_id?: string;
  
  block_type?: string;
  
  block_meta?: string;
}

export class AddPartOutput extends Output {
  
  part_id!: string;
  
  part_order!: number;
}

export class UpdatePartInput extends Input {
  
  part_id!: string;
  
  status?: PartStatus;
  
  content_patch?: string;
  
  execute_id?: string;
  
  token_count?: number;
  
  elapsed_ms?: number;
}

export class UpdatePartOutput extends Output {}

export class SoMessagesInput extends Input {
  
  session_id!: string;
  
  limit?: number;
  
  before_seq?: number;
}

export class SoMessagesOutput extends Output {
  
  messages: MessageWithParts[] = [];
}

export class ConfigSessionInput extends Input {
  
  enabled?: boolean;
  
  default_message_limit?: number;
}

export class ConfigSessionOutput extends Output {}

export const RUNTIME_SESSION_TABLE = 'runtime_session_record';

export const RUNTIME_MESSAGE_TABLE = 'runtime_message_record';

export const RUNTIME_MESSAGE_PART_TABLE = 'runtime_message_part_record';

export const RUNTIME_SESSION_CONFIG_TABLE = 'runtime_session_config_record';
