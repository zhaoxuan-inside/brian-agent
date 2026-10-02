export type {
  LLMEvent,
  LLMMessage,
  LLMMessageRole,
  LLMToolSpec,
  LLMToolCallWire,
  ParsedToolCall,
  TokenUsage,
} from '@brian-agent/base';

export { BusinessEvent } from '@brian-agent/base';

export { AbortedError } from '@brian-agent/base';

export enum AbortReason {
  
  User = 'user',
  
  Timeout = 'timeout',
  
  Budget = 'budget',
  
  Superseded = 'superseded',
  
  ServiceRestart = 'service_restart',
}

export enum RunPhase {
  Start = 'start',
  End = 'end',
  Error = 'error',
}

export { IterationBudget } from './IterationBudget';
export type { BudgetSpec } from './IterationBudget';

export const DEFAULT_BUDGET_TOTAL = 60;
