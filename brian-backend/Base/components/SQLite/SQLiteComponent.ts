import BetterSqlite3 from 'better-sqlite3';
import type { Database, Statement } from 'better-sqlite3';
import { existsSync, mkdirSync, statSync } from 'fs';
import { dirname } from 'path';
import { DatabaseError } from '../../shared/errors';

export interface SQLiteComponentOptions {

  dbPath: string;

  wal?: boolean;

  foreignKeys?: boolean;

  verbose?: boolean;

  verbose_logger?: (message: string) => void;
}

export class SQLiteComponent {

  protected readonly db: Database;

  protected readonly dbPath: string;

  constructor(options: SQLiteComponentOptions) {
    this.dbPath = options.dbPath;

    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      this.db = new BetterSqlite3(this.dbPath, options.verbose
        ? { verbose: (msg?: unknown) => options.verbose_logger?.(`[SQLite] ${String(msg)}`) }
        : undefined);

      if (options.wal ?? true) {
        this.db.pragma('journal_mode = WAL');
      }

      if (options.foreignKeys ?? true) {
        this.db.pragma('foreign_keys = ON');
      }
    } catch (err) {
      throw new DatabaseError(
        `初始化 SQLite 数据库失败: ${this.dbPath} - ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): Statement {
    return this.db.prepare(sql);
  }

  pragma(pragma: string): unknown {
    return this.db.pragma(pragma);
  }

  getDiskUsage(): number {
    try {
      return statSync(this.dbPath).size;
    } catch {
      return 0;
    }
  }

  getDatabase(): Database {
    return this.db;
  }

  close(): void {
    try {
      this.db.close();
    } catch {

    }
  }

  walCheckpoint(mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'PASSIVE'): { busy: boolean; log: number; checkpointed: number } {
    try {
      const result = this.db.pragma(`wal_checkpoint(${mode})`) as { busy: number; log: number; checkpointed: number };
      return {
        busy: result.busy === 1,
        log: result.log,
        checkpointed: result.checkpointed,
      };
    } catch {
      return { busy: false, log: 0, checkpointed: 0 };
    }
  }
}
