/**
 * 组件实例名称查询（观测事件展示冗余）。
 * 事件 payload 以组件 ID 为唯一关联锚点；名称仅作展示，统一经此查询，
 * 避免各发射点各自实现同名查询（防重）。
 */
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';

export type ComponentTitleLookup = (id: string, table: string, titleCol: string) => string;

export function createComponentTitleLookup(relationDb: RelationDBAccess): ComponentTitleLookup {
  return (id: string, table: string, titleCol: string): string => {
    if (!id) return '';
    try {
      const rows = relationDb.queryRaw<Record<string, unknown>>(
        `SELECT "${titleCol}" AS "n" FROM "${table}" WHERE "id" = ? LIMIT 1`,
        [id],
      );
      const raw = rows?.[0]?.n;
      return raw != null ? String(raw).trim() : '';
    } catch {
      return '';
    }
  };
}
