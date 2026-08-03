/**
 * @fileoverview LLMProvider 领域层类型定义。
 *
 * 依据 `LLMProvider-PRD.md` 定义 LLMContext、LLMProviderData、LLMData 及各功能的
 * Input / Output 类型。所有 Input 继承 {@link Input}，所有 Context 继承
 * {@link Context}，所有 Output 继承 {@link Output}。
 *
 * 公共查询对象（Condition / OrderBy / Page / DataObject）定义于 shared/query，
 * 此处不重复定义。
 */

import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

/**
 * LLM 上下文（LLMContext）。
 *
 * 继承 Context 基类，LLM 相关操作的执行上下文。
 */
export class LLMContext extends Context {}

/**
 * LLM 提供商数据对象（LLMProviderData）。
 *
 * 用于新增 LLM 提供商；更新时使用 Partial<LLMProviderData> 仅传入待更新字段。
 * id / created / updated 为系统字段，由 Provider 维护，不通过 Data 对象传入。
 */
export interface LLMProviderData {
  /** LLM 提供商地址 */
  llm_provider_url: string;
  /** LLM 提供商名称 */
  llm_provider_title: string;
  /** LLM 提供商摘要 */
  llm_provider_brief?: string;
  /** 是否启用，默认 true；资源级启用/禁用通过 updateLLMProvider 修改该字段实现 */
  enable?: boolean;
  /** API 密钥 */
  api_key?: string;
  /** 模型列表 API 路径（默认 v1/models），留空使用默认 */
  models_path?: string;
  /** 对话补全 API 路径（默认 v1/chat/completions） */
  chat_path?: string;
  /** 每日 Token 限额（0=不限制） */
  quota_tokens_per_day?: number;
  /** 每周 Token 限额（0=不限制） */
  quota_tokens_per_week?: number;
  /** 每月 Token 限额（0=不限制） */
  quota_tokens_per_month?: number;
  /** 每日调用次数限额（0=不限制） */
  quota_calls_per_day?: number;
  /** 每周调用次数限额（0=不限制） */
  quota_calls_per_week?: number;
  /** 每月调用次数限额（0=不限制） */
  quota_calls_per_month?: number;
}

/**
 * LLM 数据对象（LLMData）。
 *
 * 用于新增 LLM（模型）；更新时使用 Partial<LLMData> 仅传入待更新字段。
 * id / created / updated 为系统字段，由 Provider 维护，不通过 Data 对象传入。
 */
export interface LLMData {
  /** LLM 提供商 ID，关联 llm_provider.id */
  llm_provider_id: string;
  /** LLM 名称 */
  llm_title: string;
  /** LLM 摘要 */
  llm_brief?: string;
  /** LLM 适用范围 */
  llm_usage?: string;
  /** 是否启用，默认 true；资源级启用/禁用通过 updateLLM 修改该字段实现 */
  enable?: boolean;
}

/**
 * llm_provider 表记录（含系统字段）。
 */
export interface LLMProviderRecord {
  /** 数据唯一标识 */
  id: string;
  /** 创建时间（毫秒时间戳） */
  created: number;
  /** 最后更新时间（毫秒时间戳） */
  updated: number;
  /** LLM 提供商地址 */
  llm_provider_url: string;
  /** LLM 提供商名称 */
  llm_provider_title: string;
  /** LLM 提供商摘要 */
  llm_provider_brief: string | null;
  /** 是否启用 */
  enable: boolean;
  /** API 密钥 */
  api_key: string | null;
  /** 模型列表 API 路径 */
  models_path: string | null;
  /** 对话补全 API 路径 */
  chat_path: string | null;
  /** 每日 Token 限额 */
  quota_tokens_per_day: number | null;
  /** 每周 Token 限额 */
  quota_tokens_per_week: number | null;
  /** 每月 Token 限额 */
  quota_tokens_per_month: number | null;
  /** 每日调用次数限额 */
  quota_calls_per_day: number | null;
  /** 每周调用次数限额 */
  quota_calls_per_week: number | null;
  /** 每月调用次数限额 */
  quota_calls_per_month: number | null;
  /** 模型列表最近抓取时间（毫秒时间戳），null 表示从未抓取 */
  models_fetched_at: number | null;
}

/**
 * llm_model 表记录（含系统字段）。
 */
export interface LLMModelRecord {
  /** 数据唯一标识 */
  id: string;
  /** 创建时间（毫秒时间戳） */
  created: number;
  /** 最后更新时间（毫秒时间戳） */
  updated: number;
  /** LLM 提供商 ID，关联 llm_provider.id */
  llm_provider_id: string;
  /** LLM 名称 */
  llm_title: string;
  /** LLM 摘要 */
  llm_brief: string | null;
}

/**
 * llm_enable 表记录（含系统字段）。
 */
export interface LLMEnableRecord {
  /** 数据唯一标识 */
  id: string;
  /** 创建时间（毫秒时间戳） */
  created: number;
  /** 最后更新时间（毫秒时间戳） */
  updated: number;
  /** LLM 提供商 ID，关联 llm_provider.id */
  llm_provider_id: string;
  /** LLM 名称 */
  llm_title: string;
  /** LLM 摘要 */
  llm_brief: string | null;
  /** LLM 适用范围 */
  llm_usage: string;
  /** 是否启用 */
  enable: boolean;
  /** 是否为默认模型 */
  is_default?: boolean;
}

/**
 * llm_usage 表记录（含系统字段）。
 */
export interface LLMUsageRecord {
  /** 数据唯一标识 */
  id: string;
  /** 创建时间（毫秒时间戳） */
  created: number;
  /** 最后更新时间（毫秒时间戳） */
  updated: number;
  /** 启用的 LLM ID，关联 llm_enable.id */
  llm_enable_id: string;
  /** 使用日期，格式 YYYY-MM-DD */
  usage_date: string;
  /** 当日使用次数 */
  usage_count: number;
}

// ---------------------------------------------------------------------------
// addLLMProvider
// ---------------------------------------------------------------------------

/** addLLMProvider 入参 */
export class AddLLMProviderInput extends Input {
  /** LLM 提供商数据 */
  data!: LLMProviderData;
}

/** addLLMProvider 出参 */
export class AddLLMProviderOutput extends Output {
  /** 新增的 LLM 提供商 ID */
  id = '';
}

// ---------------------------------------------------------------------------
// updateLLMProvider
// ---------------------------------------------------------------------------

/** updateLLMProvider 入参 */
export class UpdateLLMProviderInput extends Input {
  /** 按 ID 更新 */
  id?: string;
  /** 按条件更新 */
  conditions?: Condition[];
  /** 待更新的字段（系统字段 id / created 不可更新） */
  data!: Partial<LLMProviderData>;
}

/** updateLLMProvider 出参 */
export class UpdateLLMProviderOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// delLLMProvider
// ---------------------------------------------------------------------------

/** delLLMProvider 入参 */
export class DelLLMProviderInput extends Input {
  /** 按 ID 删除（支持批量） */
  ids?: string[];
  /** 按条件删除 */
  conditions?: Condition[];
}

/** delLLMProvider 出参 */
export class DelLLMProviderOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// soLLMProvider
// ---------------------------------------------------------------------------

/** soLLMProvider 入参 */
export class SoLLMProviderInput extends Input {
  /** 关键词搜索（匹配 llm_provider_title） */
  keyword?: string;
  /** 条件过滤 */
  conditions?: Condition[];
  /** 排序规则 */
  order_by?: OrderBy[];
  /** 分页参数 */
  page?: Page;
}

/** soLLMProvider 出参 */
export class SoLLMProviderOutput extends Output {
  /** LLM 提供商列表 */
  list: LLMProviderRecord[] = [];
  /** 总数 */
  total = 0;
}

// ---------------------------------------------------------------------------
// testLLMProvider
// ---------------------------------------------------------------------------

/** testLLMProvider 入参 */
export class TestLLMProviderInput extends Input {
  /** LLM 提供商 ID */
  id!: string;
}

/** testLLMProvider 出参 */
export class TestLLMProviderOutput extends Output {
  /** 是否连通 */
  connected = false;
  /** 响应时间（毫秒） */
  response_time_ms = 0;
  /** HTTP 状态码 */
  status_code?: number;
}

// ---------------------------------------------------------------------------
// listLLM
// ---------------------------------------------------------------------------

/** listLLM 入参 */
export class ListLLMInput extends Input {
  /** LLM 提供商 ID */
  llm_provider_id!: string;
  /** 是否强制刷新（忽略缓存） */
  force?: boolean;
}

/** listLLM 出参 */
export class ListLLMOutput extends Output {
  /** 模型列表 */
  list: LLMModelRecord[] = [];
  /** 是否来自缓存 */
  cached = false;
  /** 错误信息 */
  error?: string;
  /** 错误码 */
  error_code?: string;
}

// ---------------------------------------------------------------------------
// addLLM
// ---------------------------------------------------------------------------

/** addLLM 入参 */
export class AddLLMInput extends Input {
  /** LLM 数据 */
  data!: LLMData;
}

/** addLLM 出参 */
export class AddLLMOutput extends Output {
  /** 新增的 LLM ID */
  id = '';
}

// ---------------------------------------------------------------------------
// delLLM
// ---------------------------------------------------------------------------

/** delLLM 入参 */
export class DelLLMInput extends Input {
  /** 按 ID 删除（支持批量） */
  ids?: string[];
  /** 按条件删除 */
  conditions?: Condition[];
}

/** delLLM 出参 */
export class DelLLMOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// updateLLM
// ---------------------------------------------------------------------------

/** updateLLM 入参 */
export class UpdateLLMInput extends Input {
  /** 按 ID 更新 */
  id?: string;
  /** 按条件更新 */
  conditions?: Condition[];
  /** 待更新的字段（系统字段 id / created 不可更新） */
  data!: Partial<LLMData>;
}

/** updateLLM 出参 */
export class UpdateLLMOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// getLLM
// ---------------------------------------------------------------------------

/** getLLM 入参 */
export class GetLLMInput extends Input {
  /** 按 ID 获取 */
  id?: string;
  /** 按条件获取第一条 */
  conditions?: Condition[];
}

/** getLLM 出参 */
export class GetLLMOutput extends Output {
  /** LLM 信息，无匹配为 null */
  llm: LLMEnableRecord | null = null;
}

// ---------------------------------------------------------------------------
// soLLM
// ---------------------------------------------------------------------------

/** soLLM 入参 */
export class SoLLMInput extends Input {
  /** 关键词搜索（匹配 llm_title、llm_brief） */
  keyword?: string;
  /** 条件过滤 */
  conditions?: Condition[];
  /** 排序规则 */
  order_by?: OrderBy[];
  /** 分页参数 */
  page?: Page;
}

/** soLLM 出参 */
export class SoLLMOutput extends Output {
  /** LLM 列表 */
  list: LLMEnableRecord[] = [];
  /** 总数 */
  total = 0;
}

// ---------------------------------------------------------------------------
// execLLM
// ---------------------------------------------------------------------------

/** execLLM 入参 */
export class ExecLLMInput extends Input {
  /** LLM ID（llm_enable.id） */
  id!: string;
  /** 调用 prompt */
  prompt!: string;
  /** 其他调用参数（temperature、max_tokens、api_key、system 等） */
  params?: Record<string, unknown>;
}

/** execLLM 出参 */
export class ExecLLMOutput extends Output {
  /** 推理结果（回复内容） */
  result = '';
  /** Token 使用统计 */
  usage?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// visualizedLLM
// ---------------------------------------------------------------------------

/** visualizedLLM 入参 */
export class VisualizedLLMInput extends Input {
  /** 可视化范围：health / volume / diskUsage */
  scope!: string;
}

/** visualizedLLM 出参 */
export class VisualizedLLMOutput extends Output {
  /** 可视化数据 */
  data: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// enableLLM
// ---------------------------------------------------------------------------

/** enableLLM 入参 */
export class EnableLLMInput extends Input {
  /** 是否启用 */
  enable!: boolean;
}

/** enableLLM 出参 */
export class EnableLLMOutput extends Output {}

// ---------------------------------------------------------------------------
// closeLLM
// ---------------------------------------------------------------------------

/** closeLLM 入参 */
export class CloseLLMInput extends Input {}

/** closeLLM 出参 */
export class CloseLLMOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名与默认配置
// ---------------------------------------------------------------------------

/** llm_provider 表名 */
export const LLM_PROVIDER_TABLE = 'llm_provider';

/** llm_model 表名 */
export const LLM_MODEL_TABLE = 'llm_model';

/** llm_enable 表名 */
export const LLM_ENABLE_TABLE = 'llm_enable';

/** llm_usage 表名 */
export const LLM_USAGE_TABLE = 'llm_usage';

/** llm_config 配置表名 */
export const LLM_CONFIG_TABLE = 'llm_config';

/**
 * LLMProvider 配置表默认配置项。
 *
 * PRD 4.5 节。
 */
export const LLM_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: 'LLM 组件是否启用（enableLLM 读写）',
  },
  {
    config_key: 'default_quota_tokens_per_day',
    config_value: '0',
    value_type: 'INT',
    description: '默认每日 Token 限额（0 为不限制）',
  },
  {
    config_key: 'default_quota_tokens_per_week',
    config_value: '0',
    value_type: 'INT',
    description: '默认每周 Token 限额（0 为不限制）',
  },
  {
    config_key: 'default_quota_tokens_per_month',
    config_value: '0',
    value_type: 'INT',
    description: '默认每月 Token 限额（0 为不限制）',
  },
  {
    config_key: 'default_quota_calls_per_day',
    config_value: '0',
    value_type: 'INT',
    description: '默认每日调用次数限额（0 为不限制）',
  },
  {
    config_key: 'default_quota_calls_per_week',
    config_value: '0',
    value_type: 'INT',
    description: '默认每周调用次数限额（0 为不限制）',
  },
  {
    config_key: 'default_quota_calls_per_month',
    config_value: '0',
    value_type: 'INT',
    description: '默认每月调用次数限额（0 为不限制）',
  },
] as const;
