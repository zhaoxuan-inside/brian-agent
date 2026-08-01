/**
 * @fileoverview GraphDB 数据库组件。
 *
 * 基于 SQLite + CTE 实现图数据库的底层操作能力。
 * 通过 CypherTranslator 将 Cypher 查询翻译为 SQL，使用 better-sqlite3 执行。
 * GraphDBProvider 集成此组件，通过 Cypher 查询语言操作图数据（节点、边、遍历）。
 *
 * 生命周期：
 * - 构造时自动调用 open() 打开数据库连接；
 * - open() / disconnect()：可逆的打开 / 断开（供 enableGraphDB 使用）；
 * - close()：终态关闭，执行后不可再 open，需重新初始化组件。
 */

import type { Database as SqliteDatabase } from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync, statSync } from 'fs';
import { dirname } from 'path';
import { DatabaseError } from '../../shared/errors';
import { CypherTranslator } from './CypherTranslator';

/**
 * GraphDB 组件选项。
 */
export interface GraphDBComponentOptions {
  /** 图数据库文件路径 */
  dbPath: string;
  /** 兼容参数（保留） */
  bufferManagerSize?: number;
  /** 兼容参数（保留） */
  enableCompression?: boolean;
  /** 是否只读 */
  readOnly?: boolean;
}

/** 兼容原有类型引用 */
export type Connection = SqliteDatabase;

/**
 * GraphDB 数据库组件。
 *
 * 基于 SQLite 提供图数据库操作能力，通过 CypherTranslator 将 Cypher 翻译为 SQL。
 *
 * 生命周期方法：
 * - open()：打开数据库连接（可恢复）
 * - disconnect()：断开数据库连接（可恢复，供 enableGraphDB(false) 使用）
 * - close()：终态关闭（不可恢复，供 closeGraphDB 使用）
 */
export class GraphDBComponent {
  private db: SqliteDatabase | null = null;
  private readonly options: GraphDBComponentOptions;
  private terminated = false;
  private readonly translator = new CypherTranslator();

  constructor(options: GraphDBComponentOptions) {
    this.options = options;
    this.open();
  }

  /**
   * 打开图数据库连接。
   */
  open(): void {
    if (this.terminated) {
      throw new DatabaseError('图数据库已终态关闭，不可重新打开');
    }
    if (this.db) {
      return;
    }
    try {
      const dir = dirname(this.options.dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.db = new BetterSqlite3(this.options.dbPath, {
        readonly: this.options.readOnly ?? false,
      });
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
    } catch (err) {
      throw new DatabaseError(
        `初始化 GraphDB 失败: ${this.options.dbPath} - ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * 断开图数据库连接（可恢复）。
   */
  disconnect(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // 忽略关闭错误
      }
      this.db = null;
    }
  }

  /**
   * 终态关闭图数据库连接。
   */
  close(): void {
    this.terminated = true;
    this.disconnect();
  }

  /** 图数据库是否已打开 */
  get isOpen(): boolean {
    return this.db !== null;
  }

  /** 确保数据库连接可用 */
  private get dbOrThrow(): SqliteDatabase {
    if (!this.db) {
      throw new DatabaseError('图数据库连接未打开');
    }
    return this.db;
  }

  /**
   * 初始化图数据库 schema（创建表与索引）。
   * 幂等操作，可安全重复调用。
   */
  initSchema(): void {
    const db = this.dbOrThrow;
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_node (
        id          TEXT    NOT NULL PRIMARY KEY,
        created     INTEGER NOT NULL,
        updated     INTEGER NOT NULL,
        node_type   TEXT    NOT NULL,
        content     TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_graph_node_node_type ON graph_node(node_type);
      CREATE INDEX IF NOT EXISTS idx_graph_node_created    ON graph_node(created);
      CREATE INDEX IF NOT EXISTS idx_graph_node_updated    ON graph_node(updated);

      CREATE TABLE IF NOT EXISTS graph_edge (
        id                    TEXT    NOT NULL PRIMARY KEY,
        created               INTEGER NOT NULL,
        updated               INTEGER NOT NULL,
        from_node_id          TEXT    NOT NULL,
        to_node_id            TEXT    NOT NULL,
        edge_type             TEXT    NOT NULL,
        weight                REAL    NOT NULL DEFAULT 1.0,
        properties            TEXT,
        last_activation_time  INTEGER,
        is_active             INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (from_node_id) REFERENCES graph_node(id) ON DELETE CASCADE,
        FOREIGN KEY (to_node_id)   REFERENCES graph_node(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_graph_edge_edge_type  ON graph_edge(edge_type);
      CREATE INDEX IF NOT EXISTS idx_graph_edge_is_active  ON graph_edge(is_active);
      CREATE INDEX IF NOT EXISTS idx_graph_edge_created    ON graph_edge(created);
      CREATE INDEX IF NOT EXISTS idx_graph_edge_updated    ON graph_edge(updated);
      CREATE INDEX IF NOT EXISTS idx_graph_edge_from_node  ON graph_edge(from_node_id);
      CREATE INDEX IF NOT EXISTS idx_graph_edge_to_node    ON graph_edge(to_node_id);

      CREATE TABLE IF NOT EXISTS graph_activation_event (
        id              TEXT    NOT NULL PRIMARY KEY,
        created         INTEGER NOT NULL,
        updated         INTEGER NOT NULL,
        graph_edge_id   TEXT    NOT NULL,
        from_node_id    TEXT    NOT NULL,
        to_node_id      TEXT    NOT NULL,
        activation_time INTEGER NOT NULL,
        trigger_type    TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_graph_activation_event_edge_id ON graph_activation_event(graph_edge_id);
      CREATE INDEX IF NOT EXISTS idx_graph_activation_event_time    ON graph_activation_event(activation_time);
      CREATE INDEX IF NOT EXISTS idx_graph_activation_event_created ON graph_activation_event(created);
      CREATE INDEX IF NOT EXISTS idx_graph_activation_event_updated ON graph_activation_event(updated);

      CREATE TABLE IF NOT EXISTS graph_edge_daily_activation (
        id               TEXT    NOT NULL PRIMARY KEY,
        created          INTEGER NOT NULL,
        updated          INTEGER NOT NULL,
        graph_edge_id    TEXT    NOT NULL,
        stat_date        TEXT    NOT NULL,
        activation_count INTEGER NOT NULL DEFAULT 1,
        UNIQUE(graph_edge_id, stat_date)
      );
      CREATE INDEX IF NOT EXISTS idx_graph_edge_daily_activation_edge_id ON graph_edge_daily_activation(graph_edge_id);
      CREATE INDEX IF NOT EXISTS idx_graph_edge_daily_activation_date    ON graph_edge_daily_activation(stat_date);
      CREATE INDEX IF NOT EXISTS idx_graph_edge_daily_activation_created ON graph_edge_daily_activation(created);
      CREATE INDEX IF NOT EXISTS idx_graph_edge_daily_activation_updated ON graph_edge_daily_activation(updated);
    `);
  }

  /**
   * 执行 Cypher 查询并返回所有行。
   */
  async queryAll(cypher: string): Promise<Array<Record<string, unknown>>> {
    const { sql } = this.translator.translate(cypher);
    const db = this.dbOrThrow;
    const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;
    return rows;
  }

  /**
   * 执行 Cypher 查询并返回第一行。
   */
  async queryOne(cypher: string): Promise<Record<string, unknown> | null> {
    const rows = await this.queryAll(cypher);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * 执行 Cypher 写操作（CREATE / DELETE / SET / MERGE）。
   */
  async execute(cypher: string): Promise<Array<Record<string, unknown>>> {
    const { sql, detachDelete } = this.translator.translate(cypher);
    const db = this.dbOrThrow;

    if (detachDelete) {
      // DETACH DELETE: run in transaction for cascade
      const runAll = db.transaction(() => {
        db.prepare(sql).run();
      });
      runAll();
      return [];
    }

    db.prepare(sql).run();
    return [];
  }

  /**
   * 执行带命名参数的 Cypher 查询。
   *
   * 保持与原有接口兼容：将 $paramName 占位符替换为转义后的值。
   */
  async queryWithParams(
    cypher: string,
    params: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    let interpolated = cypher;
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `$${key}`;
      let replacement: string;
      if (value === null || value === undefined) {
        replacement = 'null';
      } else if (typeof value === 'number') {
        replacement = String(value);
      } else if (typeof value === 'boolean') {
        replacement = value ? 'true' : 'false';
      } else {
        replacement = `'${this.escape(String(value))}'`;
      }
      interpolated = interpolated.split(placeholder).join(replacement);
    }
    return this.queryAll(interpolated);
  }

  /**
   * 检查节点是否存在。
   */
  async nodeExists(table: string, id: string): Promise<boolean> {
    const row = await this.queryOne(
      `MATCH (n:${table} {id: '${this.escape(id)}'}) RETURN n.id AS id`,
    );
    return row !== null;
  }

  /**
   * 统计表中的节点数。
   */
  async countNodes(table: string, whereClause?: string): Promise<number> {
    const where = whereClause ? ` WHERE ${whereClause}` : '';
    const row = await this.queryOne(
      `MATCH (n:${table})${where} RETURN count(n) AS cnt`,
    );
    return Number(row?.cnt ?? 0);
  }

  /** 获取底层数据库实例 */
  getConnection(): SqliteDatabase {
    return this.dbOrThrow;
  }

  /**
   * 获取数据库文件磁盘占用大小（字节）。
   */
  getDiskUsage(): number {
    try {
      return statSync(this.options.dbPath).size;
    } catch {
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // 私有工具
  // -------------------------------------------------------------------------

  /** 转义字符串字面量 */
  private escape(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
}
