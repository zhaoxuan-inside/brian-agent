/**
 * Agent layer database type.
 * This is compatible with better-sqlite3's Database class but avoids
 * requiring the @types/better-sqlite3 package to be installed.
 */
export interface AgentDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown | undefined;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
}
