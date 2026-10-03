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



  connect_ms = 0;

  ttft_ms = 0;

  stream_ms = 0;

  /** 思考阶段耗时（流式路径：首事件→首个正文 delta） */
  thinking_ms = 0;

  /** 正文响应耗时（流式路径：首个正文 delta→结束） */
  response_ms = 0;
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

  /** 本次调用的 llm_call_record 行 id(ADR-012 轮次组织用) */
  call_id = '';

  reasoning = '';

  tool_calls: ParsedToolCall[] = [];

  finish_reason = '';

  input_tokens = 0;

  output_tokens = 0;

  duration_ms = 0;

  wire_messages: LLMMessage[] = [];



  connect_ms = 0;

  ttft_ms = 0;

  stream_ms = 0;

  /** 思考阶段耗时（首事件→首个正文 delta） */
  thinking_ms = 0;

  /** 正文响应耗时（首个正文 delta→结束） */
  response_ms = 0;
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

/** 单模型 Token 聚合统计（R7 卡片仪表盘） */
export interface ModelTokenStat {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  call_count: number;
}

export class SoModelTokenStatsInput extends Input {
}

export class SoModelTokenStatsOutput extends Output {
  /** key = llm_available_id */
  stats: Record<string, ModelTokenStat> = {};
}

export const LLM_PROVIDER_TABLE = 'llm_provider_record';

/** 提供商 API Key 独立存储（与提供商配置拆分；1 提供商 1 key，UNIQUE 约束） */
export const LLM_PROVIDER_KEY_TABLE = 'llm_provider_key_record';

export const LLM_CACHE_TABLE = 'llm_cache_record';

export const LLM_AVAILABLE_TABLE = 'llm_available_record';


export const LLM_CALL_RECORD_TABLE = 'llm_call_record';

export const LLM_CALL_DETAIL_TABLE = 'llm_call_detail_record';

/** llm_call_detail_record 原文单字段上限(防异常巨型负载) */
export const LLM_RECORD_TEXT_MAX_CHARS = 200_000;

export const LLM_CONFIG_TABLE = 'llm_config_record';
