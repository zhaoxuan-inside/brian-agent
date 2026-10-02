import { Input, Context, Output } from '@brian-agent/base';

export class LLMCoreContext extends Context {}

export interface AgentLLMRecord {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  llm_id: string;
}

export interface LLMCoreConfigRecord {
  id: string;
  created: number;
  updated: number;
  regen_rate: number;
  similarity_threshold: number;
  prompt_template_id: string | null;
  
  score_threshold: number;
}

export interface LLMProviderQuotaRecord {
  id: string;
  created: number;
  updated: number;
  llm_provider_id: string;
  quota_tokens_per_day: number;
  quota_tokens_per_week: number;
  quota_tokens_per_month: number;
  quota_calls_per_day: number;
  quota_calls_per_week: number;
  quota_calls_per_month: number;
}

export interface LLMCoreUsageRecord {
  id: string;
  created: number;
  llm_provider_id: string;
  timestamp: number;
  tokens_used: number;
  call_count: number;
}

export interface QuotaPeriodStatus {
  
  limit: number;
  
  used: number;
  
  available: number;
}

export interface LLMQuotaStatus {
  daily: QuotaPeriodStatus;
  weekly: QuotaPeriodStatus;
  monthly: QuotaPeriodStatus;
}

export class MatchLLMInput extends Input {
  
  agent_id!: string;
  
  context_id!: string;
  
  run_id?: string;
  
  work_id?: string;

  /** 期望匹配的模型类型：'text'（默认文本模型）或 'embedding'（向量模型） */
  llm_type?: 'text' | 'embedding';

  /** 任务内容（R8 统一选举信号源：BM25/向量通道的查询文本） */
  task_content?: string;
}

export class MatchLLMOutput extends Output {
  
  llm_id = '';
  
  llm: Record<string, unknown> | null = null;
  
  from_cache = false;
  /** 选举结果明细（election_llm_<tier> / cache_hit 等） */
  detail = '';
}

export class LimitLLMInput extends Input {
  
  llm_provider_id!: string;
  
  quota_tokens_per_day?: number;
  
  quota_tokens_per_week?: number;
  
  quota_tokens_per_month?: number;
  
  quota_calls_per_day?: number;
  
  quota_calls_per_week?: number;
  
  quota_calls_per_month?: number;
}

export class LimitLLMOutput extends Output {
  
  id = '';
}

export class CheckLLMQuotaInput extends Input {
  
  llm_provider_id!: string;
}

export class CheckLLMQuotaOutput extends Output {
  
  quota: LLMQuotaStatus = {
    daily: { limit: 0, used: 0, available: 0 },
    weekly: { limit: 0, used: 0, available: 0 },
    monthly: { limit: 0, used: 0, available: 0 },
  };
}

export class ConfigLLMCoreInput extends Input {
  
  regen_rate?: number;
  
  similarity_threshold?: number;
  
  prompt_template_id?: string;
  
  score_threshold?: number;
}

export class ConfigLLMCoreOutput extends Output {
  
  config: LLMCoreConfigRecord | null = null;
}

export class RecordLLMUsageInput extends Input {
  
  llm_provider_id!: string;
  
  tokens_used!: number;
  
  call_count?: number;
}

export class RecordLLMUsageOutput extends Output {
  
  id = '';
}

export const LLM_CORE_CONFIG_TABLE = 'llm_core_config_record';

// agent_llm 已退役(ADR-012),绑定归 agent_record.llm_id

export const LLM_PROVIDER_QUOTA_TABLE = 'llm_provider_quota_record';

/** ADR-012:agent_llm 退役后,LLM 绑定读写落在 Agent 域 agent_record(物理表名在此登记) */
export const AGENT_RECORD_TABLE = 'agent_record';

