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
  /** 排序候选采纳阈值（百分制 0-100；2026-09-11 新增，默认 90） */
  score_threshold: number;
  /** 任务向量命中阈值（0.0-1.0；2026-09-11 新增，默认 0.8） */
  vector_similarity_threshold: number;
  /** 匹配缓存 TTL（毫秒；2026-09-11 新增，默认 600000） */
  match_cache_ttl_ms: number;
  /** 匹配缓存容量（2026-09-11 新增，默认 500） */
  match_cache_capacity: number;
}

// --- matchMCP ---
export class MatchMcpInput extends Input {
  agent_id!: string;
  context_id?: string;
  interact_id?: string;
  /** 当前任务内容（2026-09-11 新增；供匹配缓存键，不参与 LLM prompt 必填） */
  task_content?: string;
  /** 调用方传入的既有绑定（agent 表为唯一绑定事实源）；传入时确定性水合，不再按任务重选 */
  bound_mcp_ids?: string[];
  /** 跳过匹配缓存（2026-09-11 新增） */
  bypass_cache?: boolean;
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
  /** 排序候选采纳阈值（0-100；2026-09-11 新增） */
  score_threshold?: number;
  /** 任务向量命中阈值（0.0-1.0；2026-09-11 新增） */
  vector_similarity_threshold?: number;
  /** 匹配缓存 TTL（毫秒；2026-09-11 新增） */
  match_cache_ttl_ms?: number;
  /** 匹配缓存容量（2026-09-11 新增） */
  match_cache_capacity?: number;
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
