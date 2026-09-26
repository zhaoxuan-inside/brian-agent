import { Input, Context, Output } from '@brian-agent/base';
import type { Condition, OrderBy, Page, Operation } from '@brian-agent/base';

export class SkillCoreContext extends Context {}

export interface SkillCoreConfigRecord {
  id: string;
  created: number;
  updated: number;
  regen_rate: number;
  similarity_threshold: number;
  prompt_template_id: string;
  
  score_threshold: number;
  
  vector_similarity_threshold: number;
  
  match_cache_ttl_ms: number;
  
  match_cache_capacity: number;
  
  github_token: string;
  
  github_search_enabled: boolean;
  
  auto_generate_enabled: boolean;
}

export interface AgentSkillRecord {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  skill_id: string;
}

export interface SkillOptRuleRecord {
  id: string;
  created: number;
  updated: number;
  days: number;
  min_usage_count: number;
}

export interface SkillUsageRecord {
  id: string;
  created: number;
  agent_skill_id: string;
  timestamp: number;
}

export class MatchSkillInput extends Input {
  
  agent_id!: string;
  
  context_id!: string;
  
  run_id!: string;
  
  task_content?: string;
  
  bound_skill_ids?: string[];
  
  bypass_cache?: boolean;
}

export interface MatchedSkillEntry {
  skill_id: string;
  skill_brief: string;
  relevance: number;
}

export class MatchSkillOutput extends Output {
  
  skills: MatchedSkillEntry[] = [];
  
  system_skills: MatchedSkillEntry[] = [];
  

  detail = '';
}

export class OptSkillInput extends Input {
  
  agent_id!: string;
  
  context_id!: string;
  
  run_id!: string;
  
  skill_id!: string;
}

export class OptSkillOutput extends Output {
  
  binding: AgentSkillRecord | null = null;
}

export class AgeSkillInput extends Input {}

export class AgeSkillOutput extends Output {
  
  aged_count = 0;
  
  stale_skills: Array<{ agent_id: string; skill_id: string; usage_count: number }> = [];
}

export class SoSkillRuleInput extends Input {
  
  conditions?: Condition[];
  
  order_by?: OrderBy[];
  
  page?: Page;
}

export class SoSkillRuleOutput extends Output {
  
  list: SkillOptRuleRecord[] = [];
  
  total = 0;
}

export class UpdateSkillRuleInput extends Input {
  
  operations!: Operation[];
}

export class UpdateSkillRuleOutput extends Output {}

export class ConfigSkillCoreInput extends Input {
  
  regen_rate?: number;
  
  similarity_threshold?: number;
  
  prompt_template_id?: string;
  
  score_threshold?: number;
  
  vector_similarity_threshold?: number;
  
  match_cache_ttl_ms?: number;
  
  match_cache_capacity?: number;
  
  github_token?: string;
  
  github_search_enabled?: boolean;
  
  auto_generate_enabled?: boolean;
}

export class ConfigSkillCoreOutput extends Output {
  
  regen_rate = 0;
  
  prompt_template_id = '';
  
  github_token = '';
  
  github_search_enabled = true;
  
  auto_generate_enabled = true;
}

export const SKILL_CORE_CONFIG_TABLE = 'skill_core_config';

export const AGENT_SKILL_TABLE = 'agent_skill';

export const SKILL_OPT_RULE_TABLE = 'skill_opt_rule';

export const SKILL_USAGE_TABLE = 'skill_core_usage';
