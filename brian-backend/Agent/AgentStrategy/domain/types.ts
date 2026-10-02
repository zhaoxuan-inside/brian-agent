import { Input, Context, Output } from '@brian-agent/base';
import type { Condition, OrderBy, Page } from '@brian-agent/base';

export class AgentStrategyContext extends Context {}

export interface AgentStrategyRecord {
  id: string;
  created: number;
  updated: number;
  strategy_id: string;
  strategy_label: string;
  suitable_complexity_min: number;
  suitable_complexity_max: number;
  suitable_domains: string;
  execution_rule: string;
  enable: boolean;
}

export interface AgentStrategyConfigRecord {
  id: string;
  created: number;
  updated: number;
  default_strategy_id: string;
  match_prompt_template_id: string;
}

export class MatchStrategyInput extends Input {
  task_content!: string;
  task_complexity!: number;
  task_domain!: string;
}

export class MatchStrategyOutput extends Output {
  strategy_id = '';
}

export class GetStrategyInput extends Input {
  strategy_id!: string;
}

export class GetStrategyOutput extends Output {
  strategy_id = '';
  strategy_label = '';
  execution_rule = '';
}

export class SoStrategyInput extends Input {
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}

export class SoStrategyOutput extends Output {
  strategies: AgentStrategyRecord[] = [];
}

export class AddStrategyInput extends Input {
  strategy_label!: string;
  suitable_complexity_min!: number;
  suitable_complexity_max!: number;
  suitable_domains!: string;
  execution_rule!: string;
}

export class AddStrategyOutput extends Output {
  strategy_id = '';
}

export class UpdateStrategyInput extends Input {
  strategy_id!: string;
  strategy_label?: string;
  suitable_complexity_min?: number;
  suitable_complexity_max?: number;
  suitable_domains?: string;
  execution_rule?: string;
  enable?: boolean;
}

export class UpdateStrategyOutput extends Output {}

export class ToggleStrategyInput extends Input {
  strategy_id!: string;
}

export class ToggleStrategyOutput extends Output {
  enable = false;
}

export class ConfigAgentStrategyInput extends Input {
  default_strategy_id?: string;
  match_prompt_template_id?: string;
}

export class ConfigAgentStrategyOutput extends Output {
  config: AgentStrategyConfigRecord | null = null;
}

export const AGENT_STRATEGY_TABLE = 'agent_strategy_record';
export const AGENT_STRATEGY_CONFIG_TABLE = 'agent_strategy_config_record';
