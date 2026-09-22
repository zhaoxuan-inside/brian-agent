/**
 * @fileoverview Config 模块统一导出。
 */

export { ConfigAccess } from './access/ConfigAccess';

export {
  ConfigContext,
  UpdateLayerPrivilegeInput,
  UpdateLayerPrivilegeOutput,
  UpdateModulePrivilegeInput,
  UpdateModulePrivilegeOutput,
  GetConfigDetailInput,
  GetConfigDetailOutput,
  GetConfigItemInput,
  GetConfigItemOutput,
  UpdateConfigInput,
  UpdateConfigOutput,
  ConfigConfigInput,
  ConfigConfigOutput,
  GetConfigHistoryInput,
  GetConfigHistoryOutput,
  CONFIG_LAYER_PRIVILEGE_TABLE,
  CONFIG_MODULE_PRIVILEGE_TABLE,
  CONFIG_CONFIG_TABLE,
  VALID_LAYERS,
} from './domain/types';

export type { ConfigRegistration, ConfigHistoryRecord } from './domain/types';
