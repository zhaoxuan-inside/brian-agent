/**
 * @fileoverview Core 层通用老化引擎。
 *
 * 消除 SkillCore.ageSkill 与 SoulCore.ageSoul 中逐行重复的逻辑。
 *
 * 用法：
 *   const engine = new AgingEngine(relationDb);
 *   const agedCount = await engine.age({
 *     ruleTable: SKILL_OPT_RULE_TABLE,
 *     bindingTable: AGENT_SKILL_TABLE,
 *     usageTable: SKILL_USAGE_TABLE,
 *     usageBindingIdColumn: 'agent_skill_id',
 *     bindingEntityIdColumn: 'skill_id',
 *     disabler: (entityId) => skillAccess.updateSkill(...),
 *   });
 */

import type { RelationDBAccess } from '@brian-agent/base';
import { Operator } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';

/** 老化规则记录 */
export interface AgingRuleRecord {
  id: string;
  days: number;
  min_usage_count: number;
}

/** 绑定记录（共用字段） */
export interface BindingRecord {
  entity_id: string;
  binding_id: string;
}

/** 老化引擎配置 */
export interface AgingConfig {
  /** 老化规则表名 */
  ruleTable: string;
  /** 绑定表名 */
  bindingTable: string;
  /** 绑定表中 entity ID 的列名 */
  bindingEntityIdColumn: string;
  /** usage 表中关联绑定 ID 的列名 */
  usageBindingIdColumn: string;
  /** usage 表名 */
  usageTable: string;
  /** 禁用回调（传入 entity ID） */
  disabler: (entityId: string) => Promise<void>;
}

export class AgingEngine {
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 执行老化：读取规则 → 统计 usage → 禁用不活跃实体。
   *
   * @returns 被老化的实体数量
   */
  async age(config: AgingConfig): Promise<number> {
    const rules = await this.loadRules(config.ruleTable);
    if (rules.length === 0) return 0;

    const bindings = await this.loadBindings(config.bindingTable, config.bindingEntityIdColumn);
    if (bindings.length === 0) return 0;

    const now = IdGenerator.now();
    const agedEntityIds = new Set<string>();

    for (const binding of bindings) {
      let allRulesMet = true;
      for (const rule of rules) {
        const threshold = now - rule.days * 24 * 60 * 60 * 1000;
        const usageCount = await this.countUsage(
          config.usageTable,
          config.usageBindingIdColumn,
          binding.binding_id,
          threshold,
        );
        if (usageCount >= rule.min_usage_count) {
          allRulesMet = false;
          break;
        }
      }
      if (allRulesMet) {
        agedEntityIds.add(binding.entity_id);
      }
    }

    for (const entityId of agedEntityIds) {
      await config.disabler(entityId);
    }

    return agedEntityIds.size;
  }

  // ---------------------------------------------------------------------------
  // 内部辅助
  // ---------------------------------------------------------------------------

  private async loadRules(table: string): Promise<AgingRuleRecord[]> {
    const rows = await this.relationDb.select(table);
    return rows.map((r) => ({
      id: String(r.id),
      days: Number(r.days),
      min_usage_count: Number(r.min_usage_count),
    }));
  }

  private async loadBindings(table: string, entityIdColumn: string): Promise<BindingRecord[]> {
    const rows = await this.relationDb.select(table);
    return rows.map((r) => ({
      entity_id: String((r as Record<string, unknown>)[entityIdColumn]),
      binding_id: String(r.id),
    }));
  }

  private async countUsage(
    usageTable: string,
    bindingIdColumn: string,
    bindingId: string,
    threshold: number,
  ): Promise<number> {
    return this.relationDb.count(usageTable, [
      { field: bindingIdColumn, operator: Operator.EQ, value: bindingId },
      { field: 'created', operator: Operator.GE, value: threshold },
    ]);
  }
}
