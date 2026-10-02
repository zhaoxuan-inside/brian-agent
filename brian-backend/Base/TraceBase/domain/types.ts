import { Input, Context, Output } from '../../shared/base';

/**
 * TraceBase 统计域(ADR-012):统一使用事件流水 + 按实体日聚合组织表。
 * usage_event_record 一行 = 一次组件使用事件(记录数据);
 * xxx_usage_org 一行 = 某实体某日的用量聚合(组织数据)。
 */

export type UsageEntityType = 'agent' | 'soul' | 'skill' | 'mcp' | 'prompt' | 'llm' | 'llm_provider';

export const USAGE_EVENT_TABLE = 'usage_event_record';
export const AGENT_USAGE_ORG_TABLE = 'agent_usage_org';
export const SOUL_USAGE_ORG_TABLE = 'soul_usage_org';
export const SKILL_USAGE_ORG_TABLE = 'skill_usage_org';
export const MCP_USAGE_ORG_TABLE = 'mcp_usage_org';
export const PROMPT_USAGE_ORG_TABLE = 'prompt_template_usage_org';
export const LLM_USAGE_ORG_TABLE = 'llm_usage_org';
export const LLM_PROVIDER_USAGE_ORG_TABLE = 'llm_provider_usage_org';

/** 实体类型 → (日聚合表, 实体列名) */
export const USAGE_ENTITY_TABLES: Record<UsageEntityType, { table: string; idColumn: string }> = {
  agent: { table: AGENT_USAGE_ORG_TABLE, idColumn: 'agent_id' },
  soul: { table: SOUL_USAGE_ORG_TABLE, idColumn: 'soul_id' },
  skill: { table: SKILL_USAGE_ORG_TABLE, idColumn: 'skill_id' },
  mcp: { table: MCP_USAGE_ORG_TABLE, idColumn: 'mcp_install_id' },
  prompt: { table: PROMPT_USAGE_ORG_TABLE, idColumn: 'prompt_template_id' },
  llm: { table: LLM_USAGE_ORG_TABLE, idColumn: 'llm_available_id' },
  llm_provider: { table: LLM_PROVIDER_USAGE_ORG_TABLE, idColumn: 'llm_provider_id' },
};

export interface UsageEventRecord {
  id: string;
  created: number;
  updated: number;
  trace_id: string;
  entity_type: UsageEntityType;
  entity_id: string;
  agent_id: string;
  work_id: string;
  run_id: string;
  session_id: string;
  usage_context: string;
  input_tokens: number;
  output_tokens: number;
}

export class TraceContext extends Context {}

export class RecordUsageInput extends Input {
  entity_type!: UsageEntityType;
  entity_id!: string;
  agent_id?: string;
  work_id?: string;
  run_id?: string;
  session_id?: string;
  trace_id?: string;
  usage_context?: string;
  input_tokens?: number;
  output_tokens?: number;
}

export class RecordUsageOutput extends Output {
  event_id = '';
}

export class SoDailyUsageInput extends Input {
  entity_type!: UsageEntityType;
  entity_ids?: string[];
  since_date?: string;
  until_date?: string;
}

export interface DailyUsageItem {
  entity_id: string;
  usage_date: string;
  usage_count: number;
  input_tokens: number;
  output_tokens: number;
}

export class SoDailyUsageOutput extends Output {
  items: DailyUsageItem[] = [];
}

export class SoUsageEventsInput extends Input {
  entity_type?: UsageEntityType;
  entity_id?: string;
  agent_id?: string;
  run_id?: string;
  work_id?: string;
  since_created?: number;
  limit?: number;
}

export class SoUsageEventsOutput extends Output {
  events: UsageEventRecord[] = [];
  total = 0;
}

export class SoEntityUsageTotalInput extends Input {
  entity_type!: UsageEntityType;
  entity_id!: string;
  agent_id?: string;
}

export class SoEntityUsageTotalOutput extends Output {
  total_count = 0;
}

export class SoProviderTokenUsageInput extends Input {
  llm_provider_id!: string;
  since_ts?: number;
}

export class SoProviderTokenUsageOutput extends Output {
  tokens_used = 0;
  call_count = 0;
}
