import { Input, Context, Output } from '@brian-agent/base';

export class ConfigContext extends Context {}

export interface ConfigRegistration {
  layer: string;
  module: string;
  category: string;
  config_key: string;
  config_name: string;
  config_description?: string;
  config_type: string;
  config_default: unknown;
  config_enum_values?: unknown[];
  readable?: boolean;
  writable?: boolean;
}

export class RegisterConfigInput extends Input {
  registrations!: ConfigRegistration[];
}

export class RegisterConfigOutput extends Output {
  registered_count = 0;
}

export class UpdateLayerPrivilegeInput extends Input {
  layer!: string;
  readable?: boolean;
  writable?: boolean;
}

export class UpdateLayerPrivilegeOutput extends Output {
  privilege: Record<string, unknown> = {};
}

export class UpdateModulePrivilegeInput extends Input {
  module!: string;
  readable?: boolean;
  writable?: boolean;
}

export class UpdateModulePrivilegeOutput extends Output {
  privilege: Record<string, unknown> = {};
}

export class UpdateConfigPrivilegeInput extends Input {
  config_key!: string;
  readable?: boolean;
  writable?: boolean;
}

export class UpdateConfigPrivilegeOutput extends Output {
  privilege: Record<string, unknown> = {};
}

export class GetPrivilegeTreeInput extends Input {}

export class GetPrivilegeTreeOutput extends Output {
  layers: Array<Record<string, unknown>> = [];
}

export class GetConfigDetailInput extends Input {
  layer?: string;
  module?: string;
  category?: string;
  readable_only?: boolean;
}

export class GetConfigDetailOutput extends Output {
  layers: Array<Record<string, unknown>> = [];
}

export class GetConfigItemInput extends Input {
  config_key!: string;
}

export class GetConfigItemOutput extends Output {
  config_item: Record<string, unknown> = {};
}

export class UpdateConfigInput extends Input {
  config_key!: string;
  value!: unknown;
}

export class UpdateConfigOutput extends Output {}

export class ConfigConfigInput extends Input {
  default_readable?: boolean;
  default_writable?: boolean;
}

export class ConfigConfigOutput extends Output {
  config: Record<string, unknown> = {};
}

export class GetConfigHistoryInput extends Input {
  
  config_key?: string;
  
  start_time?: number;
  
  end_time?: number;
  
  limit?: number;
}

export class GetConfigHistoryOutput extends Output {
  
  records: ConfigHistoryRecord[] = [];
}

export interface ConfigHistoryRecord {
  id: string;
  config_key: string;
  old_value: unknown;
  new_value: unknown;
  change_time: number;
  operator: string;
}

export const CONFIG_REGISTRY_TABLE = 'config_registry';
export const CONFIG_LAYER_PRIVILEGE_TABLE = 'config_layer_privilege';
export const CONFIG_MODULE_PRIVILEGE_TABLE = 'config_module_privilege';
export const CONFIG_CONFIG_TABLE = 'config_config';
export const CONFIG_SNAPSHOT_TABLE = 'config_snapshot';
export const CONFIG_HISTORY_TABLE = 'config_history';

export const VALID_LAYERS = ['BASE', 'CORE', 'AGENT', 'ORCHESTRATION', 'APPLICATION'] as const;

export class CreateConfigItemInput extends Input {
  layer!: string;
  module!: string;
  category!: string;
  config_key!: string;
  config_name!: string;
  config_description?: string;
  config_type!: string;
  config_default!: unknown;
  config_enum_values?: unknown[];
}

export class CreateConfigItemOutput extends Output {
  config_item: Record<string, unknown> = {};
}

export class DeleteConfigItemInput extends Input {
  config_key!: string;
}

export class DeleteConfigItemOutput extends Output {}
