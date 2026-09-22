/**
 * @fileoverview GraphDB 数据库组件。
 *
 * 基于 LeanGraph（100% openCypher TCK 兼容的嵌入式图数据库）提供图数据库操作能力。
 * LeanGraph 底层使用 SQLite，支持完整 Cypher 查询、参数化查询、多跳遍历等。
 * GraphDBProvider 集成此组件，通过 Cypher 查询语言操作图数据（节点、边、遍历）。
 *
 * 生命周期：
 * - 首次调用 query/execute 时自动初始化 LeanGraph 客户端；
 * - open() / disconnect()：可逆的打开 / 断开（供 enableGraphDB 使用）；
 * - close()：终态关闭，执行后不可再 open，需重新初始化组件。
 */

import { statSync } from 'fs';
import { dirname, basename, extname } from 'path';
import { DatabaseError } from '../../shared/errors';

/** LeanGraph 客户端接口（避免 ESM 模块的 type-only import 问题） */
interface LeanGraphClient {
  query<T = Record<string, unknown>>(cypher: string, params?: Record<string, unknown>): Promise<T[]>;
  execute(cypher: string, params?: Record<string, unknown>): Promise<void>;
  close(): void;
}

/**
 * GraphDB 组件选项。
 */
export interface GraphDBComponentOptions {
  /** 图数据库文件路径（LeanGraph 自动推导 project 和 dataPath） */
  dbPath: string;
  /** 兼容参数（保留） */
  bufferManagerSize?: number;
  /** 兼容参数（保留） */
  enableCompression?: boolean;
  /** 是否只读 */
  readOnly?: boolean;
}

/** 兼容原有类型引用 */
export type Connection = unknown;

/**
 * GraphDB 数据库组件。
 *
 * 基于 LeanGraph 提供图数据库操作能力，直接使用 Cypher 查询语言。
 *
 * 生命周期方法：
 * - open()：打开数据库连接（可恢复）
 * - disconnect()：断开数据库连接（可恢复，供 enableGraphDB(false) 使用）
 * - close()：终态关闭（不可恢复，供 closeGraphDB 使用）
 */
export class GraphDBComponent {
  private client: LeanGraphClient | null = null;
  private initPromise: Promise<LeanGraphClient> | null = null;
  private readonly options: GraphDBComponentOptions;
  private terminated = false;
  private _project: string;
  private _dataPath: string;

  constructor(options: GraphDBComponentOptions) {
    this.options = options;
    const dir = dirname(options.dbPath);
    const file = basename(options.dbPath, extname(options.dbPath));
    this._dataPath = dir;
    this._project = file;
  }

  private async ensureClient(): Promise<LeanGraphClient> {
    if (this.terminated) {
      throw new DatabaseError('图数据库已终态关闭，不可重新打开');
    }
    if (this.client) return this.client;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const { LeanGraph } = await import('leangraph');
        return LeanGraph({
          mode: 'local',
          project: this._project,
          dataPath: this._dataPath,
        });
      })();
    }
    try {
      this.client = await this.initPromise;
      return this.client;
    } catch (err) {
      this.initPromise = null;
      throw new DatabaseError(
        `初始化 GraphDB 失败: ${this.options.dbPath} - ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * 打开图数据库连接（首次调用时自动初始化）。
   */
  open(): void {
    if (this.terminated) {
      throw new DatabaseError('图数据库已终态关闭，不可重新打开');
    }
  }

  /**
   * 断开图数据库连接（可恢复）。
   */
  disconnect(): void {
    if (this.client) {
      try {
        this.client.close();
      } catch {
        // 忽略关闭错误：关闭失败即丢弃客户端引用（client/initPromise 随后置空），底层资源随进程回收
      }
      this.client = null;
      this.initPromise = null;
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
    return this.client !== null;
  }

  /**
   * 执行 Cypher 查询并返回所有行。
   */
  async queryAll(cypher: string): Promise<Array<Record<string, unknown>>> {
    const c = await this.ensureClient();
    return c.query(cypher);
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
    const c = await this.ensureClient();
    await c.execute(cypher);
    return [];
  }

  /**
   * 执行带命名参数的 Cypher 查询。
   */
  async queryWithParams(
    cypher: string,
    params: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    const c = await this.ensureClient();
    return c.query(cypher, params);
  }

  /**
   * 检查节点是否存在。
   */
  async nodeExists(table: string, id: string): Promise<boolean> {
    const c = await this.ensureClient();
    const rows = await c.query(`MATCH (n:${table} {id: $id}) RETURN n.id AS id`, { id });
    return rows.length > 0;
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

  /** 获取底层数据库实例（LeanGraph 不暴露底层连接） */
  getConnection(): Connection {
    return null;
  }

  /**
   * 基于 Cypher 边匹配计算多跳邻居节点 ID。
   *
   * LeanGraph 不支持变长路径上的 all() 过滤，因此：
   * - depth=1：使用单边匹配 + 内联属性过滤；
   * - depth>1：迭代 BFS 逐跳展开，每跳用单边匹配 + 去重。
   *
   * @returns 邻居节点 ID 列表（不含起始节点，去重）
   */
  async queryNeighborsByCTE(params: {
    startNodeId: string;
    maxDepth: number;
    direction: 'OUT' | 'IN' | 'BOTH';
    edgeType?: string;
    onlyActive: boolean;
    fanOutThreshold: number;
  }): Promise<string[]> {
    const { startNodeId, maxDepth, direction, edgeType, onlyActive } = params;
    const c = await this.ensureClient();
    const depth = Math.max(1, Math.floor(maxDepth));

    const esc = (s: string) => s.replace(/'/g, "\\'");

    const filterParts: string[] = [];
    if (onlyActive) filterParts.push('is_active: 1');
    if (edgeType) filterParts.push(`edge_type: '${esc(edgeType)}'`);
    const filterStr = filterParts.length > 0 ? ` {${filterParts.join(', ')}}` : '';

    let arrowLeft: string;
    let arrowRight: string;
    if (direction === 'OUT')          { arrowLeft = '';  arrowRight = '>'; }
    else if (direction === 'IN')      { arrowLeft = '<'; arrowRight = '';  }
    else                               { arrowLeft = '';  arrowRight = '';  }

    const visited = new Set<string>([startNodeId]);
    const allNeighbors = new Set<string>();
    let frontier = new Set<string>([startNodeId]);

    for (let hop = 0; hop < depth; hop++) {
      if (frontier.size === 0) break;
      const nextFrontier = new Set<string>();
      const ids = Array.from(frontier).map((id) => `'${esc(id)}'`).join(',');
      const query = `MATCH (n:graph_node) WHERE n.id IN [${ids}] ` +
        `MATCH (n)${arrowLeft}-[e:graph_edge${filterStr}]-${arrowRight}(m) ` +
        `RETURN DISTINCT m.id AS node_id`;
      const rows = await c.query(query);
      for (const row of rows) {
        const nid = String(row.node_id);
        if (!visited.has(nid)) {
          visited.add(nid);
          nextFrontier.add(nid);
          allNeighbors.add(nid);
        }
      }
      frontier = nextFrontier;
    }

    return Array.from(allNeighbors);
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
}