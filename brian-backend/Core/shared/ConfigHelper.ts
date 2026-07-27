/**
 * @fileoverview Core 层配置辅助工具。
 *
 * 提供通用的默认配置初始化逻辑，消除各模块中重复的 ensureDefaultConfig 代码。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import { Operator } from '@brian-agent/base';
import type { DataObject } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';

/**
 * 确保配置表至少有一行默认配置（幂等）。
 *
 * @param relationDb 关系数据库接入实例
 * @param tableName 配置表名
 * @param defaults 默认字段值列表（不含 id/created/updated）
 */
export async function ensureDefaultConfig(
  relationDb: RelationDBAccess,
  tableName: string,
  defaults: DataObject[],
): Promise<void> {
  const count = await relationDb.count(tableName);
  if (count === 0) {
    const now = IdGenerator.now();
    const record: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      ...defaults,
    ];
    await relationDb.insert(tableName, record);
  }
}

/**
 * 从配置表加载第一条记录（用于单行配置表）。
 */
export async function loadConfigRecord(
  relationDb: RelationDBAccess,
  tableName: string,
): Promise<Record<string, unknown> | null> {
  return relationDb.selectOne(tableName, []);
}

/**
 * 确认记录不为 null 的辅助函数。
 */
export function requireRecord<T extends Record<string, unknown>>(
  record: T | null | undefined,
  resourceName: string,
): T {
  if (record == null) {
    throw new Error(`${resourceName} 记录不存在`);
  }
  return record;
}
