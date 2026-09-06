/**
 * @fileoverview Loop 模块统一导出（Runtime v2 · 阶段2）。
 */

// access 层
export { LoopAccess, LoopContext } from './access/LoopAccess';
export type { PermissionGate } from './access/LoopAccess';

// domain 层
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

// shared 层（run 协议枚举，Loop/Runs 共用）
export { AbortReason, RunPhase, DEFAULT_BUDGET_TOTAL, IterationBudget } from '../shared/types';
export type { BudgetSpec } from '../shared/IterationBudget';
