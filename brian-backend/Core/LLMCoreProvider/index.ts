/**
 * @fileoverview LLMCoreProvider 模块统一导出。
 */

// access 层
export { LLMCoreAccess } from './access/LLMCoreAccess';

// infrastructure 层
export { LLMCoreSchemaInitializer } from './infrastructure/LLMCoreSchemaInitializer';

// domain 层类型
export {
  LLMCoreContext,
  MatchLLMInput,
  MatchLLMOutput,
  LimitLLMInput,
  LimitLLMOutput,
  CheckLLMQuotaInput,
  CheckLLMQuotaOutput,
  ConfigLLMCoreInput,
  ConfigLLMCoreOutput,
  RecordLLMUsageInput,
  RecordLLMUsageOutput,
  LLM_CORE_CONFIG_TABLE,
  AGENT_LLM_TABLE,
  LLM_PROVIDER_QUOTA_TABLE,
  LLM_CORE_USAGE_TABLE,
  LLM_CORE_DEFAULT_CONFIGS,
} from './domain/types';

export type {
  AgentLLMRecord,
  LLMCoreConfigRecord,
  LLMProviderQuotaRecord,
  LLMCoreUsageRecord,
  QuotaPeriodStatus,
  LLMQuotaStatus,
} from './domain/types';
