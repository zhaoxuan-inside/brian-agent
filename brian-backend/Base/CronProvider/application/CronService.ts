import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { checkCron, nextRunTime } from '../../ToolProvider/CronUtils';
import { ValidationError, NotFoundError } from '../../shared/errors';
import type { Logger } from '../../shared/aop/AopProxy';
import {
  CRON_TASK_TABLE,
  CRON_TASK_RUN_TABLE,
  CRON_RUN_STATUS,
} from '../domain/types';
import type {
  CronTaskRecord,
  CronTaskRunRecord,
} from '../domain/types';

export type CronHandler = () => Promise<void>;

export interface CronTaskRegistration {
  name: string;
  description?: string;
  defaultCron: string;
  handler: CronHandler;
}

export class CronService {
  
  private readonly handlers = new Map<string, CronHandler>();

  
  private timer: ReturnType<typeof setInterval> | null = null;

  
  private ticking = false;

  
  private readonly running = new Set<string>();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logger?: Logger,
  ) {}

  
  
  

  

  async registerTask(reg: CronTaskRegistration): Promise<void> {
    if (!reg.name) throw new ValidationError('registerTask 需要提供 name');
    if (!reg.handler) throw new ValidationError(`任务 ${reg.name} 缺少 handler`);

    const check = checkCron(reg.defaultCron);
    if (!check.valid) {
      throw new ValidationError(`任务 ${reg.name} 默认 cron 非法：${check.error}`);
    }

    this.handlers.set(reg.name, reg.handler);

    const existing = this.getTaskRow(reg.name);
    if (!existing) {
      const now = IdGenerator.now();
      const cron = check.normalized;
      const next = nextRunTime(cron, now) ?? 0;
      this.relationDb.executeRaw(
        `INSERT INTO "${CRON_TASK_TABLE}" ("id", "name", "description", "cron", "enabled", "last_run", "next_run", "created", "updated") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [IdGenerator.generate(), reg.name, reg.description ?? '', cron, 1, 0, next, now, now],
      );
    } else if (existing.cron !== check.normalized) {
      
      const now = IdGenerator.now();
      const next = nextRunTime(check.normalized, now) ?? 0;
      this.relationDb.executeRaw(
        `UPDATE "${CRON_TASK_TABLE}" SET "cron" = ?, "next_run" = ?, "updated" = ? WHERE "name" = ?`,
        [check.normalized, next, now, reg.name],
      );
    }
  }

  
  
  

  
  start(): void {
    if (this.timer) return;
    this.recomputeStaleNextRuns();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        this.logger?.error?.('CronProvider tick error', { error: err instanceof Error ? err.message : String(err) });
      });
    }, 1000);
  }

  
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  
  private recomputeStaleNextRuns(): void {
    try {
      const now = IdGenerator.now();
      const rows = this.relationDb.queryRaw<{ name: string; cron: string; next_run: number; enabled: number }>(
        `SELECT "name", "cron", "next_run", "enabled" FROM "${CRON_TASK_TABLE}"`, [],
      );
      for (const row of rows || []) {
        if (row.enabled === 1 && (row.next_run === 0 || row.next_run <= now)) {
          const next = nextRunTime(row.cron, now) ?? 0;
          this.relationDb.executeRaw(
            `UPDATE "${CRON_TASK_TABLE}" SET "next_run" = ? WHERE "name" = ?`,
            [next, row.name],
          );
        }
      }
    } catch (err) {
      
      this.logger?.warn?.('CronService.recomputeStaleNextRuns 重算过期 next_run 失败（best-effort，等待 tick 兜底）', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  
  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = IdGenerator.now();
      const rows = this.relationDb.queryRaw<{ name: string; cron: string; next_run: number; enabled: number }>(
        `SELECT "name", "cron", "next_run", "enabled" FROM "${CRON_TASK_TABLE}"`, [],
      );
      for (const row of rows || []) {
        if (row.enabled !== 1) continue;
        if (row.next_run === 0 || row.next_run > now) continue;
        if (!this.handlers.has(row.name)) continue;
        if (this.running.has(row.name)) continue;

        
        const next = nextRunTime(row.cron, now) ?? 0;
        this.relationDb.executeRaw(
          `UPDATE "${CRON_TASK_TABLE}" SET "next_run" = ? WHERE "name" = ?`,
          [next, row.name],
        );

        void this.executeTask(row.name, this.handlers.get(row.name)!, false);
      }
    } finally {
      this.ticking = false;
    }
  }

  
  
  

  

  private async executeTask(name: string, handler: CronHandler, _manual: boolean): Promise<CronTaskRunRecord> {
    const task = this.getTaskRow(name);
    if (!task) throw new NotFoundError('定时任务', name);

    this.running.add(name);
    const runId = IdGenerator.generate();
    const startedAt = IdGenerator.now();

    try {
      this.relationDb.executeRaw(
        `INSERT INTO "${CRON_TASK_RUN_TABLE}" ("id", "task_id", "task_name", "started_at", "finished_at", "status", "result", "error", "created") VALUES (?, ?, ?, ?, 0, ?, '', '', ?)`,
        [runId, task.id, name, startedAt, CRON_RUN_STATUS.RUNNING, startedAt],
      );

      let result = '';
      let status: string = CRON_RUN_STATUS.SUCCESS;
      let error = '';

      try {
        await handler();
        result = '执行成功';
      } catch (err: unknown) {
        status = CRON_RUN_STATUS.FAILED;
        error = err instanceof Error ? err.message : String(err);
        result = '执行失败';
        this.logger?.error?.(`Cron task ${name} failed`, { error });
      }

      const finishedAt = IdGenerator.now();
      this.relationDb.executeRaw(
        `UPDATE "${CRON_TASK_RUN_TABLE}" SET "finished_at" = ?, "status" = ?, "result" = ?, "error" = ? WHERE "id" = ?`,
        [finishedAt, status, result, error, runId],
      );

      this.relationDb.executeRaw(
        `UPDATE "${CRON_TASK_TABLE}" SET "last_run" = ?, "updated" = ? WHERE "name" = ?`,
        [finishedAt, finishedAt, name],
      );

      return {
        id: runId,
        task_id: task.id,
        task_name: name,
        started_at: startedAt,
        finished_at: finishedAt,
        status,
        result,
        error,
        created: startedAt,
      };
    } finally {
      this.running.delete(name);
    }
  }

  
  
  

  listTasks(): CronTaskRecord[] {
    const rows = this.relationDb.queryRaw<Record<string, unknown>>(
      `SELECT * FROM "${CRON_TASK_TABLE}" ORDER BY "created" ASC`, [],
    );
    return (rows || []).map((r) => this.toTaskRecord(r));
  }

  getTask(name: string): CronTaskRecord | null {
    return this.getTaskRow(name);
  }

  setCron(name: string, cron: string): CronTaskRecord | null {
    const task = this.getTaskRow(name);
    if (!task) throw new NotFoundError('定时任务', name);

    const check = checkCron(cron);
    if (!check.valid) throw new ValidationError(`cron 非法：${check.error}`);

    const now = IdGenerator.now();
    const next = nextRunTime(check.normalized, now) ?? 0;
    this.relationDb.executeRaw(
      `UPDATE "${CRON_TASK_TABLE}" SET "cron" = ?, "next_run" = ?, "updated" = ? WHERE "name" = ?`,
      [check.normalized, next, now, name],
    );
    return this.getTask(name);
  }

  setEnabled(name: string, enabled: boolean): CronTaskRecord | null {
    const task = this.getTaskRow(name);
    if (!task) throw new NotFoundError('定时任务', name);

    const now = IdGenerator.now();
    let next = task.next_run;
    if (enabled && (next === 0 || next <= now)) {
      next = nextRunTime(task.cron, now) ?? 0;
    }
    this.relationDb.executeRaw(
      `UPDATE "${CRON_TASK_TABLE}" SET "enabled" = ?, "next_run" = ?, "updated" = ? WHERE "name" = ?`,
      [enabled ? 1 : 0, next, now, name],
    );
    return this.getTask(name);
  }

  
  async trigger(name: string): Promise<CronTaskRunRecord> {
    const handler = this.handlers.get(name);
    if (!handler) throw new NotFoundError('定时任务 handler', name);
    return this.executeTask(name, handler, true);
  }

  listRuns(name?: string, limit = 50): CronTaskRunRecord[] {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit) || 50, 500));
    let sql = `SELECT * FROM "${CRON_TASK_RUN_TABLE}"`;
    const params: unknown[] = [];
    if (name) {
      sql += ` WHERE "task_name" = ?`;
      params.push(name);
    }
    sql += ` ORDER BY "created" DESC LIMIT ?`;
    params.push(safeLimit);
    const rows = this.relationDb.queryRaw<Record<string, unknown>>(sql, params);
    return (rows || []).map((r) => this.toRunRecord(r));
  }

  
  
  

  private getTaskRow(name: string): CronTaskRecord | null {
    const rows = this.relationDb.queryRaw<Record<string, unknown>>(
      `SELECT * FROM "${CRON_TASK_TABLE}" WHERE "name" = ? LIMIT 1`, [name],
    );
    return rows.length > 0 ? this.toTaskRecord(rows[0]) : null;
  }

  private toTaskRecord(raw: Record<string, unknown>): CronTaskRecord {
    return {
      id: raw['id'] as string,
      name: raw['name'] as string,
      description: raw['description'] as string,
      cron: raw['cron'] as string,
      enabled: Number(raw['enabled'] ?? 1),
      last_run: Number(raw['last_run'] ?? 0),
      next_run: Number(raw['next_run'] ?? 0),
      created: Number(raw['created'] ?? 0),
      updated: Number(raw['updated'] ?? 0),
    };
  }

  private toRunRecord(raw: Record<string, unknown>): CronTaskRunRecord {
    return {
      id: raw['id'] as string,
      task_id: raw['task_id'] as string,
      task_name: raw['task_name'] as string,
      started_at: Number(raw['started_at'] ?? 0),
      finished_at: Number(raw['finished_at'] ?? 0),
      status: raw['status'] as string,
      result: raw['result'] as string,
      error: raw['error'] as string,
      created: Number(raw['created'] ?? 0),
    };
  }
}
