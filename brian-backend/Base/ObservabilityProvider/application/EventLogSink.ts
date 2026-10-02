import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import type { TaskEvent } from '@brian-agent/shared';
import { TASK_EVENT_TABLE } from '../domain/types';

interface PendingRow {
  sql: string;
  params: unknown[];
}

/**
 * EventLogSink：事件批量落库（队列 + 50ms/200 条窗口），SSE 发帧不等落库。
 * flush() 供 run 收尾/读侧可见性强制等待（ADR-013）。
 */
export class EventLogSink {
  private queue: PendingRow[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> = Promise.resolve();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly windowMs = 50,
    private readonly maxBatch = 200,
  ) {}

  write(ev: TaskEvent): void {
    this.queue.push(this.toRow(ev));
    if (this.queue.length >= this.maxBatch) {
      void this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.windowMs);
    }
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flushing = this.flushing.then(() => this.drain());
    await this.flushing;
  }

  private async drain(): Promise<void> {
    const batch = this.queue;
    this.queue = [];
    if (!batch.length) return;
    try {
      for (const row of batch) {
        this.relationDb.executeRaw(row.sql, row.params);
      }
    } catch (err) {
      // 落库失败不阻断业务：观测数据尽力而为
      void err;
    }
  }

  private toRow(ev: TaskEvent): PendingRow {
    const now = IdGenerator.now();
    const sql = `INSERT OR IGNORE INTO "${TASK_EVENT_TABLE}" (
      "id","created","updated","session_id","run_id","work_id","seq",
      "kind","event_type","ts","agent_id","round","span_json","ref_json","payload_json"
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const params = [
      IdGenerator.generate(), now, now, ev.session_id, ev.run_id, ev.work_id, ev.seq,
      ev.kind, ev.type, ev.ts, ev.agent_id ?? '', ev.round ?? null,
      JSON.stringify(ev.span ?? {}), JSON.stringify(ev.ref ?? {}), JSON.stringify(ev.payload ?? {}),
    ];
    return { sql, params };
  }
}
