/**
 * @fileoverview Tools 模块统一导出（Runtime v2 · 阶段2）。
 */

// access 层
export { SkillRuntimeAccess } from './access/SkillRuntimeAccess';

// domain 层
export {
  SkillRuntimeContext,
  SkillResultStatus,
  RegisterSkillInput,
  RegisterSkillOutput,
  ExecSkillInput,
  ExecSkillOutput,
  SoSkillsInput,
  SoSkillsOutput,
  RegisterBuiltinSkillsInput,
  RegisterBuiltinSkillsOutput,
  RegisterRunSkillsInput,
  RegisterSkillsOutput,
  ClearRunSkillsInput,
  ConfigToolInput,
  ConfigToolOutput,
} from './domain/types';
export type {
  SkillResult,
  SkillExecutionContext,
  SkillDef,
  AnySkillDef,
  SkillSpecJson,
} from './domain/types';
export { zodToJSONSchema } from './domain/zodToJsonSchema';
export { LEGACY_TOOL_TO_SKILL_ID, SYSTEM_SKILLS } from './application/builtinSkills';

// application 层（内置工具）
export {
  mcpExecTool,
  browserSkill,
} from './application/mcpGate';
export { updatePlanSkill, preparePlanSteps, PlanStepStatus } from './application/updatePlanSkill';
export { delegateSkill } from './application/delegateSkill';
export { askUserSkill } from './application/askUserSkill';
export type { AskUserDeps } from './application/askUserSkill';
export type { SkillRuntimeDeps } from './application/mcpGate';
