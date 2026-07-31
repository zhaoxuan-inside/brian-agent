import { Input, Context, Output } from '@brian-agent/base';

export class VisualizationContext extends Context {
  session_id?: string;
  work_id?: string;
}

export class GetVisualizedMessagesInput extends Input {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
  lastN?: number;
  include_citing_info?: boolean;
  include_context_source?: boolean;
  page_current?: number;
  page_size?: number;
}

export class GetVisualizedMessagesOutput extends Output {
  messages: Array<Record<string, unknown>> = [];
  total = 0;
}

export class GetVisualizedMessageGraphInput extends Input {
  session_id!: string;
  max_nodes?: number;
}

export class GetVisualizedMessageGraphOutput extends Output {
  session_id = '';
  graph: Record<string, unknown> = {};
  metadata: Record<string, unknown> = {};
}

export class GetVisualizedAgentDAGInput extends Input {
  work_id!: string;
  resolve_content?: boolean;
}

export class GetVisualizedAgentDAGOutput extends Output {
  dag: Record<string, unknown> = {};
}

export class GetVisualizedWorkFlowInput extends Input {
  work_id!: string;
}

export class GetVisualizedWorkFlowOutput extends Output {
  timeline: Record<string, unknown> = {};
}

export class GetAgentTraceInput extends Input {
  agent_id!: string;
  declare trace_id?: string;
}

export class GetAgentTraceOutput extends Output {
  trace: Record<string, unknown> = {};
}

export class GetVisualizedMessageDAGInput extends Input {
  session_id!: string;
  work_id?: string;
  include_question_answer_edges?: boolean;
  include_citation_edges?: boolean;
  max_nodes?: number;
}

export class GetVisualizedMessageDAGOutput extends Output {
  session_id = '';
  graph: Record<string, unknown> = {};
  metadata: Record<string, unknown> = {};
}

export class GetResourceInput extends Input {
  resource_type!: string;
  resource_id!: string;
}

export class GetResourceOutput extends Output {
  resource: Record<string, unknown> = {};
}

export class ConfigVisualizationInput extends Input {
  max_nodes_per_graph?: number;
  default_message_summary_length?: number;
  resolve_content_by_default?: boolean;
  max_context_samples_per_source?: number;
}

export class ConfigVisualizationOutput extends Output {
  config: Record<string, unknown> = {};
}

export const VISUALIZATION_CONFIG_TABLE = 'visualization_config';
export const INFO_RAW_TABLE = 'info_raw';
export const INFO_GRAPH_TABLE = 'info_graph';

export const DEFAULT_MAX_NODES_PER_GRAPH = 200;
export const DEFAULT_MESSAGE_SUMMARY_LENGTH = 50;
export const DEFAULT_RESOLVE_CONTENT_BY_DEFAULT = 1;
export const DEFAULT_MAX_CONTEXT_SAMPLES_PER_SOURCE = 3;
