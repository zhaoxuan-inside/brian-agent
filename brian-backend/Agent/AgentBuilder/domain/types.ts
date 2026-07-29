import { Input, Context, Output } from '@brian-agent/base';

export class AgentBuilderContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

export interface AgentBuilderConfigRecord {
  id: string;
  created: number;
  updated: number;
  task_analysis_prompt_template_id: string;
  default_strategy_id: string;
  auto_optimize: boolean;
}

// ---------------------------------------------------------------------------
// buildAgent
// ---------------------------------------------------------------------------

export class BuildAgentInput extends Input {
  interact_id!: string;
  task_content!: string;
  task_complexity?: number;
  task_domain?: string;
  force_new?: boolean;
}

export class BuildAgentOutput extends Output {
  agent_id = '';
}

// ---------------------------------------------------------------------------
// optimizeAgent
// ---------------------------------------------------------------------------

export class OptimizeAgentInput extends Input {
  agent_id!: string;
  interact_id!: string;
  usage_feedback?: string;
}

export class OptimizeAgentOutput extends Output {
  optimized = false;
  changes: Array<{ component: string; from: string; to: string }> = [];
}

// ---------------------------------------------------------------------------
// System Agent 构建基类（Planner / Writer / Evolutor 共用输出结构）
// ---------------------------------------------------------------------------

export class BuildSystemAgentOutput extends Output {
  agent_id = '';
}

// ---------------------------------------------------------------------------
// buildPlannerAgent
// ---------------------------------------------------------------------------

export class BuildPlannerAgentInput extends Input {
  force_new?: boolean;
}

export class BuildPlannerAgentOutput extends BuildSystemAgentOutput {}

// ---------------------------------------------------------------------------
// buildWriterAgent
// ---------------------------------------------------------------------------

export class BuildWriterAgentInput extends Input {
  force_new?: boolean;
}

export class BuildWriterAgentOutput extends BuildSystemAgentOutput {}

// ---------------------------------------------------------------------------
// buildEvolutorAgent
// ---------------------------------------------------------------------------

export class BuildEvolutorAgentInput extends Input {
  force_new?: boolean;
}

export class BuildEvolutorAgentOutput extends BuildSystemAgentOutput {}

// ---------------------------------------------------------------------------
// configAgentBuilder
// ---------------------------------------------------------------------------

export class ConfigAgentBuilderInput extends Input {
  task_analysis_prompt_template_id?: string;
  default_strategy_id?: string;
  auto_optimize?: boolean;
}

export class ConfigAgentBuilderOutput extends Output {
  config: AgentBuilderConfigRecord | null = null;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const AGENT_BUILDER_CONFIG_TABLE = 'agent_builder_config';
