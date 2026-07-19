import type { StrategyType, AgentStatus, WorkAgent } from '../shared/types';

export type { StrategyType, AgentStatus, WorkAgent };

export interface GraphNode {
  id: string;
  agent: WorkAgent;
  inputMapper: (state: any) => any;
  outputReducer: (state: any, output: any) => any;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: 'sequential' | 'conditional' | 'parallel' | 'loop';
  condition?: (state: any) => boolean;
  priority?: number;
}

export interface TaskGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ExecutionTrace {
  step: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface ReACTTrace {
  iteration: number;
  thought: string;
  action: string;
  actionInput: Record<string, unknown>;
  observation: string;
}