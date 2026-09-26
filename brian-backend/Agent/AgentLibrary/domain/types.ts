import { Input, Context, Output } from '@brian-agent/base';
import type { Condition, OrderBy, Page, Operation } from '@brian-agent/base';

export class AgentLibraryContext extends Context {
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
  
  soul_id: string;
  
  skill_ids: string[];
  
  mcp_ids: string[];
  
  prompt_template_id: string;
  task_signature: string;
  usage_count: number;
  eval_score: number;
  enable: number | boolean;
  
  created_by: string;
}

export interface AgentUsageRecord {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  work_id: string;
  run_id: string;
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
  
  match_score_threshold: number;
}

export class AddAgentInput extends Input {
  agent_id!: string;
  agent_type!: string;
  strategy_id!: string;
  soul_id!: string;
  task_signature!: string;
  agent_name!: string;
  agent_purpose?: string;
  
  skill_ids?: string[];
  
  mcp_ids?: string[];
  
  prompt_template_id?: string;
  
  created_by?: string;
}

export class AddAgentOutput extends Output {
  agent_id = '';
}

export class MatchAgentInput extends Input {
  task_signature!: string;
  task_content?: string;
  agent_type?: string;
  similarity_threshold?: number;
  
  run_id?: string;
  
  work_id?: string;
}

export class MatchAgentOutput extends Output {
  
  agent_id = '';
  similarity_score = 0;
  matched_by: 'SIMILARITY' | 'LLM' | '' = 'SIMILARITY';
  
  matched = false;
  
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
  run_id!: string;
  usage_context?: string;
}

export class RecordAgentUsageOutput extends Output {}

export enum ComponentKind {
  Soul = 'soul',
  Skill = 'skill',
  Mcp = 'mcp',
  Prompt = 'prompt',
}

export class BindAgentComponentInput extends Input {
  
  agent_id!: string;
  
  component_kind!: ComponentKind;
  
  component_ids!: string[];
}

export class BindAgentComponentOutput extends Output {
  
  bound: string[] = [];
}

export class UnbindAgentComponentInput extends Input {
  
  agent_id!: string;
  
  component_kind!: ComponentKind;
  
  component_ids?: string[];
}

export class UnbindAgentComponentOutput extends Output {
  
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
  
  match_score_threshold?: number;
}

export class ConfigAgentLibraryOutput extends Output {
  prompt_template_id = '';
  similarity_threshold = 0.7;
  regen_rate = 75;
  max_agent_count = 100;
  
  match_score_threshold = 70;
}

export const AGENT_TABLE = 'agent';
export const AGENT_USAGE_TABLE = 'agent_usage';
export const AGENT_USAGE_DAILY_TABLE = 'agent_usage_daily';
export const AGENT_OPT_RULE_TABLE = 'agent_opt_rule';
export const AGENT_LIBRARY_CONFIG_TABLE = 'agent_library_config';

export const VALID_AGENT_TYPES = ['WORKER', 'WRITER', 'EVOLUTOR', 'SUMMARY', 'INTENT'] as const;
export const SYSTEM_AGENT_TYPES = ['WRITER', 'EVOLUTOR', 'SUMMARY', 'INTENT'] as const;
