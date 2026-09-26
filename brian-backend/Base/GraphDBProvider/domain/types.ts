import { Input, Context, Output } from '../../shared/base';
import { VisualScope } from '../../shared/query';
import type { Condition, OrderBy, Page } from '../../shared/query';

export class GraphContext extends Context {}

export enum GraphTarget {
  
  NODE = 'node',
  
  EDGE = 'edge',
}

export enum GraphDirection {
  
  OUT = 'OUT',
  
  IN = 'IN',
  
  BOTH = 'BOTH',
}

export interface GraphNodeData {
  
  node_type: string;
  
  content: Record<string, unknown>;
}

export interface GraphEdgeData {
  
  from_node_id: string;
  
  to_node_id: string;
  
  edge_type: string;
  
  weight?: number;
  
  properties?: Record<string, unknown>;
}

export interface GraphNodeRecord {
  
  id: string;
  
  created: number;
  
  updated: number;
  
  node_type: string;
  
  content: Record<string, unknown>;
}

export interface GraphEdgeRecord {
  
  id: string;
  
  created: number;
  
  updated: number;
  
  from_node_id: string;
  
  to_node_id: string;
  
  edge_type: string;
  
  weight: number;
  
  properties: Record<string, unknown> | null;
  
  last_activation_time: number | null;
  
  is_active: boolean;
}

export class AddGraphNodeInput extends Input {
  
  data!: GraphNodeData;
}

export class AddGraphNodeOutput extends Output {
  
  id = '';
}

export class GetGraphNodeInput extends Input {
  
  id!: string;
}

export class GetGraphNodeOutput extends Output {
  
  node: GraphNodeRecord | null = null;
}

export class UpdateGraphNodeInput extends Input {
  
  id!: string;
  
  data!: Partial<GraphNodeData>;
}

export class UpdateGraphNodeOutput extends Output {
  
  affected_rows = 0;
}

export class DelGraphNodeInput extends Input {
  
  ids!: string[];
}

export class DelGraphNodeOutput extends Output {
  
  affected_rows = 0;
}

export class AddGraphEdgeInput extends Input {
  
  data!: GraphEdgeData;
}

export class AddGraphEdgeOutput extends Output {
  
  id = '';
}

export class GetGraphEdgeInput extends Input {
  
  id!: string;
}

export class GetGraphEdgeOutput extends Output {
  
  edge: GraphEdgeRecord | null = null;
}

export class UpdateGraphEdgeInput extends Input {
  
  id!: string;
  
  data!: Partial<GraphEdgeData>;
}

export class UpdateGraphEdgeOutput extends Output {
  
  affected_rows = 0;
}

export class DelGraphEdgeInput extends Input {
  
  ids!: string[];
}

export class DelGraphEdgeOutput extends Output {
  
  affected_rows = 0;
}

export class SelectGraphInput extends Input {
  
  target!: GraphTarget | string;
  
  node_type?: string;
  
  edge_type?: string;
  
  conditions?: Condition[];
  
  order_by?: OrderBy[];
  
  page?: Page;
}

export class SelectGraphOutput extends Output {
  
  list: Array<GraphNodeRecord | GraphEdgeRecord> = [];
  
  total = 0;
}

export class GetGraphNeighborsInput extends Input {
  
  node_id!: string;
  
  depth?: number;
  
  edge_type?: string;
  
  direction?: GraphDirection | string;
  
  only_active?: boolean;
}

export class GetGraphNeighborsOutput extends Output {
  
  list: GraphNodeRecord[] = [];
}

export class ActivateGraphEdgeInput extends Input {
  
  edge_id!: string;
  
  trigger_type?: string;
}

export class ActivateGraphEdgeOutput extends Output {}

export class AgeGraphEdgeInput extends Input {}

export class AgeGraphEdgeOutput extends Output {
  
  aged_count = 0;
}

export class VisualizedGraphInput extends Input {
  
  scope!: VisualScope | string;
}

export class VisualizedGraphOutput extends Output {
  
  data: Record<string, unknown> = {};
}

export class EnableGraphDBInput extends Input {
  
  enable!: boolean;
}

export class EnableGraphDBOutput extends Output {}

export class CloseGraphDBInput extends Input {}

export class CloseGraphDBOutput extends Output {}

export const GRAPH_NODE_TABLE = 'graph_node';

export const GRAPH_ACTIVATION_EVENT_TABLE = 'graph_activation_event';

export const GRAPH_EDGE_TABLE = 'graph_edge';

export const GRAPH_EDGE_DAILY_ACTIVATION_TABLE = 'graph_edge_daily_activation';

export const GRAPHDB_CONFIG_TABLE = 'graphdb_config';
