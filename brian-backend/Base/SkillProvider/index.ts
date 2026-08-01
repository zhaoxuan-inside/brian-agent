/**
 * @fileoverview SkillProvider 模块统一导出。
 */

// access 层
export { SkillAccess } from './access/SkillAccess';

// domain 层类型
export {
  SkillContext,
  AddSkillInput,
  AddSkillOutput,
  GetSkillInput,
  GetSkillOutput,
  UpdateSkillInput,
  UpdateSkillOutput,
  DelSkillInput,
  DelSkillOutput,
  SoSkillInput,
  SoSkillOutput,
  ExecSkillInput,
  ExecSkillOutput,
  EnableSkillInput,
  EnableSkillOutput,
  SKILL_TABLE,
  SKILL_USAGE_TABLE,
  SKILL_CONFIG_TABLE,
  SKILL_DEFAULT_CONFIGS,
} from './domain/types';

export type { SkillData, SkillRecord } from './domain/types';

// sandbox 接口与实现
export type { ISandbox, SandboxResult } from './infrastructure/sandbox/ISandbox';
export { IsolatedVMSandbox } from './infrastructure/sandbox/IsolatedVMSandbox';
