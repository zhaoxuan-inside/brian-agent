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
}

export class MatchLLMOutput extends Output {
  
  llm_id = '';
  
  llm: Record<string, unknown> | null = null;
  
  from_cache = false;
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

export const LLM_CORE_CONFIG_TABLE = 'llm_core_config';

export const AGENT_LLM_TABLE = 'agent_llm';

export const LLM_PROVIDER_QUOTA_TABLE = 'llm_provider_quota';

export const LLM_CORE_USAGE_TABLE = 'llm_core_usage';
