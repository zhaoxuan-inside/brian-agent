import type { Condition } from '../../../shared/query';
import { Operator } from '../../../shared/query';
import type { LogRecord } from '../types';

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
