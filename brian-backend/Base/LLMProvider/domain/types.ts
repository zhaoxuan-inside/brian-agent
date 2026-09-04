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
import type {
  LLMEvent,
  LLMMessage,
  LLMToolSpec,
  ParsedToolCall,
} from '../../shared/llm/LLMEvent';

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
  /** 模型列表最近抓取时间（毫秒时间戳） */
  models_fetched_at?: number;
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
  /** LLM 类型：text / vision / embedding */
  llm_type?: string;
  /** 是否启用，默认 true */
  enable?: boolean;
  /** 是否为默认模型 */
  is_default?: boolean;
  /** 最大 Token 数，不超过模型提供商上限 */
  max_tokens?: number;
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
 * llm_cache 表记录（含系统字段）。
 */
export interface LLMCacheRecord {
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
  /** 模型参数（从提供商 API 返回，JSON 字符串） */
  llm_param: string | null;
}

/**
 * llm_available 表记录（含系统字段）。
 */
export interface LLMAvailableRecord {
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
  /** LLM 类型：text / vision / embedding */
  llm_type: string;
  /** 是否启用 */
  enable: boolean;
  /** 是否为默认模型 */
  is_default?: boolean;
  /** 最大 Token 数 */
  max_tokens?: number;
  /** 模型用途描述（用于模型动态选择） */
  model_usage?: string;
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
  /** 可用 LLM ID，关联 llm_available.id */
  llm_available_id: string;
  /** 使用日期，格式 YYYY-MM-DD */
  usage_date: string;
  /** 当日使用次数 */
  usage_count: number;
  /** 当日累计输入 Token 数 */
  input_tokens: number;
  /** 当日累计输出 Token 数 */
  output_tokens: number;
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
  list: LLMCacheRecord[] = [];
  /** 是否来自缓存 */
  cached = false;
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
// soLLMById（保留类型供外部兼容，内部已合并到 soLLM）
// ---------------------------------------------------------------------------

export class GetLLMInput extends Input {
  id?: string;
  conditions?: Condition[];
}

export class GetLLMOutput extends Output {
  llm: LLMAvailableRecord | null = null;
}

// ---------------------------------------------------------------------------
// soLLM（查询可用模型，支持关键词搜索名称）
// ---------------------------------------------------------------------------

/** soLLM 入参 */
export class SoLLMInput extends Input {
  /** 关键词搜索（匹配 llm_title） */
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
  list: LLMAvailableRecord[] = [];
  /** 总数 */
  total = 0;
}

// ---------------------------------------------------------------------------
// execLLM
// ---------------------------------------------------------------------------

/** execLLM 入参 */
export class ExecLLMInput extends Input {
  /** LLM ID（llm_available.id），为空则使用系统默认模型 */
  id!: string;
  /** 用户消息内容（必填） */
  prompt!: string;
  /** 系统提示词（可选），前置为 system 消息 */
  system?: string;
  /** 采样温度（可选） */
  temperature?: number;
  /** 最大 Token 数（可选），未指定时使用模型默认 max_tokens */
  max_tokens?: number;
  /** 其他透传参数（可选），原样进入请求体 */
  extra?: Record<string, unknown>;
  /** 禁止模型降级回退（可选），true 时仅调用指定模型，不尝试其他候选模型 */
  no_fallback?: boolean;
  /** 是否启用 SSE 流式返回（可选），true 时通过 onDelta 逐 token 回调 */
  stream?: boolean;
  /** 流式回调：每收到一个 delta token 时调用 */
  onDelta?: (delta: string) => void;
}

/** execLLM 出参 */
export class ExecLLMOutput extends Output {
  /** 推理结果（回复内容） */
  result = '';
  /** 输入的 prompt 内容 */
  input_prompt = '';
  /** 输入 Token 数量 */
  input_tokens = 0;
  /** 输出 Token 数量 */
  output_tokens = 0;
  /** 调用耗时（毫秒） */
  duration_ms = 0;
  /** 模型提供商返回的原始响应正文（未经解析） */
  raw_response = '';
}

// ---------------------------------------------------------------------------
// execLLMEvents（Runtime v2 · 阶段 0，Loop-PRD §4）
// ---------------------------------------------------------------------------

/** execLLMEvents 入参 */
export class ExecLLMEventsInput extends Input {
  /** LLM ID（llm_available.id），为空则使用系统默认模型 */
  id!: string;
  /** 原生消息数组（优先于 prompt；严格角色交替，tool 仅可连排在 assistant tool_calls 后） */
  messages?: LLMMessage[];
  /** 单轮用户消息（messages 为空时的兼容入口） */
  prompt?: string;
  /** 系统提示词（messages 为空时前置为 system 消息） */
  system?: string;
  /** 采样温度（可选） */
  temperature?: number;
  /** 最大 Token 数（可选） */
  max_tokens?: number;
  /** 原生工具规格（JSON Schema 形式，经 zod 在上层转换） */
  tools?: LLMToolSpec[];
  /** 工具选择策略（默认 auto） */
  tool_choice?: 'auto' | 'none' | 'required';
  /** 其他透传参数（原样进入请求体） */
  extra?: Record<string, unknown>;
  /** 禁止模型降级回退（true 时仅调用指定模型） */
  no_fallback?: boolean;
  /** 外部取消信号（真取消，贯穿请求与流读取全程） */
  signal?: AbortSignal;
  /** 流内空闲看门狗毫秒数（连续无 chunk 超时中止，默认 30000） */
  idle_watchdog_ms?: number;
  /** 流事件回调：每个归一化 LLMEvent 触发一次 */
  on_event?: (event: LLMEvent) => void;
}

/** execLLMEvents 出参 */
export class ExecLLMEventsOutput extends Output {
  /** 聚合后的回复内容（text_delta 累计） */
  result = '';
  /** 聚合后的思考内容（reasoning_delta 累计） */
  reasoning = '';
  /** 聚合完成的完整工具调用（finish_reason=tool-calls 时非空） */
  tool_calls: ParsedToolCall[] = [];
  /** 结束原因（tool-calls / stop / aborted / error） */
  finish_reason = '';
  /** 输入 Token 数 */
  input_tokens = 0;
  /** 输出 Token 数 */
  output_tokens = 0;
  /** 调用耗时（毫秒） */
  duration_ms = 0;
  /** 聚合后的完整请求消息（实际发往模型的 messages，供调试） */
  wire_messages: LLMMessage[] = [];
}

// ---------------------------------------------------------------------------
// embedLLM
// ---------------------------------------------------------------------------

/** embedLLM 入参 */
export class EmbedLLMInput extends Input {
  /** LLM ID（llm_available.id），为空则使用系统默认 embedding 模型 */
  id!: string;
  /** 待向量化的文本 */
  input!: string;
}

/** embedLLM 出参 */
export class EmbedLLMOutput extends Output {
  /** 向量（浮点数组） */
  embedding: number[] = [];
  /** 输入 Token 数量 */
  input_tokens = 0;
  /** 调用耗时（毫秒） */
  duration_ms = 0;
  /** 模型提供商返回的原始响应正文（未经解析） */
  raw_response = '';
}

// ---------------------------------------------------------------------------
// genLLMAttr
// ---------------------------------------------------------------------------

/** genLLMAttr 入参 */
export class GenLLMAttrInput extends Input {
  /** 模型 ID（llm_available.id），为该模型生成「简介」与「模型用途」 */
  id!: string;
}

/** genLLMAttr 出参 */
export class GenLLMAttrOutput extends Output {
  /** 生成的简介（llm_brief） */
  llm_brief = '';
  /** 生成的模型用途（model_usage） */
  model_usage = '';
}

// ---------------------------------------------------------------------------
// visualizedLLM
// ---------------------------------------------------------------------------

export class VisualizedLLMInput extends Input {
  scope!: string;
}

export class VisualizedLLMOutput extends Output {
  data: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// enableLLM
// ---------------------------------------------------------------------------

export class EnableLLMInput extends Input {
  enable!: boolean;
}

export class EnableLLMOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名
// ---------------------------------------------------------------------------

/** llm_provider 表名 */
export const LLM_PROVIDER_TABLE = 'llm_provider';

/** llm_cache 表名（模型缓存，从提供商 API 拉取） */
export const LLM_CACHE_TABLE = 'llm_cache';

/** llm_available 表名（系统可用模型） */
export const LLM_AVAILABLE_TABLE = 'llm_available';

/** llm_usage 表名 */
export const LLM_USAGE_TABLE = 'llm_usage';

/** llm_config 配置表名 */
export const LLM_CONFIG_TABLE = 'llm_config';
