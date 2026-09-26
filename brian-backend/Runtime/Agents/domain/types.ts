import { Input, Context, Output } from '@brian-agent/base';

export class AgentDefContext extends Context {}

export enum AgentMode {
  Primary = 'primary',
  Subagent = 'subagent',
  All = 'all',
}

export enum AgentDefStatus {
  Active = 'active',
  Disabled = 'disabled',
}

export enum AgentMatchLayer {
  Exact = 'exact',
  Signature = 'signature',
  Vector = 'vector',
  LLM = 'llm',
  Built = 'built',
}

export interface AgentDefRecord {
  id: string;
  name: string;
  mode: AgentMode;
  
  agent_ref: string;
  
  task_signature: string;
  
  agent_purpose: string;
  
  prompt_template_id: string;
  
  model_id: string;
  
  soul_id: string;
  
  tools_json: string;
  
  temperature?: number;
  
  budget_total: number;
  
  status: AgentDefStatus;
  created: number;
  updated: number;
}

export interface SnapshotToolEntry {
  kind: 'skill' | 'mcp';
  id: string;
  brief: string;
  
  system?: boolean;
}

export interface AgentSnapshot {
  def_id: string;
  name: string;
  
  system: string;
  
  llm_id: string;
  temperature?: number;
  budget_total: number;
  
  tools: SnapshotToolEntry[];
  
  meta: { soul_id?: string; llm_id?: string; matched_by?: string };
}

export class MatchAgentDefInput extends Input {
  
  task_content!: string;
  
  task_domain?: string;
  
  run_id?: string;
  
  work_id?: string;
  
  session_id?: string;
  
  context_id?: string;
  
  agent_ref?: string;
  
  force_new?: boolean;
}

export class MatchAgentDefOutput extends Output {
  
  def_id!: string;
  
  matched_by!: AgentMatchLayer;
  
  def!: AgentDefRecord;
}

export class SoAgentSnapshotInput extends Input {
  
  def_id!: string;
  
  task_content!: string;
  
  task_domain?: string;
  
  run_id?: string;
  
  context_id?: string;
  
  user_message?: string;
}

export class SoAgentSnapshotOutput extends Output {
  
  snapshot!: AgentSnapshot;
}

export class DeclareAgentInput extends Input {
  
  name!: string;
  
  mode?: AgentMode;
  
  agent_ref?: string;
  
  task_signature?: string;
  
  agent_purpose?: string;
  
  prompt_template_id?: string;
  
  model_id?: string;
  
  soul_id?: string;
  
  tools_json?: string;
  
  temperature?: number;
  
  budget_total?: number;
  
  status?: AgentDefStatus;
}

export class DeclareAgentOutput extends Output {
  
  def_id!: string;
}

export class SoAgentDefsInput extends Input {}

export class SoAgentDefsOutput extends Output {
  
  defs: AgentDefRecord[] = [];
}

export class ConfigAgentDefInput extends Input {
  
  match_similarity_threshold?: number;
}

export class ConfigAgentDefOutput extends Output {}

export class KillErroredAgentInput extends Input {
  
  agent_ref!: string;
  
  work_id?: string;
  
  run_id?: string;
  
  trace_id?: string;
  
  task_content?: string;
  
  error?: string;
}

export class KillErroredAgentOutput extends Output {}

export const RUNTIME_AGENT_DEF_TABLE = 'runtime_agent_def';

export const RUNTIME_AGENTS_CONFIG_TABLE = 'runtime_agents_config';
