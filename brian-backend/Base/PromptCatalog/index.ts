/**
 * @fileoverview PromptCatalog 模块统一导出。
 */

export { PromptCatalogAccess } from './access/PromptCatalogAccess';
export {
  PROMPT_IDS,
  BUILTIN_PROMPTS,
  getBuiltinPrompt,
  getBuiltinTemplate,
  renderTemplate,
} from './catalog';
export type { BuiltinPromptDef, PromptId } from './catalog';

export { formatContextCategories, formatDynamicContext } from './contextFormatter';
export type { ContextItemLike, ContextCategoriesLike, ContextOutputLike } from './contextFormatter';
