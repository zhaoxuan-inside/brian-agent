import type { DBWrapper } from '../DBWrapper';

export interface GraphNode {
  id: string;
  label: string;
  properties: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface GraphEdge {
  id: string;
  fromId: string;
  toId: string;
  relationship: string;
  weight: number;
  properties: Record<string, any>;
  activationCount: number;
  lastActivationTime: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class SQLiteGraphDB {
  private nodesTable: string;
  private edgesTable: string;
  private activationEventsTable: string;

  constructor(
    private db: DBWrapper
  ) {
    this.nodesTable = 'graph_nodes';
    this.edgesTable = 'graph_edges';
    this.activationEventsTable = 'graph_activation_events';
  }

  async initSchema(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.nodesTable} (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        properties TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.edgesTable} (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        relationship TEXT NOT NULL,
        weight REAL DEFAULT 0.5,
        properties TEXT DEFAULT '{}',
        activation_count INTEGER DEFAULT 0,
        last_activation_time INTEGER DEFAULT (strftime('%s', 'now')),
        is_active INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (from_id) REFERENCES ${this.nodesTable}(id) ON DELETE CASCADE,
        FOREIGN KEY (to_id) REFERENCES ${this.nodesTable}(id) ON DELETE CASCADE
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.activationEventsTable} (
        id TEXT PRIMARY KEY,
        edge_id TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        activation_time INTEGER DEFAULT (strftime('%s', 'now')),
        trigger_type TEXT DEFAULT 'user_query',
        FOREIGN KEY (edge_id) REFERENCES ${this.edgesTable}(id) ON DELETE CASCADE
      )
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON ${this.edgesTable}(from_id)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON ${this.edgesTable}(to_id)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_graph_edges_relationship ON ${this.edgesTable}(relationship)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_graph_edges_active ON ${this.edgesTable}(is_active)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_graph_activation_edge ON ${this.activationEventsTable}(edge_id)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_graph_activation_time ON ${this.activationEventsTable}(activation_time)
    `);
  }

  async addNode(id: string, label: string, properties: Record<string, any> = {}): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db.run(
      `INSERT OR REPLACE INTO ${this.nodesTable} (id, label, properties, created_at, updated_at)
       VALUES (?, ?, ?, COALESCE((SELECT created_at FROM ${this.nodesTable} WHERE id = ?), ?), ?)`,
      [id, label, JSON.stringify(properties), id, now, now]
    );
  }

  async getNode(id: string): Promise<GraphNode | undefined> {
    const row = await this.db.get<any>(
      `SELECT * FROM ${this.nodesTable} WHERE id = ?`,
      [id]
    );
    if (!row) return undefined;
    return this.mapRowToNode(row);
  }

  async deleteNode(id: string): Promise<void> {
    await this.db.run(`DELETE FROM ${this.nodesTable} WHERE id = ?`, [id]);
  }

  async addEdge(
    fromId: string,
    toId: string,
    relationship: string,
    weight: number = 0.5,
    properties: Record<string, any> = {}
  ): Promise<string> {
    const id = await this.generateEdgeId(fromId, toId, relationship);
    const existing = await this.db.get<any>(
      `SELECT id, activation_count, created_at FROM ${this.edgesTable} WHERE id = ?`,
      [id]
    );

    if (existing) {
      await this.db.run(
        `UPDATE ${this.edgesTable}
         SET weight = ?, properties = ?, activation_count = activation_count + 1,
             last_activation_time = ?, updated_at = ?
         WHERE id = ?`,
        [weight, JSON.stringify(properties), Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), id]
      );
    } else {
      const now = Math.floor(Date.now() / 1000);
      await this.db.run(
        `INSERT INTO ${this.edgesTable} (id, from_id, to_id, relationship, weight, properties, activation_count, last_activation_time, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)`,
        [id, fromId, toId, relationship, weight, JSON.stringify(properties), now, now, now]
      );
    }

    return id;
  }

  async getEdge(id: string): Promise<GraphEdge | undefined> {
    const row = await this.db.get<any>(
      `SELECT * FROM ${this.edgesTable} WHERE id = ?`,
      [id]
    );
    if (!row) return undefined;
    return this.mapRowToEdge(row);
  }

  async getEdges(nodeId: string): Promise<GraphEdge[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM ${this.edgesTable} WHERE (from_id = ? OR to_id = ?) AND is_active = 1`,
      [nodeId, nodeId]
    );
    return rows.map((r: any) => this.mapRowToEdge(r));
  }

  async deleteEdge(id: string): Promise<void> {
    await this.db.run(
      `DELETE FROM ${this.activationEventsTable} WHERE edge_id = ?`,
      [id]
    );
    await this.db.run(
      `DELETE FROM ${this.edgesTable} WHERE id = ?`,
      [id]
    );
  }

  async getNeighbors(nodeId: string, depth: number = 1): Promise<GraphNode[]> {
    const visited = new Set<string>([nodeId]);
    const result: GraphNode[] = [];

    let currentIds = [nodeId];
    for (let d = 0; d < depth; d++) {
      if (currentIds.length === 0) break;

      const placeholders = currentIds.map(() => '?').join(',');
      const edges = await this.db.query<any>(
        `SELECT from_id, to_id FROM ${this.edgesTable}
         WHERE (from_id IN (${placeholders}) OR to_id IN (${placeholders}))
         AND is_active = 1`,
        [...currentIds, ...currentIds]
      );

      const nextIds: string[] = [];
      for (const edge of edges) {
        for (const id of [edge.from_id, edge.to_id]) {
          if (!visited.has(id)) {
            visited.add(id);
            nextIds.push(id);
            const node = await this.getNode(id);
            if (node) result.push(node);
          }
        }
      }
      currentIds = nextIds;
    }

    return result;
  }

  async activateEdge(
    fromId: string,
    toId: string,
    triggerType: string = 'user_query'
  ): Promise<void> {
    const edgeId = await this.generateEdgeId(fromId, toId, 'related');
    const now = Math.floor(Date.now() / 1000);

    await this.db.run(
      `UPDATE ${this.edgesTable}
       SET activation_count = activation_count + 1,
           last_activation_time = ?,
           updated_at = ?
       WHERE id = ?`,
      [now, now, edgeId]
    );

    await this.db.run(
      `INSERT INTO ${this.activationEventsTable} (id, edge_id, from_id, to_id, activation_time, trigger_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [this.generateId(), edgeId, fromId, toId, now, triggerType]
    );
  }

  async ageOldEdges(monthsThreshold: number = 1): Promise<number> {
    const cutoffTime = Math.floor(Date.now() / 1000) - monthsThreshold * 30 * 24 * 60 * 60;
    const result = await this.db.run(
      `UPDATE ${this.edgesTable}
       SET is_active = 0
       WHERE last_activation_time < ? AND is_active = 1`,
      [cutoffTime]
    );
    return result.changes;
  }

  async ageLowActivationEdges(
    weekThreshold: number = 7,
    minActivations: number = 10,
    agePercent: number = 0.1
  ): Promise<number> {
    const cutoffTime = Math.floor(Date.now() / 1000) - weekThreshold * 24 * 60 * 60;

    const lowActivationEdges = await this.db.query<any>(
      `SELECT e.id, e.activation_count
       FROM ${this.edgesTable} e
       LEFT JOIN ${this.activationEventsTable} ae ON e.id = ae.edge_id
       WHERE e.is_active = 1
       GROUP BY e.id
       HAVING COUNT(CASE WHEN ae.activation_time > ? THEN 1 END) < ?
       ORDER BY e.activation_count ASC`,
      [cutoffTime, minActivations]
    );

    const threshold = Math.ceil(lowActivationEdges.length * agePercent);
    const edgesToAge = lowActivationEdges.slice(0, threshold);

    for (const edge of edgesToAge) {
      await this.db.run(
        `UPDATE ${this.edgesTable} SET is_active = 0 WHERE id = ?`,
        [edge.id]
      );
    }

    return edgesToAge.length;
  }

  async query(
    query: string,
    _params: Record<string, any> = {}
  ): Promise<GraphQueryResult> {
    const nodes = await this.db.query<any>(
      `SELECT * FROM ${this.nodesTable} WHERE label LIKE ?`,
      [`%${query}%`]
    );
    const edges = await this.db.query<any>(
      `SELECT * FROM ${this.edgesTable} WHERE relationship LIKE ? AND is_active = 1`,
      [`%${query}%`]
    );

    return {
      nodes: nodes.map((r: any) => this.mapRowToNode(r)),
      edges: edges.map((r: any) => this.mapRowToEdge(r)),
    };
  }

  async getAllNodes(): Promise<GraphNode[]> {
    const rows = await this.db.query<any>(`SELECT * FROM ${this.nodesTable}`);
    return rows.map((r: any) => this.mapRowToNode(r));
  }

  async getAllEdges(): Promise<GraphEdge[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM ${this.edgesTable} WHERE is_active = 1`
    );
    return rows.map((r: any) => this.mapRowToEdge(r));
  }

  async getEdgeActivationCount(
    fromId: string,
    toId: string,
    sinceSeconds: number
  ): Promise<number> {
    const edgeId = await this.generateEdgeId(fromId, toId, 'related');
    const cutoffTime = Math.floor(Date.now() / 1000) - sinceSeconds;

    const row = await this.db.get<any>(
      `SELECT COUNT(*) as count FROM ${this.activationEventsTable}
       WHERE edge_id = ? AND activation_time > ?`,
      [edgeId, cutoffTime]
    );
    return row?.count || 0;
  }

  private async generateEdgeId(
    fromId: string,
    toId: string,
    relationship: string
  ): Promise<string> {
    const sorted = [fromId, toId].sort();
    return `edge:${sorted[0]}:${sorted[1]}:${relationship}`;
  }

  private generateId(): string {
    return `evt:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  }

  private mapRowToNode(row: any): GraphNode {
    return {
      id: row.id,
      label: row.label,
      properties: typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToEdge(row: any): GraphEdge {
    return {
      id: row.id,
      fromId: row.from_id,
      toId: row.to_id,
      relationship: row.relationship,
      weight: row.weight,
      properties: typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties,
      activationCount: row.activation_count,
      lastActivationTime: row.last_activation_time,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}