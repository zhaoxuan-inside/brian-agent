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

// ---------------------------------------------------------------------------
// matchStrategy
// ---------------------------------------------------------------------------

export class MatchStrategyInput extends Input {
  task_content!: string;
  task_complexity!: number;
  task_domain!: string;
}

export class MatchStrategyOutput extends Output {
  strategy_id = '';
}

// ---------------------------------------------------------------------------
// getStrategy
// ---------------------------------------------------------------------------

export class GetStrategyInput extends Input {
  strategy_id!: string;
}

export class GetStrategyOutput extends Output {
  strategy_id = '';
  strategy_label = '';
  execution_rule = '';
}

// ---------------------------------------------------------------------------
// soStrategy
// ---------------------------------------------------------------------------

export class SoStrategyInput extends Input {
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}

export class SoStrategyOutput extends Output {
  strategies: AgentStrategyRecord[] = [];
}

// ---------------------------------------------------------------------------
// addStrategy
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// updateStrategy
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// configAgentStrategy
// ---------------------------------------------------------------------------

export class ConfigAgentStrategyInput extends Input {
  default_strategy_id?: string;
  match_prompt_template_id?: string;
}

export class ConfigAgentStrategyOutput extends Output {
  config: AgentStrategyConfigRecord | null = null;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const AGENT_STRATEGY_TABLE = 'agent_strategy';
export const AGENT_STRATEGY_CONFIG_TABLE = 'agent_strategy_config';

export const DEFAULT_STRATEGIES = [
  {
    strategy_label: 'CoT',
    suitable_complexity_min: 0,
    suitable_complexity_max: 40,
    suitable_domains: '["*"]',
    execution_rule: JSON.stringify({
      version: '1.0',
      max_iterations: 1,
      steps: [
        { step: 'Think', next: 'Answer', on_error: 'Answer' },
        { step: 'Answer', next: null },
      ],
    }),
  },
  {
    strategy_label: 'ReAct',
    suitable_complexity_min: 30,
    suitable_complexity_max: 70,
    suitable_domains: '["*"]',
    execution_rule: JSON.stringify({
      version: '1.0',
      max_iterations: 10,
      steps: [
        { step: 'Think', next: 'Act', on_error: 'Answer' },
        { step: 'Act', next: 'Reflect' },
        {
          step: 'Reflect',
          condition_field: 'should_continue',
          true_next: 'Think',
          false_next: 'Answer',
        },
        { step: 'Answer', next: null },
      ],
    }),
  },
  {
    strategy_label: 'Plan-and-Solve',
    suitable_complexity_min: 60,
    suitable_complexity_max: 100,
    suitable_domains: '["*"]',
    execution_rule: JSON.stringify({
      version: '1.0',
      max_iterations: 20,
      phases: [
        {
          phase: 'Plan',
          steps: [{ step: 'Think', next: 'SolvePhase', on_error: 'Answer' }],
        },
        {
          phase: 'Solve',
          loop_over: 'sub_steps',
          steps: [
            { step: 'Act', next: 'Reflect' },
            {
              step: 'Reflect',
              condition_field: 'should_continue',
              true_next: 'Act',
              false_next: 'SummaryAnswer',
            },
          ],
        },
        {
          phase: 'Summary',
          steps: [{ step: 'Answer', next: null }],
        },
      ],
    }),
  },
];
