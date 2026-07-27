/**
 * @fileoverview SkillCoreProvider 领域层类型定义。
 *
 * 定义 SkillCoreContext、SkillCoreConfig、AgentSkill、SkillOptRule、SkillUsage 记录类型
 * 及各功能的 Input / Output 类型。所有 Input 继承 {@link Input}，
 * 所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output } from '@brian-agent/base';
import type { Condition, OrderBy, Page, Operation } from '@brian-agent/base';

/**
 * SkillCore 上下文（SkillCoreContext）。
 *
 * 继承 Context 基类，SkillCore 相关操作的执行上下文。
 */
export class SkillCoreContext extends Context {}

// ---------------------------------------------------------------------------
// 记录类型
// ---------------------------------------------------------------------------

/** skill_core_config 表记录 */
export interface SkillCoreConfigRecord {
  id: string;
  created: number;
  updated: number;
  regen_rate: number;
  prompt_template_id: string;
}

/** agent_skill 表记录 */
export interface AgentSkillRecord {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  skill_id: string;
}

/** skill_opt_rule 表记录 */
export interface SkillOptRuleRecord {
  id: string;
  created: number;
  updated: number;
  days: number;
  min_usage_count: number;
}

/** skill_usage 表记录 */
export interface SkillUsageRecord {
  id: string;
  created: number;
  agent_skill_id: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// matchSkill
// ---------------------------------------------------------------------------

/** matchSkill 入参 */
export class MatchSkillInput extends Input {
  /** Agent ID */
  agent_id!: string;
  /** 交互上下文 ID */
  context_id!: string;
  /** 交互记录 ID */
  interact_id!: string;
}

/** 匹配到的 Skill 条目 */
export interface MatchedSkillEntry {
  skill_id: string;
  skill_brief: string;
  relevance: number;
}

/** matchSkill 出参 */
export class MatchSkillOutput extends Output {
  /** 匹配到的 Skill 列表 */
  skills: MatchedSkillEntry[] = [];
}

// ---------------------------------------------------------------------------
// optSkill
// ---------------------------------------------------------------------------

/** optSkill 入参 */
export class OptSkillInput extends Input {
  /** Agent ID */
  agent_id!: string;
  /** 交互上下文 ID */
  context_id!: string;
  /** 交互记录 ID */
  interact_id!: string;
  /** Skill ID */
  skill_id!: string;
}

/** optSkill 出参 */
export class OptSkillOutput extends Output {
  /** 绑定记录 */
  binding: AgentSkillRecord | null = null;
}

// ---------------------------------------------------------------------------
// ageSkill
// ---------------------------------------------------------------------------

/** ageSkill 入参 */
export class AgeSkillInput extends Input {}

/** ageSkill 出参 */
export class AgeSkillOutput extends Output {
  /** 老化 Skill 数量 */
  aged_count = 0;
}

// ---------------------------------------------------------------------------
// soSkillRule
// ---------------------------------------------------------------------------

/** soSkillRule 入参 */
export class SoSkillRuleInput extends Input {
  /** 条件过滤 */
  conditions?: Condition[];
  /** 排序规则 */
  order_by?: OrderBy[];
  /** 分页参数 */
  page?: Page;
}

/** soSkillRule 出参 */
export class SoSkillRuleOutput extends Output {
  /** 规则列表 */
  list: SkillOptRuleRecord[] = [];
  /** 总数 */
  total = 0;
}

// ---------------------------------------------------------------------------
// updateSkillRule
// ---------------------------------------------------------------------------

/** updateSkillRule 入参 */
export class UpdateSkillRuleInput extends Input {
  /** 事务操作对象列表 */
  operations!: Operation[];
}

/** updateSkillRule 出参 */
export class UpdateSkillRuleOutput extends Output {}

// ---------------------------------------------------------------------------
// configSkillCore
// ---------------------------------------------------------------------------

/** configSkillCore 入参 */
export class ConfigSkillCoreInput extends Input {
  /** 重新匹配概率（0-100） */
  regen_rate?: number;
  /** Prompt 模板 ID */
  prompt_template_id?: string;
}

/** configSkillCore 出参 */
export class ConfigSkillCoreOutput extends Output {
  /** 重新生成速率（秒），缓存未过期时不重新匹配 */
  regen_rate = 0;
  /** Prompt 模板 ID */
  prompt_template_id = '';
}

// ---------------------------------------------------------------------------
// 表名
// ---------------------------------------------------------------------------

/** skill_core_config 表名 */
export const SKILL_CORE_CONFIG_TABLE = 'skill_core_config';

/** agent_skill 表名 */
export const AGENT_SKILL_TABLE = 'agent_skill';

/** skill_opt_rule 表名 */
export const SKILL_OPT_RULE_TABLE = 'skill_opt_rule';

/** skill_usage 表名 */
export const SKILL_USAGE_TABLE = 'skill_usage';
