import { Input, Context, Output } from '@brian-agent/base';
import type { Condition, OrderBy, Page, Operation } from '@brian-agent/base';

export class SoulCoreContext extends Context {}

export interface SoulCoreConfigRecord {
  id: string;
  created: number;
  updated: number;
  regen_rate: number;
  similarity_threshold: number;
  prompt_template_id: string | null;
  llm_id: string | null;
  
  score_threshold: number;
  
  vector_similarity_threshold: number;
  
  match_cache_ttl_ms: number;
  
  match_cache_capacity: number;
}

export interface AgentSoulRecord {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  soul_id: string;
}

export interface SoulOptRuleRecord {
  id: string;
  created: number;
  updated: number;
  days: number;
  min_usage_count: number;
}

export interface SoulCoreUsageRecord {
  id: string;
  created: number;
  agent_soul_id: string;
  timestamp: number;
}

export class MatchSoulInput extends Input {
  
  agent_id!: string;
  
  context_id!: string;
  
  run_id!: string;
  
  task_content?: string;
  
  task_domain?: string;
  
  bound_soul_id?: string;
  
  bypass_cache?: boolean;
}

export class MatchSoulOutput extends Output {
  
  soul_id = '';
  
  soul: Record<string, unknown> | null = null;
  
  from_cache = false;
}

export class OptSoulInput extends Input {
  
  agent_id!: string;
  
  context_id!: string;
  
  run_id!: string;
  
  soul_id!: string;
  
  current_soul_id?: string;
}

export interface SoulVerdict {
  
  better: boolean;
  
  reason: string;
}

export class OptSoulOutput extends Output {
  
  verdict: SoulVerdict = { better: false, reason: '' };
  
  current_soul_id = '';
}

export class AgeSoulInput extends Input {}

export class AgeSoulOutput extends Output {
  
  aged_count = 0;
  
  stale_souls: Array<{ agent_id: string; soul_id: string; usage_count: number }> = [];
}

export class SoSoulRuleInput extends Input {
  
  conditions?: Condition[];
  
  order_by?: OrderBy[];
  
  page?: Page;
}

export class SoSoulRuleOutput extends Output {
  
  list: SoulOptRuleRecord[] = [];
  
  total = 0;
}

export class UpdateSoulRuleInput extends Input {
  
  operations!: Operation[];
}

export class UpdateSoulRuleOutput extends Output {}

export class ConfigSoulCoreInput extends Input {
  
  regen_rate?: number;
  
  similarity_threshold?: number;
  
  prompt_template_id?: string;
  
  llm_id?: string;
  
  score_threshold?: number;
  
  vector_similarity_threshold?: number;
  
  match_cache_ttl_ms?: number;
  
  match_cache_capacity?: number;
}

export class ConfigSoulCoreOutput extends Output {
  
  config: SoulCoreConfigRecord | null = null;
}

export class SoSoulContentInput extends Input {
  
  soul_id!: string;
}

export class SoSoulContentOutput extends Output {
  
  content = '';
}

export const SOUL_CORE_CONFIG_TABLE = 'soul_core_config';

export const AGENT_SOUL_TABLE = 'agent_soul';

export const SOUL_OPT_RULE_TABLE = 'soul_opt_rule';

export const SOUL_CORE_USAGE_TABLE = 'soul_core_usage';
