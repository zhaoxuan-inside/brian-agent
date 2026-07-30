import { Input, Context, Output } from '@brian-agent/base';

export class OrchestrationVisualizationContext extends Context {
  session_id?: string;
  work_id?: string;
}

export class VisualizeAgentDAGInput extends Input {
  work_id!: string;
}

export class VisualizeAgentDAGOutput extends Output {
  agent_dag_structure: Record<string, unknown> = {};
}

export class VisualizeWorkFlowInput extends Input {
  work_id!: string;
}

export class VisualizeWorkFlowOutput extends Output {
  workflow_timeline: Record<string, unknown> = {};
}

export class GetAgentNodeDetailInput extends Input {
  work_id!: string;
  agent_id!: string;
}

export class GetAgentNodeDetailOutput extends Output {
  agent_node_detail: Record<string, unknown> = {};
}

export class ConfigOrchestrationVisualizationInput extends Input {
  max_nodes_in_graph?: number;
}

export class ConfigOrchestrationVisualizationOutput extends Output {
  config: Record<string, unknown> = {};
}
