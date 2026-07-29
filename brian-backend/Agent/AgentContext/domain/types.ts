import { Input, Context, Output } from '@brian-agent/base';

export class AgentContextContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

export interface AgentContextRecord {
  id: string;
  created: number;
  updated: number;
  context_id: string;
  session_id: string;
  agent_id: string;
  work_id: string;
  trace_id: string;
  context_total_count: number;
  context_sources_summary: string;
}

export interface AgentContextItemRecord {
  id: string;
  created: number;
  updated: number;
  context_id: string;
  info_id: string;
  source: string;
}

export interface AgentContextConfigRecord {
  id: string;
  created: number;
  updated: number;
  max_context_items: number;
  enable_snapshot_persistence: number;
}

export class BuildAgentContextInput extends Input {
  session_id!: string;
  agent_id?: string;
  work_id?: string;
}

export class BuildAgentContextOutput extends Output {
  context_data: Array<{ info_id: string; content: string; source: string }> = [];
  context_id = '';
  total_context_count = 0;
}

export class GetContextByTraceInput extends Input {
  declare trace_id: string;
}

export class GetContextByTraceOutput extends Output {
  context_id = '';
  trace_id = '';
  agent_id = '';
  work_id = '';
  total_context_count = 0;
  sources: Record<string, { count: number }> = {};
}

export class GetContextByAgentInput extends Input {
  agent_id!: string;
  work_id!: string;
}

export class GetContextByAgentOutput extends Output {
  context_id = '';
  agent_id = '';
  work_id = '';
  total_context_count = 0;
  sources: Record<string, { count: number }> = {};
}

export class GetContextDetailInput extends Input {
  context_id!: string;
  sources?: string[];
}

export class GetContextDetailOutput extends Output {
  context_id = '';
  total_context_count = 0;
  sources: Record<string, { count: number; info_ids: string[] }> = {};
}

export class ConfigAgentContextInput extends Input {
  max_context_items?: number;
  enable_snapshot_persistence?: boolean;
}

export class ConfigAgentContextOutput extends Output {
  max_context_items = 200;
  enable_snapshot_persistence = true;
}

export const AGENT_CONTEXT_TABLE = 'agent_context';
export const AGENT_CONTEXT_ITEM_TABLE = 'agent_context_item';
export const AGENT_CONTEXT_CONFIG_TABLE = 'agent_context_config';

export const DEFAULT_MAX_CONTEXT_ITEMS = 200;
export const DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE = 1;

export const CONTEXT_SOURCE_VALID = [
  'pinned',
  'timeline',
  'tag_relative',
  'similarity',
  'keyword',
  'random',
] as const;

export type ContextSource = (typeof CONTEXT_SOURCE_VALID)[number];
