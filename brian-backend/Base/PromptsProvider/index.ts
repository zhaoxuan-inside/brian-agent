/**
 * @fileoverview PromptsProvider 模块统一导出。
 */

// access 层
export { PromptsAccess } from './access/PromptsAccess';

// domain 层类型
export {
  PromptContext,
  AddPromptInput,
  AddPromptOutput,
  DelPromptInput,
  DelPromptOutput,
  UpdatePromptInput,
  UpdatePromptOutput,
  GetPromptInput,
  GetPromptOutput,
  SoPromptInput,
  SoPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  EnablePromptsInput,
  EnablePromptsOutput,
  ClosePromptInput,
  ClosePromptOutput,
  PROMPT_TEMPLATE_TABLE,
  PROMPT_TEMPLATE_USAGE_TABLE,
  PROMPTS_CONFIG_TABLE,
  PROMPTS_DEFAULT_CONFIGS,
} from './domain/types';

export type {
  PromptTemplateData,
  PromptTemplateRecord,
  PromptTemplateUsageRecord,
} from './domain/types';
