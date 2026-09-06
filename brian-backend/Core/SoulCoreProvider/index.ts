/**
 * @fileoverview SoulCoreProvider 模块统一导出。
 */

// access 层
export { SoulCoreAccess } from './access/SoulCoreAccess';

// infrastructure 层
export { SoulCoreSchemaInitializer } from './infrastructure/SoulCoreSchemaInitializer';

// domain 层类型
export {
  SoulCoreContext,
  MatchSoulInput,
  MatchSoulOutput,
  OptSoulInput,
  OptSoulOutput,
  AgeSoulInput,
  AgeSoulOutput,
  SoSoulContentInput,
  SoSoulContentOutput,
  SoSoulRuleInput,
  SoSoulRuleOutput,
  UpdateSoulRuleInput,
  UpdateSoulRuleOutput,
  ConfigSoulCoreInput,
  ConfigSoulCoreOutput,
  SOUL_CORE_CONFIG_TABLE,
  AGENT_SOUL_TABLE,
  SOUL_OPT_RULE_TABLE,
  SOUL_CORE_USAGE_TABLE,
} from './domain/types';

export type {
  SoulCoreConfigRecord,
  AgentSoulRecord,
  SoulOptRuleRecord,
  SoulCoreUsageRecord,
  SoulVerdict,
} from './domain/types';
