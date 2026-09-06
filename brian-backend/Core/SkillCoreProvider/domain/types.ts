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
  similarity_threshold: number;
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
  /** 调用方传入的既有绑定（agent 表为唯一绑定事实源，Agent 模块评估后写入）；传入时确定性水合，不再按任务重选 */
  bound_skill_ids?: string[];
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
  /** 兼容保留：绑定已收敛至 Agent 表（agent.skill_ids_json），此处 id 恒为空串，仅回传 agent_id/skill_id */
  binding: AgentSkillRecord | null = null;
}

// ---------------------------------------------------------------------------
// ageSkill
// ---------------------------------------------------------------------------

/** ageSkill 入参 */
export class AgeSkillInput extends Input {}

/** ageSkill 出参 */
export class AgeSkillOutput extends Output {
  /** 老化候选数量（兼容保留，恒等于 stale_skills.length；删除动作由 Agent 模块评估后执行） */
  aged_count = 0;
  /** 解绑候选（按 opt 规则统计最近 days 天使用不足 min_usage_count 的 agent+skill 对；不落库） */
  stale_skills: Array<{ agent_id: string; skill_id: string; usage_count: number }> = [];
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
  /** 相似度阈值（0.0 - 1.0） */
  similarity_threshold?: number;
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

/** @deprecated 绑定已收敛至 Agent 表（agent.skill_ids_json），表停止创建；常量仅为兼容保留 */
/** agent_skill 表名 */
export const AGENT_SKILL_TABLE = 'agent_skill';

/** skill_opt_rule 表名 */
export const SKILL_OPT_RULE_TABLE = 'skill_opt_rule';

/** skill_usage 表名 */
/** skill_core_usage 表名（Core 层评估依据；键 (agent_id, skill_id)。
 * 2026-09-05 由 'skill_usage' 更名 —— 该表名让给 Base SkillProvider 的全局按天统计，消除双 schema 共表冲突 */
export const SKILL_USAGE_TABLE = 'skill_core_usage';
