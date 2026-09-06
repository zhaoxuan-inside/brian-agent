/**
 * @fileoverview SoulCoreProvider 领域层类型定义。
 *
 * 定义 SoulCoreContext、各功能的 Input / Output 类型、表名常量与默认配置。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output } from '@brian-agent/base';
import type { Condition, OrderBy, Page, Operation } from '@brian-agent/base';

/**
 * SoulCore 上下文（SoulCoreContext）。
 *
 * 继承 Context 基类，SoulCore 相关操作的执行上下文。
 */
export class SoulCoreContext extends Context {}

// ---------------------------------------------------------------------------
// 记录类型
// ---------------------------------------------------------------------------

/** soul_core_config 表记录 */
export interface SoulCoreConfigRecord {
  id: string;
  created: number;
  updated: number;
  regen_rate: number;
  similarity_threshold: number;
  prompt_template_id: string | null;
  llm_id: string | null;
}

/** agent_soul 表记录（Agent 与 Soul 的绑定关系，UNIQUE agent_id） */
export interface AgentSoulRecord {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  soul_id: string;
}

/** soul_opt_rule 表记录 */
export interface SoulOptRuleRecord {
  id: string;
  created: number;
  updated: number;
  days: number;
  min_usage_count: number;
}

/** soul_core_usage 表记录（SoulCore 用量记录，独立于 Base 层 soul_usage） */
export interface SoulCoreUsageRecord {
  id: string;
  created: number;
  agent_soul_id: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// matchSoul
// ---------------------------------------------------------------------------

/** matchSoul 入参 */
export class MatchSoulInput extends Input {
  /** Agent ID */
  agent_id!: string;
  /** 上下文 ID */
  context_id!: string;
  /** 交互 ID */
  interact_id!: string;
  /** 当前任务/工作内容（用于 LLM 依据任务领域推荐最合适的 Soul） */
  task_content?: string;
  /** 当前任务领域（由任务分析得出，如 general / coding / travel，可选） */
  task_domain?: string;
  /** 调用方传入的既有绑定（agent 表为唯一绑定事实源）；传入时确定性水合，不再按任务重选 */
  bound_soul_id?: string;
}

/** matchSoul 出参 */
export class MatchSoulOutput extends Output {
  /** 匹配到的 Soul ID */
  soul_id = '';
  /** Soul 详细信息 */
  soul: Record<string, unknown> | null = null;
  /** 是否来自缓存 */
  from_cache = false;
}

// ---------------------------------------------------------------------------
// optSoul
// ---------------------------------------------------------------------------

/** optSoul 入参 */
export class OptSoulInput extends Input {
  /** Agent ID */
  agent_id!: string;
  /** 上下文 ID */
  context_id!: string;
  /** 交互 ID */
  interact_id!: string;
  /** 候选 Soul ID */
  soul_id!: string;
  /** Agent 当前绑定的 Soul ID（Agent 表读取；传入时做 A/B 比较裁决，缺省只记 usage） */
  current_soul_id?: string;
}

/** 比较裁决结果 */
export interface SoulVerdict {
  /** 是否候选更好 */
  better: boolean;
  /** 裁决理由 */
  reason: string;
}

/** optSoul 出参 */
export class OptSoulOutput extends Output {
  /** 比较裁决（better=true 表示候选优于当前绑定） */
  verdict: SoulVerdict = { better: false, reason: '' };
  /** 裁决后实际生效的 Soul ID（better ? 候选 : 当前绑定；重绑由 Agent 模块执行） */
  current_soul_id = '';
}

// ---------------------------------------------------------------------------
// ageSoul
// ---------------------------------------------------------------------------

/** ageSoul 入参 */
export class AgeSoulInput extends Input {}

/** ageSoul 出参 */
export class AgeSoulOutput extends Output {
  /** 老化候选数量（兼容保留，恒等于 stale_souls.length；解绑由 Agent 模块评估后执行） */
  aged_count = 0;
  /** 解绑候选（按 opt 规则统计最近 days 天使用不足 min_usage_count 的 agent+soul 对；不落库） */
  stale_souls: Array<{ agent_id: string; soul_id: string; usage_count: number }> = [];
}

// ---------------------------------------------------------------------------
// soSoulRule
// ---------------------------------------------------------------------------

/** soSoulRule 入参 */
export class SoSoulRuleInput extends Input {
  /** 条件过滤 */
  conditions?: Condition[];
  /** 排序规则 */
  order_by?: OrderBy[];
  /** 分页参数 */
  page?: Page;
}

/** soSoulRule 出参 */
export class SoSoulRuleOutput extends Output {
  /** 规则列表 */
  list: SoulOptRuleRecord[] = [];
  /** 总数 */
  total = 0;
}

// ---------------------------------------------------------------------------
// updateSoulRule
// ---------------------------------------------------------------------------

/** updateSoulRule 入参 */
export class UpdateSoulRuleInput extends Input {
  /** 事务操作对象列表 */
  operations!: Operation[];
}

/** updateSoulRule 出参 */
export class UpdateSoulRuleOutput extends Output {}

// ---------------------------------------------------------------------------
// configSoulCore
// ---------------------------------------------------------------------------

/** configSoulCore 入参 */
export class ConfigSoulCoreInput extends Input {
  /** 重新匹配概率（0-100） */
  regen_rate?: number;
  /** 相似度阈值（0.0 - 1.0） */
  similarity_threshold?: number;
  /** Prompt 模板 ID */
  prompt_template_id?: string;
  /** 指定匹配用 LLM */
  llm_id?: string;
}

/** configSoulCore 出参 */
export class ConfigSoulCoreOutput extends Output {
  /** 当前配置 */
  config: SoulCoreConfigRecord | null = null;
}

// ---------------------------------------------------------------------------
// soSoulContent（按 id 读取 Soul 内容；供声明式 Agent 快照等聚合场景使用）
// ---------------------------------------------------------------------------

/** soSoulContent 入参 */
export class SoSoulContentInput extends Input {
  /** Soul ID */
  soul_id!: string;
}

/** soSoulContent 出参 */
export class SoSoulContentOutput extends Output {
  /** Soul 内容（不存在时为空串） */
  content = '';
}

// ---------------------------------------------------------------------------
// 表名
// ---------------------------------------------------------------------------

/** soul_core_config 配置表名 */
export const SOUL_CORE_CONFIG_TABLE = 'soul_core_config';

/** agent_soul 表名（Agent 与 Soul 的绑定关系） */
export const AGENT_SOUL_TABLE = 'agent_soul';

/** soul_opt_rule 表名（Soul 优化老化规则） */
export const SOUL_OPT_RULE_TABLE = 'soul_opt_rule';

/** soul_core_usage 表名（SoulCore 用量记录，独立于 Base 层 soul_usage） */
export const SOUL_CORE_USAGE_TABLE = 'soul_core_usage';
