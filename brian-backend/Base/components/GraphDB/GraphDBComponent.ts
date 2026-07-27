/**
 * @fileoverview GraphDB 数据库组件。
 *
 * 封装 graphdblite（Rust 实现的嵌入式原生图数据库），提供图数据的底层操作能力。
 * GraphDBProvider 集成此组件，通过 Cypher 查询语言操作图数据（节点、边、遍历）。
 *
 * 注：原 congraphdb 因缺少 Linux 原生绑定迁至 graphdblite，对外接口保持一致。
 */

import { Database, WriteTransaction, ReadTransaction } from 'graphdblite';
import { DatabaseError } from '../../shared/errors';

/**
 * GraphDB 组件选项。
 */
export interface GraphDBComponentOptions {
  /** 图数据库文件路径 */
  dbPath: string;
  /** 缓冲区大小（字节，graphdblite 不支持，保留兼容） */
  bufferManagerSize?: number;
  /** 是否启用压缩（graphdblite 不支持，保留兼容） */
  enableCompression?: boolean;
  /** 是否只读 */
  readOnly?: boolean;
}

/** graphdblite 写事务的简化类型（兼容原有 Connection 类型引用） */
export type Connection = WriteTransaction;

/**
 * GraphDB 数据库组件。
 *
 * 封装 graphdblite，提供 Cypher 查询执行、节点/边 CRUD、图遍历等能力。
 */
export class GraphDBComponent {
  private readonly db: Database;

  constructor(options: GraphDBComponentOptions) {
    try {
      if (options.readOnly) {
        this.db = Database.openWithTimeout(options.dbPath, 5000);
      } else {
        this.db = new Database(options.dbPath);
      }
    } catch (err) {
      throw new DatabaseError(
        `初始化 GraphDB 失败: ${options.dbPath} - ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 初始化图数据库 schema（创建索引）。
   *
   * graphdblite 使用 label-based schema，节点/边通过 Cypher CREATE 隐式创建，
   * 无需显式创建 Node Table / Rel Table。此处仅创建性能索引。
   *
   * 幂等操作，可安全重复调用。
   */
  initSchema(): void {
    try {
      const tx = this.db.beginWrite();
      try {
        this.tryExecIndex(() => tx.createIndex('graph_node', 'node_type'));
        this.tryExecIndex(() => tx.createIndex('graph_node', 'created'));
        this.tryExecIndex(() => tx.createIndex('graph_node', 'updated'));
        this.tryExecIndex(() => tx.createIndex('graph_edge', 'edge_type'));
        this.tryExecIndex(() => tx.createIndex('graph_edge', 'is_active'));
        this.tryExecIndex(() => tx.createIndex('graph_activation_event', 'graph_edge_id'));
        this.tryExecIndex(() => tx.createIndex('graph_activation_event', 'activation_time'));
        this.tryExecIndex(() => tx.createIndex('graph_edge_daily_activation', 'graph_edge_id'));
        this.tryExecIndex(() => tx.createIndex('graph_edge_daily_activation', 'stat_date'));
        tx.commit();
      } catch {
        try { tx.rollback(); } catch { /* ignore */ }
      }
    } catch {
      // 索引创建为可选优化
    }
  }

  /**
   * 执行 Cypher 查询并返回所有行。
   */
  async queryAll(cypher: string): Promise<Array<Record<string, unknown>>> {
    const rows = this.db.query(cypher);
    return rows as Array<Record<string, unknown>>;
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
    const rows = this.db.execute(cypher);
    return rows as Array<Record<string, unknown>>;
  }

  /**
   * 执行带命名参数的 Cypher 查询。
   *
   * graphdblite 不支持命名参数，采用值插值（已在上层 escape 处理）实现兼容。
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
      `MATCH (n:${table} {id: '${this.escape(id)}'}) RETURN count(n) AS cnt`,
    );
    return Number(row?.cnt ?? 0) > 0;
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

  /**
   * 关闭图数据库连接（终态操作）。
   */
  close(): void {
    try {
      this.db.close();
    } catch {
      // 忽略
    }
  }

  /** 获取底层数据库实例 */
  getConnection(): Database {
    return this.db;
  }

  // -------------------------------------------------------------------------
  // 私有工具
  // -------------------------------------------------------------------------

  /** 转义 Cypher 字符串字面量（防注入） */
  private escape(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /** 尝试执行索引创建（忽略重复创建错误） */
  private tryExecIndex(fn: () => void): void {
    try {
      fn();
    } catch {
      // 索引已存在
    }
  }
}
