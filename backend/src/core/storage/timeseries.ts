import { getDatabase } from '../../infrastructure/database';
import { generateUUIDv7 } from '../../infrastructure/uuid';

function now(): number {
  return Date.now();
}

export class TimeSeriesStorage {
  private db = getDatabase();

  insert(metric: string, value: number, tags?: Record<string, string>): void {
    const ts = now();
    const id = generateUUIDv7();
    this.db.prepare(
      `INSERT INTO time_series_data (id, metric, value, timestamp, tags) VALUES (?, ?, ?, ?, ?)`
    ).run(id, metric, value, ts, tags ? JSON.stringify(tags) : '{}');
  }

  query(
    metric: string,
    startTime: number,
    endTime: number
  ): { timestamp: number; value: number; tags: Record<string, string> }[] {
    const rows = this.db.prepare(
      `SELECT * FROM time_series_data WHERE metric = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`
    ).all(metric, startTime, endTime) as Record<string, unknown>[];

    return rows.map((row) => ({
      timestamp: row.timestamp as number,
      value: row.value as number,
      tags: JSON.parse(row.tags as string),
    }));
  }

  aggregate(
    metric: string,
    aggregateFn: 'avg' | 'sum' | 'min' | 'max' | 'count',
    startTime: number,
    endTime: number
  ): number {
    let fnExpr: string;
    switch (aggregateFn) {
      case 'avg':
        fnExpr = 'AVG(value)';
        break;
      case 'sum':
        fnExpr = 'SUM(value)';
        break;
      case 'min':
        fnExpr = 'MIN(value)';
        break;
      case 'max':
        fnExpr = 'MAX(value)';
        break;
      case 'count':
        fnExpr = 'COUNT(*)';
        break;
    }

    const row = this.db.prepare(
      `SELECT ${fnExpr} as result FROM time_series_data WHERE metric = ? AND timestamp >= ? AND timestamp <= ?`
    ).get(metric, startTime, endTime) as { result: number | null };

    return row.result ?? 0;
  }

  getLatest(metric: string): { timestamp: number; value: number } | undefined {
    const row = this.db.prepare(
      `SELECT timestamp, value FROM time_series_data WHERE metric = ? ORDER BY timestamp DESC LIMIT 1`
    ).get(metric) as { timestamp: number; value: number } | undefined;

    return row ? { timestamp: row.timestamp, value: row.value } : undefined;
  }
}