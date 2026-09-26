import type { Condition, OrderBy, Page } from '../../../shared/query';
import { Operator, Logic } from '../../../shared/query';
import type { SoulRecord } from '../types';

export interface SoulUsageRow {
  soul_id: string;
  usage_date: string;
  usage_count: number;
}

export interface SoulUsageStats {
  today: number;
  week: number;
  month: number;
  total: number;
}

export function resolveTargetConditions(params: {
  id?: string;
  ids?: string[];
  conditions?: Condition[];
}): Condition[] | null {
  if (params.id) {
    return [{ field: 'id', operator: Operator.EQ, value: params.id }];
  }
  if (params.ids) {
    return [{ field: 'id', operator: Operator.IN, value: params.ids }];
  }
  if (params.conditions && params.conditions.length > 0) {
    return params.conditions;
  }
  return null;
}

export function buildKeywordConditions(keyword: string): Condition[] {
  return [
    { field: 'soul_content', operator: Operator.LIKE, value: `%${keyword}%` },
    { field: 'soul_brief', operator: Operator.LIKE, value: `%${keyword}%`, logic: Logic.OR },
  ];
}

export function aggregateUsageStats(
  usageRows: SoulUsageRow[],
  today: string,
  sevenDaysAgo: string,
  thirtyDaysAgo: string,
): Map<string, SoulUsageStats> {
  const usageMap = new Map<string, SoulUsageStats>();
  for (const row of usageRows) {
    let stats = usageMap.get(row.soul_id);
    if (!stats) {
      stats = { today: 0, week: 0, month: 0, total: 0 };
      usageMap.set(row.soul_id, stats);
    }
    const cnt = row.usage_count ?? 0;
    stats.total += cnt;
    if (row.usage_date === today) stats.today += cnt;
    if (row.usage_date >= sevenDaysAgo) stats.week += cnt;
    if (row.usage_date >= thirtyDaysAgo) stats.month += cnt;
  }
  return usageMap;
}

export function getUsageValue(
  soul: SoulRecord,
  field: string,
  usageMap: Map<string, SoulUsageStats>,
): number {
  const stats = usageMap.get(soul.id);
  if (!stats) return 0;
  switch (field) {
    case 'usage_today_count':
      return stats.today;
    case 'usage_7d_count':
      return stats.week;
    case 'usage_30d_count':
      return stats.month;
    case 'usage_total_count':
      return stats.total;
    default:
      return 0;
  }
}

export function hasUsageSorting(orderBy: OrderBy[] | undefined): boolean {
  return !!orderBy?.some(
    (ob) => typeof ob.field === 'string' && ob.field.startsWith('usage_'),
  );
}

export function sortByOrder(
  souls: SoulRecord[],
  orderBy: OrderBy[],
  usageMap: Map<string, SoulUsageStats>,
): SoulRecord[] {
  souls.sort((a, b) => {
    for (const ob of orderBy) {
      const isDesc = ob.direction === 'DESC';
      let valA: unknown;
      let valB: unknown;

      if (typeof ob.field === 'string' && ob.field.startsWith('usage_')) {
        valA = getUsageValue(a, ob.field, usageMap);
        valB = getUsageValue(b, ob.field, usageMap);
      } else {
        valA = (a as unknown as Record<string, unknown>)[ob.field];
        valB = (b as unknown as Record<string, unknown>)[ob.field];
      }

      if (valA === null || valA === undefined) {
        return valB === null || valB === undefined ? 0 : isDesc ? 1 : -1;
      }
      if (valB === null || valB === undefined) {
        return isDesc ? -1 : 1;
      }
      if (valA < valB) return isDesc ? 1 : -1;
      if (valA > valB) return isDesc ? -1 : 1;
    }
    return 0;
  });
  return souls;
}

export function paginate<T>(items: T[], page: Page | undefined): T[] {
  if (!page) return items;
  const start = (page.current - 1) * page.size;
  return items.slice(start, start + page.size);
}
