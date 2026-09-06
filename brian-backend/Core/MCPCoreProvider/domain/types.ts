import { Input, Context, Output } from '@brian-agent/base';
import type { McpInstallRecord } from '@brian-agent/base';

export class McpCoreContext extends Context {}

// --- Config Record ---
export interface McpCoreConfigRecord {
  id: string;
  created: number;
  updated: number;
  regen_rate: number;
  similarity_threshold: number;
  prompt_template_id: string;
}

// --- matchMCP ---
export class MatchMcpInput extends Input {
  agent_id!: string;
  context_id?: string;
  interact_id?: string;
  /** 调用方传入的既有绑定（agent 表为唯一绑定事实源）；传入时确定性水合，不再按任务重选 */
  bound_mcp_ids?: string[];
}
export class MatchMcpOutput extends Output {
  mcp_ids: string[] = [];
  mcp_details: McpInstallRecord[] = [];
}

// --- optMCP ---
export class OptMcpInput extends Input {
  agent_id!: string;
  context_id?: string;
  interact_id?: string;
  mcp_id!: string;
}
export class OptMcpOutput extends Output {
  id = '';
}

// --- configMCPCore ---
export class ConfigMcpCoreInput extends Input {
  regen_rate?: number;
  similarity_threshold?: number;
  prompt_template_id?: string;
}
export class ConfigMcpCoreOutput extends Output {
  config: McpCoreConfigRecord | null = null;
}

// --- Tables ---
export const MCP_CORE_CONFIG_TABLE = 'mcp_core_config';
/** @deprecated 绑定已收敛至 Agent 表（agent.mcp_ids_json），表停止创建；常量仅为兼容保留 */
export const AGENT_MCP_TABLE = 'agent_mcp';
export const AGENT_MCP_USAGE_TABLE = 'agent_mcp_usage';

export const DEFAULT_REGENERATE_RATE = 75;
