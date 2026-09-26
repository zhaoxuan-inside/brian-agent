import { Input, Context, Output } from '@brian-agent/base';

export class AgentBuilderContext extends Context {
}

export interface AgentBuilderConfigRecord {
  id: string;
  created: number;
  updated: number;
  task_analysis_prompt_template_id: string;
  auto_optimize: boolean;
}

export class BuildAgentInput extends Input {
  run_id!: string;
  task_content!: string;
  task_complexity?: number;
  task_domain?: string;
  force_new?: boolean;
}

export class BuildAgentOutput extends Output {
  agent_id = '';
}

export class OptimizeAgentInput extends Input {
  agent_id!: string;
  run_id!: string;
  usage_feedback?: string;
}

export class OptimizeAgentOutput extends Output {
  optimized = false;
  changes: Array<{ component: string; from: string; to: string }> = [];
}

export class BuildSystemAgentInput extends Input {
  agent_type!: string;
  force_new?: boolean;
}

export class BuildSystemAgentOutput extends Output {
  agent_id = '';
}

export class ConfigAgentBuilderInput extends Input {
  task_analysis_prompt_template_id?: string;
  auto_optimize?: boolean;
}

export class ConfigAgentBuilderOutput extends Output {
  config: AgentBuilderConfigRecord | null = null;
}

export const AGENT_BUILDER_CONFIG_TABLE = 'agent_builder_config';
