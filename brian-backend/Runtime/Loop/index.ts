/**
 * @fileoverview Loop 模块统一导出（Runtime v2 · 阶段2）。
 */

// access 层
export { LoopAccess, LoopContext } from './access/LoopAccess';

// domain 层类型
export {
  ExecAgentLoopInput,
  ExecAgentLoopOutput,
  AbortLoopTurnInput,
  AbortLoopTurnOutput,
  ConfigLoopInput,
  ConfigLoopOutput,
} from './domain/types';
export type { LoopQueue } from './domain/types';
