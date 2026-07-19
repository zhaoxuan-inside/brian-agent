import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../infrastructure/database';
import type { MemoryNode, MemoryEdge } from '../../shared/types';

function now(): number {
  return Date.now();
}

export class GraphStorage {
  private get db(): any {
    return getDatabase();
  }

  async createNode(node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryNode> {
    const id = uuidv4();
    const ts = now();
    const stmt = this.db.prepare(
      `INSERT INTO memory_nodes (id, user_id, type, content, source, tags, confidence, importance, metadata, created_at, updated_at, accessed_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      id,
      '',
      node.type,
      node.content,
      'graph',
      JSON.stringify([]),
      0.8,
      node.salienceScore || 0.5,
      JSON.stringify(node.metadata),
      ts,
      ts,
      ts,
      0
    );
    return { ...node, id, createdAt: ts, updatedAt: ts };
  }

  async getNode(id: string): Promise<MemoryNode | undefined> {
    const row = this.db.prepare(`SELECT * FROM memory_nodes WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.rowToNode(row);
  }

  async getAllNodes(): Promise<MemoryNode[]> {
    const rows = this.db.prepare(`SELECT * FROM memory_nodes ORDER BY created_at DESC`).all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToNode(row));
  }

  async getNodesByType(type: string): Promise<MemoryNode[]> {
    const rows = this.db.prepare(`SELECT * FROM memory_nodes WHERE type = ? ORDER BY created_at DESC`).all(type) as Record<string, unknown>[];
    return rows.map((row) => this.rowToNode(row));
  }

  async updateNode(id: string, updates: Partial<Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const ts = now();
    const setClauses: string[] = [];
    const params: unknown[] = [];

    const columnMap: Record<string, string> = {
      type: 'type',
      content: 'content',
      metadata: 'metadata',
      salienceScore: 'importance',
      retrievalCount: 'access_count',
      lastRetrieved: 'accessed_at',
      strength: 'confidence',
      decayRate: 'importance',
    };

    for (const [key, value] of Object.entries(updates)) {
      const col = columnMap[key];
      if (col) {
        setClauses.push(`${col} = ?`);
        params.push(key === 'metadata' ? JSON.stringify(value) : value);
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      params.push(ts);
      params.push(id);
      this.db.prepare(`UPDATE memory_nodes SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
    }
  }

  async deleteNode(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM memory_nodes WHERE id = ?`).run(id);
  }

  async createEdge(edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEdge> {
    const id = uuidv4();
    const ts = now();
    const stmt = this.db.prepare(
      `INSERT INTO memory_edges (id, source_node_id, target_node_id, weight, label, activation_count, direction, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      id,
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.weight,
      edge.label || null,
      edge.activationCount,
      edge.direction,
      ts,
      ts
    );
    return { ...edge, id, createdAt: ts, updatedAt: ts };
  }

  async getEdge(id: string): Promise<MemoryEdge | undefined> {
    const row = this.db.prepare(`SELECT * FROM memory_edges WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.rowToEdge(row);
  }

  async getEdgesBySource(sourceNodeId: string): Promise<MemoryEdge[]> {
    const rows = this.db.prepare(
      `SELECT * FROM memory_edges WHERE source_node_id = ? ORDER BY created_at DESC`
    ).all(sourceNodeId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEdge(row));
  }

  async getEdgesByTarget(targetNodeId: string): Promise<MemoryEdge[]> {
    const rows = this.db.prepare(
      `SELECT * FROM memory_edges WHERE target_node_id = ? ORDER BY created_at DESC`
    ).all(targetNodeId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEdge(row));
  }

  async updateEdge(id: string, updates: Partial<Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const ts = now();
    const setClauses: string[] = [];
    const params: unknown[] = [];

    const columnMap: Record<string, string> = {
      sourceNodeId: 'source_node_id',
      targetNodeId: 'target_node_id',
      weight: 'weight',
      label: 'label',
      activationCount: 'activation_count',
      direction: 'direction',
    };

    for (const [key, value] of Object.entries(updates)) {
      const col = columnMap[key];
      if (col) {
        setClauses.push(`${col} = ?`);
        params.push(value);
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      params.push(ts);
      params.push(id);
      this.db.prepare(`UPDATE memory_edges SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
    }
  }

  async deleteEdge(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM memory_edges WHERE id = ?`).run(id);
  }

  async getNeighbors(nodeId: string, depth: number = 1): Promise<MemoryNode[]> {
    const visited = new Set<string>();
    visited.add(nodeId);
    const result: { node: MemoryNode; dist: number }[] = [];

    const queue: { id: string; dist: number }[] = [{ id: nodeId, dist: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.dist > depth) continue;

      if (current.id !== nodeId) {
        const node = await this.getNode(current.id);
        if (node) {
          result.push({ node, dist: current.dist });
        }
      }

      if (current.dist < depth) {
        const nextDist = current.dist + 1;

        const outEdges = this.db.prepare(
          `SELECT target_node_id FROM memory_edges WHERE source_node_id = ?`
        ).all(current.id) as { target_node_id: string }[];

        for (const edge of outEdges) {
          if (!visited.has(edge.target_node_id)) {
            visited.add(edge.target_node_id);
            queue.push({ id: edge.target_node_id, dist: nextDist });
          }
        }

        const inEdges = this.db.prepare(
          `SELECT source_node_id FROM memory_edges WHERE target_node_id = ?`
        ).all(current.id) as { source_node_id: string }[];

        for (const edge of inEdges) {
          if (!visited.has(edge.source_node_id)) {
            visited.add(edge.source_node_id);
            queue.push({ id: edge.source_node_id, dist: nextDist });
          }
        }
      }
    }

    return result.sort((a, b) => a.dist - b.dist).map((r) => r.node);
  }

  async getNodesByTag(tagValue: string): Promise<MemoryNode[]> {
    const rows = this.db.prepare(
      `SELECT * FROM memory_nodes WHERE tags LIKE ?`
    ).all(`%${tagValue}%`) as Record<string, unknown>[];
    return rows.map((row) => this.rowToNode(row));
  }

  async addNodeTags(nodeId: string, tags: { domain?: string[]; industry?: string[]; concept?: string[]; action?: string[] }): Promise<void> {
    const allTags = [
      ...(tags.domain || []),
      ...(tags.industry || []),
      ...(tags.concept || []),
      ...(tags.action || []),
    ];
    this.db.prepare(
      `UPDATE memory_nodes SET tags = ? WHERE id = ?`
    ).run(JSON.stringify(allTags), nodeId);
  }

  async getTagsByNode(nodeId: string): Promise<{ domain: string[]; industry: string[]; concept: string[]; action: string[] }> {
    const row = this.db.prepare(
      `SELECT tags FROM memory_nodes WHERE id = ?`
    ).get(nodeId) as { tags: string } | undefined;

    const tags = row ? JSON.parse(row.tags || '[]') : [];
    return { domain: tags, industry: [], concept: [], action: [] };
  }

  async close(): Promise<void> {
  }

  private rowToNode(row: Record<string, unknown>): MemoryNode {
    return {
      id: row.id as string,
      type: (row.type as MemoryNode['type']) || 'memory',
      content: (row.content as string) || '',
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata as string) : (row.metadata as Record<string, unknown>) || {},
      salienceScore: (row.importance as number) || 0.5,
      emotionalTag: undefined,
      retrievalCount: (row.access_count as number) || 0,
      lastRetrieved: (row.accessed_at as number) || undefined,
      strength: (row.confidence as number) || 0.8,
      decayRate: 0.01,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  private rowToEdge(row: Record<string, unknown>): MemoryEdge {
    return {
      id: row.id as string,
      sourceNodeId: row.source_node_id as string,
      targetNodeId: row.target_node_id as string,
      weight: (row.weight as number) || 0.5,
      label: row.label as string | undefined,
      activationCount: (row.activation_count as number) || 0,
      direction: (row.direction as MemoryEdge['direction']) || 'undirected',
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}