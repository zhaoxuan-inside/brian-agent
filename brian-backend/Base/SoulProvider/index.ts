/**
 * @fileoverview SoulProvider 模块统一导出。
 */

// access 层
export { SoulAccess } from './access/SoulAccess';

// domain 层类型
export {
  SoulContext,
  AddSoulInput,
  AddSoulOutput,
  DelSoulInput,
  DelSoulOutput,
  UpdateSoulInput,
  UpdateSoulOutput,
  GetSoulInput,
  GetSoulOutput,
  SoSoulInput,
  SoSoulOutput,
  EnableSoulInput,
  EnableSoulOutput,
  CloseSoulInput,
  CloseSoulOutput,
  RecordSoulUsageInput,
  RecordSoulUsageOutput,
  SOUL_TABLE,
  SOUL_USAGE_TABLE,
  SOUL_CONFIG_TABLE,
  SOUL_DEFAULT_CONFIGS,
} from './domain/types';

export type { SoulData, SoulRecord } from './domain/types';
