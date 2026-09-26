import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';
import type {
  LLMEvent,
  LLMMessage,
  LLMToolSpec,
  ParsedToolCall,
} from '../../shared/llm/LLMEvent';

export class LLMContext extends Context {}

export interface LLMProviderData {
  
  llm_provider_url: string;
  
  llm_provider_title: string;
  
  llm_provider_brief?: string;
  
  enable?: boolean;
  
  api_key?: string;
  
  models_path?: string;
  
  chat_path?: string;
  
  quota_tokens_per_day?: number;
  
  quota_tokens_per_week?: number;
  
  quota_tokens_per_month?: number;
  
  quota_calls_per_day?: number;
  
  quota_calls_per_week?: number;
  
  quota_calls_per_month?: number;
  
  models_fetched_at?: number;
}

export interface LLMData {
  
  llm_provider_id: string;
  
  llm_title: string;
  
  llm_brief?: string;
  
  llm_type?: string;
  
  enable?: boolean;
  
  is_default?: boolean;
  
  max_tokens?: number;
}

export interface LLMProviderRecord {
  
  id: string;
  
  created: number;
  
  updated: number;
  
  llm_provider_url: string;
  
  llm_provider_title: string;
  
  llm_provider_brief: string | null;
  
  enable: boolean;
  
  api_key: string | null;
  
  models_path: string | null;
  
  chat_path: string | null;
  
  quota_tokens_per_day: number | null;
  
  quota_tokens_per_week: number | null;
  
  quota_tokens_per_month: number | null;
  
  quota_calls_per_day: number | null;
  
  quota_calls_per_week: number | null;
  
  quota_calls_per_month: number | null;
  
  models_fetched_at: number | null;
}

export interface LLMCacheRecord {
  
  id: string;
  
  created: number;
  
  updated: number;
  
  llm_provider_id: string;
  
  llm_title: string;
  
  llm_brief: string | null;
  
  llm_param: string | null;
}

export interface LLMAvailableRecord {
  
  id: string;
  
  created: number;
  
  updated: number;
  
  llm_provider_id: string;
  
  llm_title: string;
  
  llm_brief: string | null;
  
  llm_type: string;
  
  enable: boolean;
  
  is_default?: boolean;
  
  max_tokens?: number;
  
  model_usage?: string;
}

export interface LLMCallLogRecord {
  
  id: string;
  
  created: number;
  
  llm_available_id: string;
  
  session_id: string;
  
  run_id: string;
  
  work_id: string;
  
  caller: string;
  
  llm_title: string;
  
  llm_type: string;
  
  status: string;
  
  error_code: string;
  
  input_tokens: number;
  
  output_tokens: number;
  
  duration_ms: number;
}

export interface LLMUsageRecord {
  
  id: string;
  
  created: number;
  
  updated: number;
  
  llm_available_id: string;
  
  usage_date: string;
  
  usage_count: number;
  
  input_tokens: number;
  
  output_tokens: number;
}

export class AddLLMProviderInput extends Input {
  
  data!: LLMProviderData;
}

export class AddLLMProviderOutput extends Output {
  
  id = '';
}

export class UpdateLLMProviderInput extends Input {
  
  id?: string;
  
  conditions?: Condition[];
  
  data!: Partial<LLMProviderData>;
}

export class UpdateLLMProviderOutput extends Output {
  
  affected_rows = 0;
}

export class DelLLMProviderInput extends Input {
  
  ids?: string[];
  
  conditions?: Condition[];
}

export class DelLLMProviderOutput extends Output {
  
  affected_rows = 0;
}

export class SoLLMProviderInput extends Input {
  
  keyword?: string;
  
  conditions?: Condition[];
  
  order_by?: OrderBy[];
  
  page?: Page;
}

export class SoLLMProviderOutput extends Output {
  
  list: LLMProviderRecord[] = [];
  
  total = 0;
}

export class TestLLMProviderInput extends Input {
  
  id!: string;
}

export class TestLLMProviderOutput extends Output {
  
  connected = false;
  
  response_time_ms = 0;
  
  status_code?: number;
}

export class ListLLMInput extends Input {
  
  llm_provider_id!: string;
  
  force?: boolean;
}

export class ListLLMOutput extends Output {
  
  list: LLMCacheRecord[] = [];
  
  cached = false;
}

export class AddLLMInput extends Input {
  
  data!: LLMData;
}

export class AddLLMOutput extends Output {
  
  id = '';
}

export class DelLLMInput extends Input {
  
  ids?: string[];
  
  conditions?: Condition[];
}

export class DelLLMOutput extends Output {
  
  affected_rows = 0;
}

export class UpdateLLMInput extends Input {
  
  id?: string;
  
  conditions?: Condition[];
  
  data!: Partial<LLMData>;
}

export class UpdateLLMOutput extends Output {
  
  affected_rows = 0;
}

export class GetLLMInput extends Input {
  id?: string;
  conditions?: Condition[];
}

export class GetLLMOutput extends Output {
  llm: LLMAvailableRecord | null = null;
}

export class SoLLMInput extends Input {
  
  keyword?: string;
  
  conditions?: Condition[];
  
  order_by?: OrderBy[];
  
  page?: Page;
}

export class SoLLMOutput extends Output {
  
  list: LLMAvailableRecord[] = [];
  
  total = 0;
}

export class ExecLLMInput extends Input {
  
  id!: string;
  
  prompt!: string;
  
  system?: string;
  
  temperature?: number;
  
  max_tokens?: number;
  
  extra?: Record<string, unknown>;
  
  no_fallback?: boolean;
  
  stream?: boolean;
  
  onDelta?: (delta: string) => void;
  
  session_id?: string;
  
  run_id?: string;
  
  work_id?: string;
  
  caller?: string;
}

export class ExecLLMOutput extends Output {
  
  result = '';
  
  input_prompt = '';
  
  input_tokens = 0;
  
  output_tokens = 0;
  
  duration_ms = 0;
  
  raw_response = '';
}

export class ExecLLMEventsInput extends Input {
  
  id!: string;
  
  messages?: LLMMessage[];
  
  prompt?: string;
  
  system?: string;
  
  temperature?: number;
  
  max_tokens?: number;
  
  tools?: LLMToolSpec[];
  
  tool_choice?: 'auto' | 'none' | 'required';
  
  extra?: Record<string, unknown>;
  
  no_fallback?: boolean;
  
  signal?: AbortSignal;
  
  idle_watchdog_ms?: number;
  
  on_event?: (event: LLMEvent) => void;
  
  session_id?: string;
  
  run_id?: string;
  
  work_id?: string;
  
  caller?: string;
}

export class ExecLLMEventsOutput extends Output {
  
  result = '';
  
  reasoning = '';
  
  tool_calls: ParsedToolCall[] = [];
  
  finish_reason = '';
  
  input_tokens = 0;
  
  output_tokens = 0;
  
  duration_ms = 0;
  
  wire_messages: LLMMessage[] = [];
}

export class EmbedLLMInput extends Input {
  
  id!: string;
  
  input!: string;
  
  session_id?: string;
  
  run_id?: string;
  
  work_id?: string;
  
  caller?: string;
}

export class EmbedLLMOutput extends Output {
  
  embedding: number[] = [];
  
  input_tokens = 0;
  
  duration_ms = 0;
  
  raw_response = '';
}

export class GenLLMAttrInput extends Input {
  
  id!: string;
}

export class GenLLMAttrOutput extends Output {
  
  llm_brief = '';
  
  model_usage = '';
}

export class VisualizedLLMInput extends Input {
  scope!: string;
}

export class VisualizedLLMOutput extends Output {
  data: Record<string, unknown> = {};
}

export class EnableLLMInput extends Input {
  enable!: boolean;
}

export class EnableLLMOutput extends Output {}

export class SoTokenUsageInput extends Input {
  
  session_id?: string;
  
  run_id?: string;
  
  work_id?: string;
}

export class SoTokenUsageOutput extends Output {
  
  input_tokens = 0;
  
  output_tokens = 0;
  
  call_count = 0;
}

export const LLM_PROVIDER_TABLE = 'llm_provider';

export const LLM_CACHE_TABLE = 'llm_cache';

export const LLM_AVAILABLE_TABLE = 'llm_available';

export const LLM_USAGE_TABLE = 'llm_usage';

export const LLM_CALL_LOG_TABLE = 'llm_call_log';

export const LLM_CONFIG_TABLE = 'llm_config';
