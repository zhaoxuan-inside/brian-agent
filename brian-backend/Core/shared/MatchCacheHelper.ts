/**
 * @fileoverview Core 层匹配缓存辅助工具。
 *
 * 提取 LLMCore、MCPCore、SkillCore、SoulCore、ThinkingStrategyCore
 * 五者共用的缓存检查逻辑（查询 agent_* 表 → regen_rate 判定 → 返回缓存或要求重新匹配）。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import { Operator, IdGenerator } from '@brian-agent/base';

export interface MatchCacheEntry {
  binding_id: string;
  entity_id: string;
  updated: number;
}

export type RegenMode = 'random' | 'time';

export interface MatchCacheCheckResult {
  hit: boolean;
  entries?: MatchCacheEntry[];
}

/**
 * 执行匹配缓存检查。
 *
 * @param relationDb 关系数据库接入实例
 * @param cacheTable 缓存表名（agent_llm / agent_skill 等）
 * @param agentId agent 标识
 * @param regenRate 重新评估阈值（random 模式为百分比 0-100，time 模式为毫秒）
 * @param mode 'random'（百分比概率）或 'time'（时间窗口 ms）
 * @param entityIdColumn entity ID 列名（如 llm_id / skill_id / soul_id / mcp_id / strategy_id）
 * @returns 若命中缓存则 { hit: true, entries: [...] }，否则 { hit: false }
 */
export async function checkMatchCache(
  relationDb: RelationDBAccess,
  cacheTable: string,
  agentId: string,
  regenRate: number,
  mode: RegenMode,
  entityIdColumn: string,
): Promise<MatchCacheCheckResult> {
  const rows = await relationDb.select(cacheTable, {
    conditions: [
      { field: 'agent_id', operator: Operator.EQ, value: agentId },
    ],
  });

  if (rows.length === 0) {
    return { hit: false };
  }

  const entries: MatchCacheEntry[] = rows.map((r) => ({
    binding_id: String(r.id),
    entity_id: String((r as Record<string, unknown>)[entityIdColumn]),
    updated: Number(r.updated),
  }));

  if (mode === 'random') {
    const roll = Math.floor(Math.random() * 100);
    if (roll < regenRate) {
      return { hit: false };
    }
    return { hit: true, entries };
  }

  // time 模式
  const now = IdGenerator.now();
  const maxAge = regenRate; // regenRate is milliseconds in time mode
  const allFresh = entries.every((e) => now - e.updated < maxAge);
  if (allFresh) {
    return { hit: true, entries };
  }

  return { hit: false };
}

/**
 * 删除 agent 的旧绑定缓存（重新匹配前先清理）。
 */
export async function clearMatchCache(
  relationDb: RelationDBAccess,
  cacheTable: string,
  agentId: string,
): Promise<void> {
  await relationDb.delete(cacheTable, [
    { field: 'agent_id', operator: Operator.EQ, value: agentId },
  ]);
}

/**
 * 持久化新的匹配绑定。
 */
export async function persistMatchBinding(
  relationDb: RelationDBAccess,
  cacheTable: string,
  agentId: string,
  entityId: string,
  entityIdColumn: string,
  extraFields: Array<{ field: string; value: unknown }> = [],
): Promise<string> {
  const now = IdGenerator.now();
  const id = IdGenerator.generate();
  await relationDb.insert(cacheTable, [
    { field: 'id', value: id },
    { field: 'created', value: now },
    { field: 'updated', value: now },
    { field: 'agent_id', value: agentId },
    { field: entityIdColumn, value: entityId },
    ...extraFields,
  ]);
  return id;
}
