import { Input, Context, Output } from '@brian-agent/base';
import type { McpInstallRecord } from '@brian-agent/base';

export class McpCoreContext extends Context {}

export interface McpCoreConfigRecord {
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
  
  market_install_enabled: boolean;
}

export class MatchMcpInput extends Input {
  agent_id!: string;
  context_id?: string;
  run_id?: string;
  
  task_content?: string;
  
  bound_mcp_ids?: string[];
  
  bypass_cache?: boolean;
}
export class MatchMcpOutput extends Output {
  mcp_ids: string[] = [];
  mcp_details: McpInstallRecord[] = [];
  

  detail = '';
}

export class OptMcpInput extends Input {
  agent_id!: string;
  context_id?: string;
  run_id?: string;
  mcp_id!: string;
}
export class OptMcpOutput extends Output {
  id = '';
}

export class ConfigMcpCoreInput extends Input {
  regen_rate?: number;
  similarity_threshold?: number;
  prompt_template_id?: string;
  
  score_threshold?: number;
  
  vector_similarity_threshold?: number;
  
  match_cache_ttl_ms?: number;
  
  match_cache_capacity?: number;
  
  market_install_enabled?: boolean;
}
export class ConfigMcpCoreOutput extends Output {
  config: McpCoreConfigRecord | null = null;
}

export const MCP_CORE_CONFIG_TABLE = 'mcp_core_config_record';

export const AGENT_MCP_TABLE = 'agent_mcp_org';

export const DEFAULT_REGENERATE_RATE = 75;
