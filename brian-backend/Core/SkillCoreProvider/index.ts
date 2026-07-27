/**
 * @fileoverview SkillCoreProvider 模块统一导出。
 */

// access 层
export { SkillCoreAccess } from './access/SkillCoreAccess';

// domain 层类型
export {
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
  OptSkillInput,
  OptSkillOutput,
  AgeSkillInput,
  AgeSkillOutput,
  SoSkillRuleInput,
  SoSkillRuleOutput,
  UpdateSkillRuleInput,
  UpdateSkillRuleOutput,
  ConfigSkillCoreInput,
  ConfigSkillCoreOutput,
  SKILL_CORE_CONFIG_TABLE,
  AGENT_SKILL_TABLE,
  SKILL_OPT_RULE_TABLE,
  SKILL_USAGE_TABLE,
} from './domain/types';

export type {
  SkillCoreConfigRecord,
  AgentSkillRecord,
  SkillOptRuleRecord,
  SkillUsageRecord,
  MatchedSkillEntry,
} from './domain/types';
