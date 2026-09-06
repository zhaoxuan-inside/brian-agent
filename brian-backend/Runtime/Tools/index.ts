/**
 * @fileoverview Tools 模块统一导出（Runtime v2 · 阶段2）。
 */

// access 层
export { ToolAccess } from './access/ToolAccess';

// domain 层
export {
  ToolContext,
  ToolResultStatus,
  RegisterToolInput,
  RegisterToolOutput,
  ExecToolInput,
  ExecToolOutput,
  SoToolsInput,
  SoToolsOutput,
  RegisterBuiltinToolsInput,
  RegisterBuiltinToolsOutput,
  ConfigToolInput,
  ConfigToolOutput,
} from './domain/types';
export type {
  ToolResult,
  ToolExecutionContext,
  ToolDef,
  AnyToolDef,
  ToolSpecJson,
} from './domain/types';
export { zodToJSONSchema } from './domain/zodToJsonSchema';

// application 层（内置工具）
export {
  skillExecTool,
  mcpExecTool,
  cdtBrowserTool,
} from './application/builtinTools';
export { updatePlanTool, preparePlanSteps, PlanStepStatus } from './application/planTool';
export { delegateTool } from './application/delegateTool';
export type { BuiltinToolDeps } from './application/builtinTools';
