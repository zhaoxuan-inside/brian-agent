import { MemoryNode, MemoryEdge } from '@shared/types';
import { db } from './database';
import { v4 as uuidv4 } from 'uuid';

export class GraphStorage {
  private sqlite = db.getInstance();

  createNode(node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>): MemoryNode {
    const id = uuidv4();
    const now = Date.now();
    const metadata = JSON.stringify(node.metadata);

    this.sqlite.prepare(`
      INSERT INTO memory_nodes (
        id, type, content, metadata, salience_score, emotional_tag,
        retrieval_count, last_retrieved, strength, decay_rate,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      node.type,
      node.content,
      metadata,
      node.salienceScore,
      node.emotionalTag,
      node.retrievalCount,
      node.lastRetrieved,
      node.strength,
      node.decayRate,
      now,
      now
    );

    return {
      ...node,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  getNode(id: string): MemoryNode | undefined {
    const result = this.sqlite.prepare(`
      SELECT * FROM memory_nodes WHERE id = ?
    `).get(id);

    if (!result) return undefined;

    return this.mapRowToNode(result);
  }

  getAllNodes(): MemoryNode[] {
    const results = this.sqlite.prepare(`
      SELECT * FROM memory_nodes
    `).all();

    return results.map(this.mapRowToNode);
  }

  updateNode(id: string, updates: Partial<Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>>): void {
    const now = Date.now();
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.type !== undefined) {
      setClauses.push('type = ?');
      params.push(updates.type);
    }
    if (updates.content !== undefined) {
      setClauses.push('content = ?');
      params.push(updates.content);
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      params.push(JSON.stringify(updates.metadata));
    }
    if (updates.salienceScore !== undefined) {
      setClauses.push('salience_score = ?');
      params.push(updates.salienceScore);
    }
    if (updates.emotionalTag !== undefined) {
      setClauses.push('emotional_tag = ?');
      params.push(updates.emotionalTag);
    }
    if (updates.retrievalCount !== undefined) {
      setClauses.push('retrieval_count = ?');
      params.push(updates.retrievalCount);
    }
    if (updates.lastRetrieved !== undefined) {
      setClauses.push('last_retrieved = ?');
      params.push(updates.lastRetrieved);
    }
    if (updates.strength !== undefined) {
      setClauses.push('strength = ?');
      params.push(updates.strength);
    }
    if (updates.decayRate !== undefined) {
      setClauses.push('decay_rate = ?');
      params.push(updates.decayRate);
    }

    setClauses.push('updated_at = ?');
    params.push(now);
    params.push(id);

    this.sqlite.prepare(`
      UPDATE memory_nodes SET ${setClauses.join(', ')} WHERE id = ?
    `).run(...params);
  }

  deleteNode(id: string): void {
    this.sqlite.prepare(`DELETE FROM memory_edges WHERE source_node_id = ? OR target_node_id = ?`).run(id, id);
    this.sqlite.prepare(`DELETE FROM memory_nodes WHERE id = ?`).run(id);
  }

  createEdge(edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>): MemoryEdge {
    const id = uuidv4();
    const now = Date.now();

    this.sqlite.prepare(`
      INSERT INTO memory_edges (
        id, source_node_id, target_node_id, weight, label,
        activation_count, direction, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.weight,
      edge.label,
      edge.activationCount,
      edge.direction,
      now,
      now
    );

    return {
      ...edge,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  getEdge(id: string): MemoryEdge | undefined {
    const result = this.sqlite.prepare(`
      SELECT * FROM memory_edges WHERE id = ?
    `).get(id);

    if (!result) return undefined;

    return this.mapRowToEdge(result);
  }

  getEdgesBySource(sourceNodeId: string): MemoryEdge[] {
    const results = this.sqlite.prepare(`
      SELECT * FROM memory_edges WHERE source_node_id = ?
    `).all(sourceNodeId);

    return results.map(this.mapRowToEdge);
  }

  getEdgesByTarget(targetNodeId: string): MemoryEdge[] {
    const results = this.sqlite.prepare(`
      SELECT * FROM memory_edges WHERE target_node_id = ?
    `).all(targetNodeId);

    return results.map(this.mapRowToEdge);
  }

  updateEdge(id: string, updates: Partial<Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>>): void {
    const now = Date.now();
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.weight !== undefined) {
      setClauses.push('weight = ?');
      params.push(updates.weight);
    }
    if (updates.label !== undefined) {
      setClauses.push('label = ?');
      params.push(updates.label);
    }
    if (updates.activationCount !== undefined) {
      setClauses.push('activation_count = ?');
      params.push(updates.activationCount);
    }
    if (updates.direction !== undefined) {
      setClauses.push('direction = ?');
      params.push(updates.direction);
    }

    setClauses.push('updated_at = ?');
    params.push(now);
    params.push(id);

    this.sqlite.prepare(`
      UPDATE memory_edges SET ${setClauses.join(', ')} WHERE id = ?
    `).run(...params);
  }

  deleteEdge(id: string): void {
    this.sqlite.prepare(`DELETE FROM memory_edges WHERE id = ?`).run(id);
  }

  getNeighbors(nodeId: string): MemoryNode[] {
    const results = this.sqlite.prepare(`
      SELECT n.* FROM memory_nodes n
      JOIN memory_edges e ON n.id = e.source_node_id OR n.id = e.target_node_id
      WHERE (e.source_node_id = ? OR e.target_node_id = ?) AND n.id != ?
    `).all(nodeId, nodeId, nodeId);

    return results.map(this.mapRowToNode);
  }

  private mapRowToNode(row: unknown): MemoryNode {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      type: r.type as MemoryNode['type'],
      content: r.content as string,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      salienceScore: r.salience_score as number,
      emotionalTag: r.emotional_tag as string | undefined,
      retrievalCount: r.retrieval_count as number,
      lastRetrieved: r.last_retrieved as number | undefined,
      strength: r.strength as number,
      decayRate: r.decay_rate as number,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    };
  }

  private mapRowToEdge(row: unknown): MemoryEdge {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      sourceNodeId: r.source_node_id as string,
      targetNodeId: r.target_node_id as string,
      weight: r.weight as number,
      label: r.label as string | undefined,
      activationCount: r.activation_count as number,
      direction: r.direction as MemoryEdge['direction'],
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    };
  }
}
