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
  agent_type: string;
  strategy_id: string;
  llm_id: string;
  soul_id: string;
  task_signature: string;
  usage_count: number;
  eval_score: number;
  enable: boolean;
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
  max_agent_count: number;
}

// ---------------------------------------------------------------------------
// addAgent
// ---------------------------------------------------------------------------

export class AddAgentInput extends Input {
  agent_id!: string;
  agent_type!: string;
  strategy_id!: string;
  llm_id!: string;
  soul_id!: string;
  task_signature!: string;
  agent_name!: string;
}

export class AddAgentOutput extends Output {
  agent_id = '';
}

// ---------------------------------------------------------------------------
// matchAgent
// ---------------------------------------------------------------------------

export class MatchAgentInput extends Input {
  task_signature!: string;
  agent_type?: string;
  similarity_threshold?: number;
}

export class MatchAgentOutput extends Output {
  agent_id = '';
  similarity_score = 0;
}

// ---------------------------------------------------------------------------
// updateAgent
// ---------------------------------------------------------------------------

export class UpdateAgentInput extends Input {
  agent_id!: string;
  agent_name?: string;
  task_signature?: string;
  eval_score?: number;
  enable?: boolean;
  strategy_id?: string;
}

export class UpdateAgentOutput extends Output {}

// ---------------------------------------------------------------------------
// recordAgentUsage
// ---------------------------------------------------------------------------

export class RecordAgentUsageInput extends Input {
  agent_id!: string;
  work_id!: string;
  interact_id!: string;
  usage_context?: string;
}

export class RecordAgentUsageOutput extends Output {}

// ---------------------------------------------------------------------------
// getAgent
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ageAgent
// ---------------------------------------------------------------------------

export class AgeAgentInput extends Input {}

export class AgeAgentOutput extends Output {
  aged_count = 0;
}

// ---------------------------------------------------------------------------
// getAgentRule
// ---------------------------------------------------------------------------

export class GetAgentRuleInput extends Input {
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}

export class GetAgentRuleOutput extends Output {
  rules: AgentOptRuleRecord[] = [];
}

// ---------------------------------------------------------------------------
// updateAgentRule
// ---------------------------------------------------------------------------

export class UpdateAgentRuleInput extends Input {
  operations!: Operation[];
}

export class UpdateAgentRuleOutput extends Output {}

// ---------------------------------------------------------------------------
// configAgentLibrary
// ---------------------------------------------------------------------------

export class ConfigAgentLibraryInput extends Input {
  prompt_template_id?: string;
  similarity_threshold?: number;
  max_agent_count?: number;
}

export class ConfigAgentLibraryOutput extends Output {
  config: AgentLibraryConfigRecord | null = null;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const AGENT_TABLE = 'agent';
export const AGENT_USAGE_TABLE = 'agent_usage';
export const AGENT_OPT_RULE_TABLE = 'agent_opt_rule';
export const AGENT_LIBRARY_CONFIG_TABLE = 'agent_library_config';
