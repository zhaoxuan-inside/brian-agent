/**
 * @fileoverview LLMCoreProvider 领域层类型定义。
 *
 * 定义 LLMCoreContext、各功能的 Input / Output 类型、表名常量与默认配置。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output } from '@brian-agent/base';

/**
 * LLMCore 上下文（LLMCoreContext）。
 *
 * 继承 Context 基类，LLM 核心操作的执行上下文。
 */
export class LLMCoreContext extends Context {}

// ---------------------------------------------------------------------------
// 记录类型
// ---------------------------------------------------------------------------

/** agent_llm 表记录（Agent 与 LLM 的绑定关系） */
export interface AgentLLMRecord {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  llm_id: string;
}

/** llm_core_config 表记录 */
export interface LLMCoreConfigRecord {
  id: string;
  created: number;
  updated: number;
  regen_rate: number;
  prompt_template_id: string | null;
}

/** llm_provider_quota 表记录 */
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

/** llm_core_usage 表记录（用于配额统计的实际用量记录） */
export interface LLMCoreUsageRecord {
  id: string;
  created: number;
  llm_provider_id: string;
  timestamp: number;
  tokens_used: number;
  call_count: number;
}

/**
 * 单周期配额状态。
 */
export interface QuotaPeriodStatus {
  /** 限额（0 表示不限制） */
  limit: number;
  /** 已用量 */
  used: number;
  /** 可用余量 */
  available: number;
}

/**
 * 完整配额检查结果。
 */
export interface LLMQuotaStatus {
  daily: QuotaPeriodStatus;
  weekly: QuotaPeriodStatus;
  monthly: QuotaPeriodStatus;
}

// ---------------------------------------------------------------------------
// matchLLM
// ---------------------------------------------------------------------------

/** matchLLM 入参 */
export class MatchLLMInput extends Input {
  /** Agent ID */
  agent_id!: string;
  /** 上下文 ID */
  context_id!: string;
  /** 交互 ID */
  interact_id!: string;
}

/** matchLLM 出参 */
export class MatchLLMOutput extends Output {
  /** 匹配到的 LLM ID */
  llm_id = '';
  /** LLM 详细信息 */
  llm: Record<string, unknown> | null = null;
  /** 是否来自缓存 */
  from_cache = false;
}

// ---------------------------------------------------------------------------
// limitLLM
// ---------------------------------------------------------------------------

/** limitLLM 入参 */
export class LimitLLMInput extends Input {
  /** LLM 提供商 ID */
  llm_provider_id!: string;
  /** 每日 Token 限额（0 为不限制） */
  quota_tokens_per_day?: number;
  /** 每周 Token 限额（0 为不限制） */
  quota_tokens_per_week?: number;
  /** 每月 Token 限额（0 为不限制） */
  quota_tokens_per_month?: number;
  /** 每日调用次数限额（0 为不限制） */
  quota_calls_per_day?: number;
  /** 每日调用次数限额（0 为不限制） */
  quota_calls_per_week?: number;
  /** 每日调用次数限额（0 为不限制） */
  quota_calls_per_month?: number;
}

/** limitLLM 出参 */
export class LimitLLMOutput extends Output {
  /** 操作后的配额记录 ID */
  id = '';
}

// ---------------------------------------------------------------------------
// checkLLMQuota
// ---------------------------------------------------------------------------

/** checkLLMQuota 入参 */
export class CheckLLMQuotaInput extends Input {
  /** LLM 提供商 ID */
  llm_provider_id!: string;
}

/** checkLLMQuota 出参 */
export class CheckLLMQuotaOutput extends Output {
  /** 配额状态 */
  quota: LLMQuotaStatus = {
    daily: { limit: 0, used: 0, available: 0 },
    weekly: { limit: 0, used: 0, available: 0 },
    monthly: { limit: 0, used: 0, available: 0 },
  };
}

// ---------------------------------------------------------------------------
// configLLMCore
// ---------------------------------------------------------------------------

/** configLLMCore 入参 */
export class ConfigLLMCoreInput extends Input {
  /** 重新匹配概率（0-100） */
  regen_rate?: number;
  /** Prompt 模板 ID */
  prompt_template_id?: string;
}

/** configLLMCore 出参 */
export class ConfigLLMCoreOutput extends Output {
  /** 当前配置 */
  config: LLMCoreConfigRecord | null = null;
}

// ---------------------------------------------------------------------------
// recordLLMUsage
// ---------------------------------------------------------------------------

/** recordLLMUsage 入参 */
export class RecordLLMUsageInput extends Input {
  /** LLM 提供商 ID */
  llm_provider_id!: string;
  /** 消耗 Token 数 */
  tokens_used!: number;
  /** 调用次数，默认 1 */
  call_count?: number;
}

/** recordLLMUsage 出参 */
export class RecordLLMUsageOutput extends Output {
  /** 新记录 ID */
  id = '';
}

// ---------------------------------------------------------------------------
// 表名与默认配置
// ---------------------------------------------------------------------------

/** llm_core_config 配置表名 */
export const LLM_CORE_CONFIG_TABLE = 'llm_core_config';

/** agent_llm 表名（Agent 与 LLM 的绑定关系） */
export const AGENT_LLM_TABLE = 'agent_llm';

/** llm_provider_quota 表名（LLM 提供商配额限制） */
export const LLM_PROVIDER_QUOTA_TABLE = 'llm_provider_quota';

/**
 * llm_core_usage 表名（LLM 用量记录，用于配额统计）。
 *
 * 与 Base 层 LLMProvider 的 llm_usage 表独立，该表面向按天统计启用模型的使用次数，
 * 而本表面向按提供商维度的配额用量记录（含 timestamp、tokens_used、call_count）。
 */
export const LLM_CORE_USAGE_TABLE = 'llm_core_usage';

/**
 * LLMCoreProvider 配置表默认配置项。
 */
export const LLM_CORE_DEFAULT_CONFIGS = [
  {
    config_key: 'regen_rate',
    config_value: '75',
    value_type: 'INT',
    description: 'LLM 重新匹配概率（0-100），值越大越倾向于重新评估',
  },
  {
    config_key: 'prompt_template_id',
    config_value: '',
    value_type: 'STRING',
    description: '用于 LLM 匹配排名的 Prompt 模板 ID',
  },
] as const;
