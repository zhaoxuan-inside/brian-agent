/**
 * @fileoverview Config 领域层类型定义。
 *
 * Config 模块管理系统配置元数据注册、三层权限模型（Layer → Module → Category）、
 * 以及向下层模块代理所有配置操作。
 */

import { Input, Context, Output } from '@brian-agent/base';

export class ConfigContext extends Context {}

// ---------------------------------------------------------------------------
// RegisterConfig
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// UpdateLayerPrivilege
// ---------------------------------------------------------------------------

export class UpdateLayerPrivilegeInput extends Input {
  layer!: string;
  readable?: boolean;
  writable?: boolean;
}

export class UpdateLayerPrivilegeOutput extends Output {
  privilege: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// UpdateModulePrivilege
// ---------------------------------------------------------------------------

export class UpdateModulePrivilegeInput extends Input {
  module!: string;
  readable?: boolean;
  writable?: boolean;
}

export class UpdateModulePrivilegeOutput extends Output {
  privilege: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// UpdateConfigPrivilege
// ---------------------------------------------------------------------------

export class UpdateConfigPrivilegeInput extends Input {
  config_key!: string;
  readable?: boolean;
  writable?: boolean;
}

export class UpdateConfigPrivilegeOutput extends Output {
  privilege: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// GetPrivilegeTree
// ---------------------------------------------------------------------------

export class GetPrivilegeTreeInput extends Input {}

export class GetPrivilegeTreeOutput extends Output {
  layers: Array<Record<string, unknown>> = [];
}

// ---------------------------------------------------------------------------
// GetConfigDetail
// ---------------------------------------------------------------------------

export class GetConfigDetailInput extends Input {
  layer?: string;
  module?: string;
  category?: string;
  readable_only?: boolean;
}

export class GetConfigDetailOutput extends Output {
  layers: Array<Record<string, unknown>> = [];
}

// ---------------------------------------------------------------------------
// GetConfigItem
// ---------------------------------------------------------------------------

export class GetConfigItemInput extends Input {
  config_key!: string;
}

export class GetConfigItemOutput extends Output {
  config_item: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// UpdateConfig
// ---------------------------------------------------------------------------

export class UpdateConfigInput extends Input {
  config_key!: string;
  value!: unknown;
}

export class UpdateConfigOutput extends Output {}

// ---------------------------------------------------------------------------
// ConfigConfig (self-configuration)
// ---------------------------------------------------------------------------

export class ConfigConfigInput extends Input {
  default_readable?: boolean;
  default_writable?: boolean;
}

export class ConfigConfigOutput extends Output {
  config: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// GetConfigHistory（配置变更历史；Config-PRD / TODO-List §2）
// ---------------------------------------------------------------------------

export class GetConfigHistoryInput extends Input {
  /** 配置项（可选；缺省查全局变更历史） */
  config_key?: string;
  /** 起始时间（毫秒时间戳；可选） */
  start_time?: number;
  /** 结束时间（毫秒时间戳；可选） */
  end_time?: number;
  /** 返回条数上限（缺省 100） */
  limit?: number;
}

export class GetConfigHistoryOutput extends Output {
  /** 变更记录（change_time 降序） */
  records: ConfigHistoryRecord[] = [];
}

/** 配置变更历史记录 */
export interface ConfigHistoryRecord {
  id: string;
  config_key: string;
  old_value: unknown;
  new_value: unknown;
  change_time: number;
  operator: string;
}

// ---------------------------------------------------------------------------
// 表名常量
// ---------------------------------------------------------------------------

export const CONFIG_REGISTRY_TABLE = 'config_registry';
export const CONFIG_LAYER_PRIVILEGE_TABLE = 'config_layer_privilege';
export const CONFIG_MODULE_PRIVILEGE_TABLE = 'config_module_privilege';
export const CONFIG_CONFIG_TABLE = 'config_config';
export const CONFIG_SNAPSHOT_TABLE = 'config_snapshot';
export const CONFIG_HISTORY_TABLE = 'config_history';

export const VALID_LAYERS = ['BASE', 'CORE', 'AGENT', 'ORCHESTRATION', 'APPLICATION'] as const;

// ---------------------------------------------------------------------------
// CreateConfigItem
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// DeleteConfigItem
// ---------------------------------------------------------------------------

export class DeleteConfigItemInput extends Input {
  config_key!: string;
}

export class DeleteConfigItemOutput extends Output {}
