/**
 * @fileoverview PromptsProvider 领域层类型定义。
 *
 * 依据 `PromptsProvider-PRD.md` 定义 PromptContext、PromptTemplateData 及各功能的 Input / Output 类型。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

/**
 * Prompt 上下文（PromptContext）。
 *
 * 继承 Context 基类，Prompt 相关操作的执行上下文。
 */
export class PromptContext extends Context {}

/**
 * Prompt 模板数据对象（PromptTemplateData）。
 *
 * 用于新增 Prompt 模板；更新时使用 Partial<PromptTemplateData> 仅传入待更新字段。
 * id / created / updated 为系统字段，由 Provider 维护，不通过 Data 对象传入。
 */
export interface PromptTemplateData {
  /** Prompt 名称 */
  prompt_template_title: string;
  /** Prompt 摘要 */
  prompt_template_brief?: string;
  /** Prompt 内容（Markdown 格式模板） */
  prompt_template: string;
  /** 是否启用，默认 true；资源级启用/禁用通过 updatePrompt 修改该字段实现 */
  enable?: boolean;
}

/**
 * prompt_template 表记录（含系统字段）。
 */
export interface PromptTemplateRecord extends PromptTemplateData {
  id: string;
  created: number;
  updated: number;
  enable: boolean;
}

/**
 * prompt_template_usage 表记录。
 */
export interface PromptTemplateUsageRecord {
  id: string;
  created: number;
  updated: number;
  prompt_template_id: string;
  usage_date: string;
  usage_count: number;
}

// ---------------------------------------------------------------------------
// addPrompt
// ---------------------------------------------------------------------------

/** addPrompt 入参 */
export class AddPromptInput extends Input {
  /** Prompt 模板数据 */
  data!: PromptTemplateData;
}

/** addPrompt 出参 */
export class AddPromptOutput extends Output {
  /** 新增的 Prompt 模板 ID */
  id = '';
}

// ---------------------------------------------------------------------------
// delPrompt
// ---------------------------------------------------------------------------

/** delPrompt 入参 */
export class DelPromptInput extends Input {
  /** 按 ID 删除（支持批量） */
  ids?: string[];
  /** 按条件删除 */
  conditions?: Condition[];
}

/** delPrompt 出参 */
export class DelPromptOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// updatePrompt
// ---------------------------------------------------------------------------

/** updatePrompt 入参 */
export class UpdatePromptInput extends Input {
  /** 按 ID 更新 */
  id?: string;
  /** 按条件更新 */
  conditions?: Condition[];
  /** 待更新的字段（系统字段 id / created 不可更新） */
  data!: Partial<PromptTemplateData>;
}

/** updatePrompt 出参 */
export class UpdatePromptOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// getPrompt
// ---------------------------------------------------------------------------

/** getPrompt 入参 */
export class GetPromptInput extends Input {
  /** 按 ID 获取 */
  id?: string;
  /** 按条件获取第一条 */
  conditions?: Condition[];
}

/** getPrompt 出参 */
export class GetPromptOutput extends Output {
  /** Prompt 信息，无匹配为 null */
  prompt: PromptTemplateRecord | null = null;
}

// ---------------------------------------------------------------------------
// soPrompt
// ---------------------------------------------------------------------------

/** soPrompt 入参 */
export class SoPromptInput extends Input {
  /** 关键词搜索（匹配 prompt_template_title、prompt_template_brief） */
  keyword?: string;
  /** 条件过滤 */
  conditions?: Condition[];
  /** 排序规则（支持按时间排序） */
  order_by?: OrderBy[];
  /** 分页参数 */
  page?: Page;
}

/** soPrompt 出参 */
export class SoPromptOutput extends Output {
  /** Prompt 列表 */
  list: PromptTemplateRecord[] = [];
  /** 总数 */
  total = 0;
}

// ---------------------------------------------------------------------------
// execPrompt
// ---------------------------------------------------------------------------

/** execPrompt 入参 */
export class ExecPromptInput extends Input {
  /** Prompt 模板 ID */
  id!: string;
  /** 变量参数字典 */
  variables!: Record<string, unknown>;
}

/** execPrompt 出参 */
export class ExecPromptOutput extends Output {
  /** 渲染后的完整 Prompt 字符串 */
  prompt = '';
}

// ---------------------------------------------------------------------------
// enablePrompts
// ---------------------------------------------------------------------------

/** enablePrompts 入参 */
export class EnablePromptsInput extends Input {
  /** 是否启用 */
  enable!: boolean;
}

/** enablePrompts 出参 */
export class EnablePromptsOutput extends Output {}

// ---------------------------------------------------------------------------
// closePrompts
// ---------------------------------------------------------------------------

/** closePrompts 入参 */
export class ClosePromptInput extends Input {}

/** closePrompts 出参 */
export class ClosePromptOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名与默认配置
// ---------------------------------------------------------------------------

/** prompt_template 表名 */
export const PROMPT_TEMPLATE_TABLE = 'prompt_template';

/** prompt_template_usage 表名 */
export const PROMPT_TEMPLATE_USAGE_TABLE = 'prompt_template_usage';

/** prompts_config 配置表名 */
export const PROMPTS_CONFIG_TABLE = 'prompts_config';

/**
 * PromptsProvider 配置表默认配置项。
 *
 * PRD 4.3 节。
 */
export const PROMPTS_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: 'Prompts 组件是否启用（enablePrompts 读写）',
  },
] as const;
