export { LoopAccess, LoopContext } from './access/LoopAccess';
export type { PermissionGate } from './access/LoopAccess';
export type { PermissionAudit } from './application/AgentLoopService';

export {
  ExecAgentLoopInput,
  ExecAgentLoopOutput,
  AbortLoopTurnInput,
  AbortLoopTurnOutput,
  ConfigLoopInput,
  ConfigLoopOutput,
  LoopStopReason,
} from './domain/types';
export type { LoopQueue } from './domain/types';

export { AbortReason, RunPhase, DEFAULT_BUDGET_TOTAL, IterationBudget } from '../shared/types';
export type { BudgetSpec } from '../shared/IterationBudget';
