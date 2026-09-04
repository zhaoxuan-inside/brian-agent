/**
 * @fileoverview LLMProvider 模块统一导出。
 */

// access 层
export { LLMAccess } from './access/LLMAccess';

// application 层（Runtime v2 · 阶段 0：归一化事件流解析器/执行器）
export { LLMEventsParser } from './application/llmevents/LLMEventsParser';
export {
  LLMEventsRunner,
  DEFAULT_IDLE_WATCHDOG_MS,
} from './application/llmevents/LLMEventsRunner';
export type { LLMEventsRunResult, LLMEventsRunnerOptions } from './application/llmevents/LLMEventsRunner';

// infrastructure 层
export { LLMSchemaInitializer } from './infrastructure/LLMSchemaInitializer';

// domain 层类型
export {
  LLMContext,
  AddLLMProviderInput,
  AddLLMProviderOutput,
  UpdateLLMProviderInput,
  UpdateLLMProviderOutput,
  DelLLMProviderInput,
  DelLLMProviderOutput,
  SoLLMProviderInput,
  SoLLMProviderOutput,
  TestLLMProviderInput,
  TestLLMProviderOutput,
  ListLLMInput,
  ListLLMOutput,
  AddLLMInput,
  AddLLMOutput,
  DelLLMInput,
  DelLLMOutput,
  UpdateLLMInput,
  UpdateLLMOutput,
  SoLLMInput,
  SoLLMOutput,
  GetLLMInput,
  GetLLMOutput,
  ExecLLMInput,
  ExecLLMOutput,
  ExecLLMEventsInput,
  ExecLLMEventsOutput,
  EmbedLLMInput,
  EmbedLLMOutput,
  GenLLMAttrInput,
  GenLLMAttrOutput,
  VisualizedLLMInput,
  VisualizedLLMOutput,
  EnableLLMInput,
  EnableLLMOutput,
  LLM_PROVIDER_TABLE,
  LLM_CACHE_TABLE,
  LLM_AVAILABLE_TABLE,
  LLM_USAGE_TABLE,
  LLM_CONFIG_TABLE,
} from './domain/types';

export type {
  LLMProviderData,
  LLMData,
  LLMProviderRecord,
  LLMCacheRecord,
  LLMAvailableRecord,
  LLMUsageRecord,
} from './domain/types';
