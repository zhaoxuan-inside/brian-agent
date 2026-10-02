/**
 * 选举阈值配置存储（R8 · chg-058）
 * election_config_record：按组件持久化阈值 JSON，覆盖引擎默认值；
 * 内存缓存 + 变更即失效，供六组件适配器与配置中心 API 共用。
 */
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { DEFAULT_ELECTION_THRESHOLDS, type ElectionThresholds } from './ElectionTypes';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator } from '../query/QueryObjects';

export const ELECTION_CONFIG_TABLE = 'election_config_record';

const cache = new Map<string, { value: ElectionThresholds; loadedAt: number }>();
const CACHE_TTL_MS = 30_000;

/** 建表（基建豁免五段签名）：组合根启动时调用一次 */
export function ensureElectionConfigTable(relationDb: RelationDBAccess): void {
  relationDb.executeRaw(`
    CREATE TABLE IF NOT EXISTS "${ELECTION_CONFIG_TABLE}" (
      "id"              TEXT    NOT NULL PRIMARY KEY,
      "created"         INTEGER NOT NULL,
      "updated"         INTEGER NOT NULL,
      "component"       TEXT    NOT NULL,
      "thresholds_json" TEXT    NOT NULL DEFAULT '{}',
      "trace_id"        TEXT    NOT NULL DEFAULT ''
    )
  `);
  relationDb.executeRaw(
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_election_config_component" ON "${ELECTION_CONFIG_TABLE}" ("component")`,
  );
}

function mergeThresholds(raw: Record<string, unknown>): ElectionThresholds {
  const merged: ElectionThresholds = { ...DEFAULT_ELECTION_THRESHOLDS };
  for (const key of Object.keys(merged) as Array<keyof ElectionThresholds>) {
    const v = Number(raw[key]);
    if (Number.isFinite(v) && v > 0) merged[key] = v;
  }
  return merged;
}

/** 读取组件显式配置的阈值覆盖项（data）：仅返回存量 JSON 中出现的键，供组件在自身配置之上合并 */
export async function loadElectionThresholdOverrides(relationDb: RelationDBAccess, component: string): Promise<Partial<ElectionThresholds>> {
  try {
    const rows = await relationDb.select(ELECTION_CONFIG_TABLE, {
      conditions: [{ field: 'component', operator: Operator.EQ, value: component }],
    });
    if (!rows?.[0]) return {};
    const raw = JSON.parse(String(rows[0].thresholds_json ?? '{}')) as Record<string, unknown>;
    const overrides: Partial<ElectionThresholds> = {};
    for (const key of Object.keys(DEFAULT_ELECTION_THRESHOLDS) as Array<keyof ElectionThresholds>) {
      const v = Number(raw[key]);
      if (Number.isFinite(v) && v > 0) overrides[key] = v;
    }
    return overrides;
  } catch {
    return {};
  }
}

/** 读取组件阈值（data）：DB 覆盖值合并默认值，30s 内存缓存 */
export async function loadElectionThresholds(relationDb: RelationDBAccess, component: string): Promise<ElectionThresholds> {
  const cached = cache.get(component);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.value;
  try {
    const rows = await relationDb.select(ELECTION_CONFIG_TABLE, {
      conditions: [{ field: 'component', operator: Operator.EQ, value: component }],
    });
    const raw = rows?.[0] ? (JSON.parse(String(rows[0].thresholds_json ?? '{}')) as Record<string, unknown>) : {};
    const value = mergeThresholds(raw);
    cache.set(component, { value, loadedAt: Date.now() });
    return value;
  } catch {
    return { ...DEFAULT_ELECTION_THRESHOLDS };
  }
}

/** 保存组件阈值（orchestration）：upsert 并失效缓存 */
export async function saveElectionThresholds(
  relationDb: RelationDBAccess, component: string, patch: Partial<ElectionThresholds>,
): Promise<ElectionThresholds> {
  const current = await loadElectionThresholds(relationDb, component);
  const merged = mergeThresholds({ ...current, ...patch } as Record<string, unknown>);
  const now = IdGenerator.now();
  const fields = [
    { field: 'component', value: component },
    { field: 'thresholds_json', value: JSON.stringify(merged) },
    { field: 'updated', value: now },
  ];
  const existing = await relationDb.select(ELECTION_CONFIG_TABLE, {
    conditions: [{ field: 'component', operator: Operator.EQ, value: component }],
  });
  if (existing?.length) {
    await relationDb.update(ELECTION_CONFIG_TABLE, fields, [{ field: 'component', operator: Operator.EQ, value: component }]);
  } else {
    await relationDb.insert(ELECTION_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      ...fields,
    ]);
  }
  cache.set(component, { value: merged, loadedAt: Date.now() });
  return merged;
}

/** 测试与进程内钩子：清空缓存 */
export function clearElectionThresholdCache(): void {
  cache.clear();
}
