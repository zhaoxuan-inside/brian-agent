/**
 * @fileoverview 记录组装公共件：消除各模块手写 id/created/updated 数据组装样板。
 *
 * 典型重复（改造前 148+ 处）：
 * ```ts
 * const now = IdGenerator.now();
 * await db.insert(TABLE, [
 *   { field: 'id', value: IdGenerator.generate() },
 *   { field: 'created', value: now },
 *   { field: 'updated', value: now },
 *   { field: 'name', value: name },
 * ]);
 * ```
 * 改造后：
 * ```ts
 * await db.insert(TABLE, newRecord({ name, parent_id }));
 * ```
 */
import type { DataObject } from './QueryObjects';
/**
 * 将扁平对象转为 `{ field, value }[]` 数据数组（不追加系统字段）。
 *
 * @param partial 字段名 → 值；undefined / null 项被过滤
 */
export declare function toDataObject(partial: Record<string, unknown>): DataObject[];
/**
 * 构造插入记录：自动补 id / created / updated（当前时刻）。
 *
 * @param partial 业务字段（undefined / null 被过滤）；如需自定义 id，传入 `id` 字段
 */
export declare function newRecord(partial: Record<string, unknown>): DataObject[];
/**
 * 构造更新补丁：自动补 updated（当前时刻）。
 *
 * @param partial 业务字段（undefined / null 被过滤）
 */
export declare function newPatch(partial: Record<string, unknown>): DataObject[];
//# sourceMappingURL=RecordBuilder.d.ts.map