/**
 * @fileoverview Log 领域服务：纯数据加工（查询条件组装、行→记录映射），零 I/O。
 */

import type { Condition } from '../../../shared/query';
import { Operator } from '../../../shared/query';
import type { LogRecord } from '../types';

/**
 * 组装日志查询条件：level / source / trace_id / work_id / run_id /
 * keyword（message LIKE）/ start_time / end_time（created 区间）。
 *
 * @param input 已过滤为非空字段的查询入参
 * @returns 条件数组；无有效条件时返回 undefined（表示全表查询）
 */
export function buildLogConditions(
  input: Partial<Pick<LogRecord, 'level' | 'source' | 'trace_id' | 'work_id' | 'run_id'>> & {
    keyword?: string;
    start_time?: number;
    end_time?: number;
  },
): Condition[] | undefined {
  const conditions: Condition[] = [];
  if (input.level) conditions.push({ field: 'level', operator: Operator.EQ, value: input.level });
  if (input.source) conditions.push({ field: 'source', operator: Operator.EQ, value: input.source });
  if (input.trace_id) conditions.push({ field: 'trace_id', operator: Operator.EQ, value: input.trace_id });
  if (input.work_id) conditions.push({ field: 'work_id', operator: Operator.EQ, value: input.work_id });
  if (input.run_id) conditions.push({ field: 'run_id', operator: Operator.EQ, value: input.run_id });
  if (input.keyword) conditions.push({ field: 'message', operator: Operator.LIKE, value: `%${input.keyword}%` });
  if (input.start_time !== undefined) conditions.push({ field: 'created', operator: Operator.GE, value: input.start_time });
  if (input.end_time !== undefined) conditions.push({ field: 'created', operator: Operator.LE, value: input.end_time });
  return conditions.length > 0 ? conditions : undefined;
}

/**
 * 将日志表原始行映射为 LogRecord（metadata 反序列化 JSON）。
 */
export function rowToLogRecord(row: Record<string, unknown>): LogRecord {
  let metadata: Record<string, unknown> | undefined;
  const rawMeta = row.metadata as string | null;
  if (rawMeta) {
    try {
      metadata = JSON.parse(rawMeta) as Record<string, unknown>;
    } catch {
      metadata = undefined;
    }
  }
  return {
    id: String(row.id),
    created: Number(row.created),
    updated: Number(row.updated),
    level: row.level as LogRecord['level'],
    source: row.source as LogRecord['source'],
    message: String(row.message ?? ''),
    trace_id: row.trace_id ? String(row.trace_id) : undefined,
    caller: row.caller ? String(row.caller) : undefined,
    work_id: row.work_id ? String(row.work_id) : undefined,
    run_id: row.run_id ? String(row.run_id) : undefined,
    metadata,
    elapsed_ms: row.elapsed_ms ? Number(row.elapsed_ms) : undefined,
  };
}
