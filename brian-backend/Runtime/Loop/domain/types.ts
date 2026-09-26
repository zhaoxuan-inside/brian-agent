import { Input, Context, Output } from '@brian-agent/base';
import type { BudgetSpec } from '../../shared/IterationBudget';
import { AbortReason } from '../../shared/types';

export class LoopContext extends Context {}

export enum LoopStopReason {
  
  Stop = 'stop',
  
  Aborted = 'aborted',
  
  Error = 'error',
  
  Budget = 'budget',
}

export class ExecAgentLoopInput extends Input {
  
  run_id!: string;
  
  session_key!: string;
  
  session_id!: string;
  
  work_id?: string;
  
  user_message!: string;
  
  system?: string;
  
  llm_id?: string;
  

  skills?: string[];
  
  component_scope?: { skills: string[]; mcps: string[] };
  
  budget?: BudgetSpec;
  
  temperature?: number;
  
  max_tokens?: number;
  
  signal?: AbortSignal;
  
  idle_watchdog_ms?: number;
  
  defer_final_reply?: boolean;
  
  thought_mode?: string;
}

export class ExecAgentLoopOutput extends Output {
  
  stop_reason!: LoopStopReason;
  
  work_id?: string;
  
  result!: string;
  
  token_usage!: { input_tokens: number; output_tokens: number };
  
  iterations!: number;
  
  msg_id?: string;
}

export class AbortLoopTurnInput extends Input {
  
  run_id!: string;
  
  reason!: AbortReason;
}

export class AbortLoopTurnOutput extends Output {
  
  signalled!: boolean;
}

export interface LoopQueue {
  
  drainSteering(sessionKey: string): string[];
  
  takeFollowup(sessionKey: string): string[];
}

export class ConfigLoopInput extends Input {
  
  enabled?: boolean;
  
  default_budget_total?: number;
}

export class ConfigLoopOutput extends Output {}
