import { z } from 'zod';

export interface DBWrapper {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  run(sql: string, params?: any[]): Promise<{ changes: number; lastInsertId: number }>;
  get<T>(sql: string, params?: any[]): Promise<T | undefined>;
  close(): void;
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

export interface Transaction {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  run(sql: string, params?: any[]): Promise<{ changes: number; lastInsertId: number }>;
  get<T>(sql: string, params?: any[]): Promise<T | undefined>;
}

export const SQLiteConfigSchema = z.object({
  path: z.string(),
  verbose: z.boolean().default(false),
});

export type SQLiteConfig = z.infer<typeof SQLiteConfigSchema>;

export class SQLiteWrapper implements DBWrapper {
  private db: any;

  constructor(config: SQLiteConfig) {
    const sqlite3 = require('better-sqlite3');
    this.db = sqlite3(config.path, {
      verbose: config.verbose ? console.log : undefined,
    });
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare(sql);
        const result = params ? stmt.all(...params) : stmt.all();
        resolve(result as T[]);
      } catch (error) {
        reject(error);
      }
    });
  }

  async run(sql: string, params?: any[]): Promise<{ changes: number; lastInsertId: number }> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        resolve({
          changes: result.changes,
          lastInsertId: result.lastInsertRowid || 0,
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async get<T>(sql: string, params?: any[]): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare(sql);
        const result = params ? stmt.get(...params) : stmt.get();
        resolve(result as T | undefined);
      } catch (error) {
        reject(error);
      }
    });
  }

  close(): void {
    this.db.close();
  }

  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        this.db.transaction(async () => {
          const tx: Transaction = {
            query: (sql, params) => this.query(sql, params),
            run: (sql, params) => this.run(sql, params),
            get: (sql, params) => this.get(sql, params),
          };
          const result = await fn(tx);
          resolve(result);
        })();
      } catch (error) {
        reject(error);
      }
    });
  }
}