/**
 * @fileoverview Config 模块统一导出。
 */

export { ConfigAccess } from './access/ConfigAccess';

export {
  ConfigContext,
  RegisterConfigInput,
  RegisterConfigOutput,
  UpdateLayerPrivilegeInput,
  UpdateLayerPrivilegeOutput,
  UpdateModulePrivilegeInput,
  UpdateModulePrivilegeOutput,
  UpdateConfigPrivilegeInput,
  UpdateConfigPrivilegeOutput,
  GetPrivilegeTreeInput,
  GetPrivilegeTreeOutput,
  GetConfigDetailInput,
  GetConfigDetailOutput,
  GetConfigItemInput,
  GetConfigItemOutput,
  UpdateConfigInput,
  UpdateConfigOutput,
  ConfigConfigInput,
  ConfigConfigOutput,
  CONFIG_REGISTRY_TABLE,
  CONFIG_LAYER_PRIVILEGE_TABLE,
  CONFIG_MODULE_PRIVILEGE_TABLE,
  CONFIG_CONFIG_TABLE,
  VALID_LAYERS,
} from './domain/types';

export type { ConfigRegistration } from './domain/types';
