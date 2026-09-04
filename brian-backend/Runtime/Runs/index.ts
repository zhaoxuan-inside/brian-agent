/**
 * @fileoverview Runs 模块统一导出（Runtime v2 · 阶段3/4 前置）。
 */

// access 层
export { RunGatewayAccess } from './access/RunGatewayAccess';

// infrastructure 层
export { RunsSchemaInitializer } from './infrastructure/RunsSchemaInitializer';

// domain 层类型
export {
  RunGatewayContext,
  SubmitRunInput,
  SubmitRunOutput,
  WaitRunInput,
  WaitRunOutput,
  SteerRunInput,
  SteerRunOutput,
  AbortRunInput,
  AbortRunOutput,
  SoRunStatusInput,
  SoRunStatusOutput,
  ConfigRunsInput,
  ConfigRunsOutput,
  RUNTIME_RUN_TABLE,
  RUNTIME_RUNS_CONFIG_TABLE,
} from './domain/types';
export type {
  QueueMode,
  RunStatus,
  RunRecord,
  SessionLane,
  Waiter,
} from './domain/types';
