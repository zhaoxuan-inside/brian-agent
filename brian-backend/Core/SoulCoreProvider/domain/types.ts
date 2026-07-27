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
  prompt_template_id: string | null;
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
  /** 比较裁决 */
  verdict: SoulVerdict = { better: false, reason: '' };
  /** 当前使用的 Soul ID */
  current_soul_id = '';
}

// ---------------------------------------------------------------------------
// ageSoul
// ---------------------------------------------------------------------------

/** ageSoul 入参 */
export class AgeSoulInput extends Input {}

/** ageSoul 出参 */
export class AgeSoulOutput extends Output {
  /** 老化 Soul 数量 */
  aged_count = 0;
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
  /** Prompt 模板 ID */
  prompt_template_id?: string;
}

/** configSoulCore 出参 */
export class ConfigSoulCoreOutput extends Output {
  /** 当前配置 */
  config: SoulCoreConfigRecord | null = null;
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
