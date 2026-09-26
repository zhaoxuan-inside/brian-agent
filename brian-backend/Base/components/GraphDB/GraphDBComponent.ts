import { statSync } from 'fs';
import { dirname, basename, extname } from 'path';
import { DatabaseError } from '../../shared/errors';

interface LeanGraphClient {
  query<T = Record<string, unknown>>(cypher: string, params?: Record<string, unknown>): Promise<T[]>;
  execute(cypher: string, params?: Record<string, unknown>): Promise<void>;
  close(): void;
}

export interface GraphDBComponentOptions {

  dbPath: string;

  bufferManagerSize?: number;

  enableCompression?: boolean;

  readOnly?: boolean;
}

export type Connection = unknown;

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

  open(): void {
    if (this.terminated) {
      throw new DatabaseError('图数据库已终态关闭，不可重新打开');
    }
  }

  disconnect(): void {
    if (this.client) {
      try {
        this.client.close();
      } catch {

      }
      this.client = null;
      this.initPromise = null;
    }
  }

  close(): void {
    this.terminated = true;
    this.disconnect();
  }

  get isOpen(): boolean {
    return this.client !== null;
  }

  async queryAll(cypher: string): Promise<Array<Record<string, unknown>>> {
    const c = await this.ensureClient();
    return c.query(cypher);
  }

  async queryOne(cypher: string): Promise<Record<string, unknown> | null> {
    const rows = await this.queryAll(cypher);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(cypher: string): Promise<Array<Record<string, unknown>>> {
    const c = await this.ensureClient();
    await c.execute(cypher);
    return [];
  }

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

  getDiskUsage(): number {
    try {
      return statSync(this.options.dbPath).size;
    } catch {
      return 0;
    }
  }
}
