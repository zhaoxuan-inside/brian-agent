import { Input, Context, Output } from '@brian-agent/base';
import type { Condition, OrderBy, Page, Operation } from '@brian-agent/base';

export class AgentLibraryContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

export interface AgentRecord {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  agent_name: string;
  agent_purpose?: string;
  agent_type: string;
  strategy_id: string;
  /** 绑定 Soul ID（绑定唯一事实源：agent 表） */
  soul_id: string;
  /** 绑定 Skill ID 列表（JSON 数组存储；绑定唯一事实源：agent 表） */
  skill_ids: string[];
  /** 绑定 MCP ID 列表（JSON 数组存储；绑定唯一事实源：agent 表） */
  mcp_ids: string[];
  /** 绑定 Prompt 模板 ID */
  prompt_template_id: string;
  task_signature: string;
  usage_count: number;
  eval_score: number;
  enable: number | boolean;
}

export interface AgentUsageRecord {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  work_id: string;
  interact_id: string;
  usage_context: string;
}

export interface AgentUsageDailyRecord {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  usage_date: string;
  usage_count: number;
}

export interface AgentOptRuleRecord {
  id: string;
  created: number;
  updated: number;
  days: number;
  min_usage_count: number;
  min_eval_score: number;
}

export interface AgentLibraryConfigRecord {
  id: string;
  created: number;
  updated: number;
  prompt_template_id: string;
  similarity_threshold: number;
  regen_rate: number;
  max_agent_count: number;
}

export class AddAgentInput extends Input {
  agent_id!: string;
  agent_type!: string;
  strategy_id!: string;
  soul_id!: string;
  task_signature!: string;
  agent_name!: string;
  agent_purpose?: string;
  /** 初始绑定 Skill ID 列表（可选；绑定唯一事实源为 agent 表） */
  skill_ids?: string[];
  /** 初始绑定 MCP ID 列表（可选） */
  mcp_ids?: string[];
  /** 初始绑定 Prompt 模板 ID（可选） */
  prompt_template_id?: string;
}

export class AddAgentOutput extends Output {
  agent_id = '';
}

export class MatchAgentInput extends Input {
  task_signature!: string;
  task_content?: string;
  agent_type?: string;
  similarity_threshold?: number;
}

export class MatchAgentOutput extends Output {
  /** 命中的 Agent ID（未命中或按失效概率需重构时为空串） */
  agent_id = '';
  similarity_score = 0;
  matched_by: 'SIMILARITY' | 'LLM' | '' = 'SIMILARITY';
  /** 是否找到相似度达标的 Agent（含按失效概率需重构的情形） */
  matched = false;
  /** 失效概率判定：即使命中也要求重构（用户流程：匹配不上或以一定失效概率进行 Agent 重构） */
  regenerate = false;
}

export class UpdateAgentInput extends Input {
  agent_id!: string;
  agent_name?: string;
  agent_purpose?: string;
  task_signature?: string;
  eval_score?: number;
  enable?: boolean;
  strategy_id?: string;
  soul_id?: string;
}

export class UpdateAgentOutput extends Output {}

export class DelAgentInput extends Input {
  ids!: string[];
}

export class DelAgentOutput extends Output {
  deleted_count = 0;
}

export class ToggleAgentInput extends Input {
  id!: string;
}

export class ToggleAgentOutput extends Output {
  enable = false;
}

export class RecordAgentUsageInput extends Input {
  agent_id!: string;
  work_id!: string;
  interact_id!: string;
  usage_context?: string;
}

export class RecordAgentUsageOutput extends Output {}

// ---------------------------------------------------------------------------
// bindAgentComponent / unbindAgentComponent（绑定唯一事实源：agent 表）
// ---------------------------------------------------------------------------

/** 组件类型（有限值域唯一注册点；LLM 绑定仍在 LLMProvider agent_llm，不在本表） */
export enum ComponentKind {
  Soul = 'soul',
  Skill = 'skill',
  Mcp = 'mcp',
  Prompt = 'prompt',
}

/** bindAgentComponent 入参（幂等 upsert：同 kind 全量替换为 component_ids） */
export class BindAgentComponentInput extends Input {
  /** Agent 业务 ID（agent_id） */
  agent_id!: string;
  /** 组件类型 */
  component_kind!: ComponentKind;
  /** 绑定的组件 ID 列表（soul/prompt 单值取首个；空列表=清空该类绑定） */
  component_ids!: string[];
}

/** bindAgentComponent 出参 */
export class BindAgentComponentOutput extends Output {
  /** 实际生效的绑定列表 */
  bound: string[] = [];
}

/** unbindAgentComponent 入参（幂等；component_ids 缺省=解绑该类全部） */
export class UnbindAgentComponentInput extends Input {
  /** Agent 业务 ID（agent_id） */
  agent_id!: string;
  /** 组件类型 */
  component_kind!: ComponentKind;
  /** 要解绑的组件 ID 列表（缺省解绑全部） */
  component_ids?: string[];
}

/** unbindAgentComponent 出参 */
export class UnbindAgentComponentOutput extends Output {
  /** 是否有变更 */
  unbound = false;
}

export class GetAgentInput extends Input {
  agent_id?: string;
  agent_type?: string;
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}

export class GetAgentOutput extends Output {
  agents: AgentRecord[] = [];
}

export class AgeAgentInput extends Input {}

export class AgeAgentOutput extends Output {
  aged_count = 0;
}

export class GetAgentRuleInput extends Input {
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}

export class GetAgentRuleOutput extends Output {
  rules: AgentOptRuleRecord[] = [];
}

export class UpdateAgentRuleInput extends Input {
  operations!: Operation[];
}

export class UpdateAgentRuleOutput extends Output {}

export class ConfigAgentLibraryInput extends Input {
  prompt_template_id?: string;
  similarity_threshold?: number;
  regen_rate?: number;
  max_agent_count?: number;
}

export class ConfigAgentLibraryOutput extends Output {
  prompt_template_id = '';
  similarity_threshold = 0.7;
  regen_rate = 75;
  max_agent_count = 100;
}

export const AGENT_TABLE = 'agent';
export const AGENT_USAGE_TABLE = 'agent_usage';
export const AGENT_USAGE_DAILY_TABLE = 'agent_usage_daily';
export const AGENT_OPT_RULE_TABLE = 'agent_opt_rule';
export const AGENT_LIBRARY_CONFIG_TABLE = 'agent_library_config';

export const VALID_AGENT_TYPES = ['WORKER', 'PLANNER', 'WRITER', 'EVOLUTOR', 'SUMMARY', 'INTENT'] as const;
export const SYSTEM_AGENT_TYPES = ['PLANNER', 'WRITER', 'EVOLUTOR', 'SUMMARY', 'INTENT'] as const;
