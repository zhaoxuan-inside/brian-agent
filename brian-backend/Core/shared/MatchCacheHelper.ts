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
    if (regenRate === 0) return { hit: true, entries };
    if (regenRate >= 100) return { hit: false };
    const roll = Math.floor(Math.random() * 100);
    if (roll < regenRate) {
      return { hit: false };
    }
    return { hit: true, entries };
  }

  
  const now = IdGenerator.now();
  const maxAge = regenRate;
  const allFresh = entries.every((e) => now - e.updated < maxAge);
  if (allFresh) {
    return { hit: true, entries };
  }

  return { hit: false };
}

export async function clearMatchCache(
  relationDb: RelationDBAccess,
  cacheTable: string,
  agentId: string,
): Promise<void> {
  await relationDb.delete(cacheTable, [
    { field: 'agent_id', operator: Operator.EQ, value: agentId },
  ]);
}

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
