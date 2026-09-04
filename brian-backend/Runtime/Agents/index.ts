/**
 * @fileoverview Agents 模块统一导出（Runtime v2 · 阶段3 前置）。
 */

// access 层
export { AgentDefAccess } from './access/AgentDefAccess';

// infrastructure 层
export { AgentsSchemaInitializer } from './infrastructure/AgentsSchemaInitializer';

// domain 层类型
export {
  AgentDefContext,
  MatchAgentDefInput,
  MatchAgentDefOutput,
  SoAgentSnapshotInput,
  SoAgentSnapshotOutput,
  DeclareAgentInput,
  DeclareAgentOutput,
  SoAgentDefsInput,
  SoAgentDefsOutput,
  ConfigAgentDefInput,
  ConfigAgentDefOutput,
  RUNTIME_AGENT_DEF_TABLE,
  RUNTIME_AGENTS_CONFIG_TABLE,
} from './domain/types';
export type {
  AgentDefRecord,
  AgentSnapshot,
  SnapshotToolEntry,
} from './domain/types';

// application 层（组件依赖组合）
export type { AgentDefComponents } from './application/AgentDefService';
