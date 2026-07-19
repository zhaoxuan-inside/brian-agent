import { z } from 'zod';
import type { DBWrapper } from './DBWrapper';

export const QueueMessageSchema = z.object({
  id: z.string(),
  queue: z.string(),
  payload: z.record(z.string(), z.any()),
  priority: z.number().min(0).max(10).default(5),
  createdAt: z.number(),
  processedAt: z.number().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),
});

export type QueueMessage = z.infer<typeof QueueMessageSchema>;

export interface MQWrapper {
  enqueue(message: Omit<QueueMessage, 'id' | 'createdAt' | 'processedAt' | 'status' | 'retryCount'>): Promise<string>;
  dequeue(queue: string): Promise<QueueMessage | undefined>;
  ack(messageId: string): Promise<void>;
  nack(messageId: string): Promise<void>;
  getQueueStats(queue: string): Promise<{ pending: number; processing: number; completed: number; failed: number }>;
  startWorker(queue: string, handler: (message: QueueMessage) => Promise<void>): void;
  stopWorker(queue: string): void;
}

export class SQLiteMQ implements MQWrapper {
  private workers: Map<string, NodeJS.Timeout> = new Map();
  private tableName: string;

  constructor(private db: DBWrapper) {
    this.tableName = 'queue_messages';
  }

  async initSchema(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        queue TEXT NOT NULL,
        payload TEXT NOT NULL,
        priority INTEGER DEFAULT 5,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        processed_at INTEGER,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3
      )
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_queue_status ON ${this.tableName}(queue, status)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_queue_priority ON ${this.tableName}(queue, priority DESC, created_at)
    `);
  }

  async enqueue(message: Omit<QueueMessage, 'id' | 'createdAt' | 'processedAt' | 'status' | 'retryCount'>): Promise<string> {
    const id = this.generateId();
    const now = Math.floor(Date.now() / 1000);
    await this.db.run(
      `INSERT INTO ${this.tableName} (id, queue, payload, priority, created_at, max_retries)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, message.queue, JSON.stringify(message.payload), message.priority, now, message.maxRetries]
    );
    return id;
  }

  async dequeue(queue: string): Promise<QueueMessage | undefined> {
    const row = await this.db.get<any>(
      `SELECT id FROM ${this.tableName}
       WHERE queue = ? AND status = 'pending'
       ORDER BY priority DESC, created_at ASC
       LIMIT 1`,
      [queue]
    );
    if (!row) return undefined;

    const result = await this.db.get<any>(
      `UPDATE ${this.tableName}
       SET status = 'processing'
       WHERE id = ? AND status = 'pending'
       RETURNING *`,
      [row.id]
    );
    if (!result) return undefined;

    return {
      id: result.id,
      queue: result.queue,
      payload: typeof result.payload === 'string' ? JSON.parse(result.payload) : result.payload,
      priority: result.priority,
      createdAt: result.created_at,
      processedAt: result.processed_at,
      status: result.status as QueueMessage['status'],
      retryCount: result.retry_count,
      maxRetries: result.max_retries,
    };
  }

  async ack(messageId: string): Promise<void> {
    await this.db.run(
      `UPDATE ${this.tableName}
       SET status = 'completed', processed_at = strftime('%s', 'now')
       WHERE id = ?`,
      [messageId]
    );
  }

  async nack(messageId: string): Promise<void> {
    await this.db.run(
      `UPDATE ${this.tableName}
       SET retry_count = retry_count + 1,
           status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'pending' END
       WHERE id = ?`,
      [messageId]
    );
  }

  async getQueueStats(queue: string): Promise<{ pending: number; processing: number; completed: number; failed: number }> {
    const results = await this.db.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count
       FROM ${this.tableName}
       WHERE queue = ?
       GROUP BY status`,
      [queue]
    );

    const stats: Record<string, number> = {};
    results.forEach(r => stats[r.status] = r.count);

    return {
      pending: stats['pending'] || 0,
      processing: stats['processing'] || 0,
      completed: stats['completed'] || 0,
      failed: stats['failed'] || 0,
    };
  }

  startWorker(queue: string, handler: (message: QueueMessage) => Promise<void>): void {
    if (this.workers.has(queue)) {
      this.stopWorker(queue);
    }

    const interval = setInterval(async () => {
      const message = await this.dequeue(queue);
      if (message) {
        try {
          await handler(message);
          await this.ack(message.id);
        } catch {
          await this.nack(message.id);
        }
      }
    }, 1000);

    this.workers.set(queue, interval);
  }

  stopWorker(queue: string): void {
    const interval = this.workers.get(queue);
    if (interval) {
      clearInterval(interval);
      this.workers.delete(queue);
    }
  }

  stopAllWorkers(): void {
    for (const [queue] of this.workers) {
      this.stopWorker(queue);
    }
  }

  private generateId(): string {
    return `mq:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  }
}