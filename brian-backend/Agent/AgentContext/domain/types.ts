import { Input, Context, Output } from '@brian-agent/base';

export class AgentContextContext extends Context {
}

export interface AgentContextConfigRecord {
  id: string;
  created: number;
  updated: number;
  max_context_items: number;
  enable_snapshot_persistence: number;
}

/** soContextDetail 入参：按 work_id 查询该次问答的上下文（三对象结构） */
export class GetContextDetailInput extends Input {
  work_id!: string;
}

/** soContextDetail 出参：三对象结构（来源→ID、ID→内容、ID→属性） */
export class GetContextDetailOutput extends Output {
  source_ids_map: Record<string, string[]> = {};
  content_map: Record<string, string> = {};
  attribute_map: Record<string, Record<string, unknown>> = {};
  total_context_count = 0;
}

export class ConfigAgentContextInput extends Input {
  max_context_items?: number;
  enable_snapshot_persistence?: boolean;
}

export class ConfigAgentContextOutput extends Output {
  max_context_items = DEFAULT_MAX_CONTEXT_ITEMS;
  enable_snapshot_persistence = true;
}

export const AGENT_CONTEXT_CONFIG_TABLE = 'agent_context_config';

export const DEFAULT_MAX_CONTEXT_ITEMS = 200;
export const DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE = 1;
