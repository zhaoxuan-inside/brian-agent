import { v4 as uuidv4 } from 'uuid';
import type { MemoryNode, MemoryEdge } from '../../shared/types';
import type { IGraphStorage } from './graphInterface';

function now(): number {
  return Date.now();
}

let CongraphDB: any = null;

try {
  CongraphDB = require('congraphdb');
} catch {
  console.warn('CongraphDB native binding not available, will fallback to SQLite');
}

export class CongraphDBStorage implements IGraphStorage {
  private db: any;
  private conn: any;
  private ready: Promise<void>;
  private nodeCache: Map<string, MemoryNode> = new Map();
  private edgeCache: Map<string, MemoryEdge> = new Map();

  constructor(dbPath: string) {
    const dbFilePath = `${dbPath}.cgraph`;
    
    this.ready = (async () => {
      if (!CongraphDB) {
        throw new Error('CongraphDB native binding not available');
      }
      
      this.db = new CongraphDB.Database(dbFilePath);
      this.db.init();
      this.conn = this.db.createConnection();
      
      await this.initializeSchema();
    })();
  }

  private async initializeSchema(): Promise<void> {
    try {
      await this.conn.query(`
        CREATE NODE TABLE MemoryNode(
          id STRING,
          type STRING,
          content STRING,
          metadata JSON,
          salience_score DOUBLE,
          emotional_tag STRING,
          retrieval_count INT64,
          last_retrieved INT64,
          strength DOUBLE,
          decay_rate DOUBLE,
          created_at INT64,
          updated_at INT64
        )
      `);
    } catch { /* Table may already exist */ }

    try {
      await this.conn.query(`
        CREATE REL TABLE MemoryEdge(
          id STRING,
          source_node_id STRING,
          target_node_id STRING,
          weight DOUBLE,
          label STRING,
          activation_count INT64,
          direction STRING,
          created_at INT64,
          updated_at INT64
        )
      `);
    } catch { /* Table may already exist */ }

    try {
      await this.conn.query(`
        CREATE NODE TABLE NodeTag(
          node_id STRING,
          tag_type STRING,
          tag_value STRING
        )
      `);
    } catch { /* Table may already exist */ }
  }

  async createNode(node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryNode> {
    await this.ready;
    
    const id = uuidv4();
    const ts = now();
    
    await this.conn.query(`
      CREATE (n:MemoryNode {
        id: '${id}',
        type: '${node.type}',
        content: '${this.escapeCypher(node.content)}',
        metadata: '${this.escapeCypher(JSON.stringify(node.metadata))}',
        salience_score: ${node.salienceScore},
        emotional_tag: ${node.emotionalTag ? `'${this.escapeCypher(node.emotionalTag)}'` : 'NULL'},
        retrieval_count: ${node.retrievalCount},
        last_retrieved: ${node.lastRetrieved || 'NULL'},
        strength: ${node.strength},
        decay_rate: ${node.decayRate},
        created_at: ${ts},
        updated_at: ${ts}
      })
    `);
    
    const result: MemoryNode = { ...node, id, createdAt: ts, updatedAt: ts };
    this.nodeCache.set(id, result);
    return result;
  }

  async getNode(id: string): Promise<MemoryNode | undefined> {
    await this.ready;
    
    const cached = this.nodeCache.get(id);
    if (cached) {
      return cached;
    }
    
    const result = await this.conn.query(`
      MATCH (n:MemoryNode {id: '${this.escapeCypher(id)}'})
      RETURN n
    `);
    
    const rows = result.getAll();
    if (rows.length === 0) {
      return undefined;
    }
    
    const node = this.rowToNode(rows[0].n);
    if (node) {
      this.nodeCache.set(id, node);
    }
    return node;
  }

  async getAllNodes(): Promise<MemoryNode[]> {
    await this.ready;
    
    const result = await this.conn.query(`
      MATCH (n:MemoryNode)
      RETURN n
      ORDER BY n.created_at DESC
    `);
    
    const rows = result.getAll();
    return rows.map((r: any) => {
      const node = this.rowToNode(r.n);
      if (node) {
        this.nodeCache.set(node.id, node);
      }
      return node;
    }).filter(Boolean);
  }

  async getNodesByType(type: string): Promise<MemoryNode[]> {
    await this.ready;
    
    const result = await this.conn.query(`
      MATCH (n:MemoryNode {type: '${this.escapeCypher(type)}'})
      RETURN n
      ORDER BY n.created_at DESC
    `);
    
    const rows = result.getAll();
    return rows.map((r: any) => {
      const node = this.rowToNode(r.n);
      if (node) {
        this.nodeCache.set(node.id, node);
      }
      return node;
    }).filter(Boolean);
  }

  async updateNode(id: string, updates: Partial<Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    await this.ready;
    
    const ts = now();
    const setClauses: string[] = [`updated_at = ${ts}`];
    
    if (updates.type !== undefined) {
      setClauses.push(`type = '${this.escapeCypher(updates.type)}'`);
    }
    if (updates.content !== undefined) {
      setClauses.push(`content = '${this.escapeCypher(updates.content)}'`);
    }
    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = '${this.escapeCypher(JSON.stringify(updates.metadata))}'`);
    }
    if (updates.salienceScore !== undefined) {
      setClauses.push(`salience_score = ${updates.salienceScore}`);
    }
    if (updates.emotionalTag !== undefined) {
      setClauses.push(`emotional_tag = ${updates.emotionalTag ? `'${this.escapeCypher(updates.emotionalTag)}'` : 'NULL'}`);
    }
    if (updates.retrievalCount !== undefined) {
      setClauses.push(`retrieval_count = ${updates.retrievalCount}`);
    }
    if (updates.lastRetrieved !== undefined) {
      setClauses.push(`last_retrieved = ${updates.lastRetrieved || 'NULL'}`);
    }
    if (updates.strength !== undefined) {
      setClauses.push(`strength = ${updates.strength}`);
    }
    if (updates.decayRate !== undefined) {
      setClauses.push(`decay_rate = ${updates.decayRate}`);
    }
    
    await this.conn.query(`
      MATCH (n:MemoryNode {id: '${this.escapeCypher(id)}'})
      SET ${setClauses.join(', ')}
    `);
    
    this.nodeCache.delete(id);
  }

  async deleteNode(id: string): Promise<void> {
    await this.ready;
    
    await this.conn.query(`
      MATCH (n:MemoryNode {id: '${this.escapeCypher(id)}'})
      DETACH DELETE n
    `);
    
    await this.conn.query(`
      MATCH (t:NodeTag {node_id: '${this.escapeCypher(id)}'})
      DELETE t
    `);
    
    this.nodeCache.delete(id);
  }

  async createEdge(edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEdge> {
    await this.ready;
    
    const id = uuidv4();
    const ts = now();
    
    await this.conn.query(`
      MATCH (source:MemoryNode {id: '${this.escapeCypher(edge.sourceNodeId)}'})
      MATCH (target:MemoryNode {id: '${this.escapeCypher(edge.targetNodeId)}'})
      CREATE (source)-[r:MemoryEdge {
        id: '${id}',
        source_node_id: '${this.escapeCypher(edge.sourceNodeId)}',
        target_node_id: '${this.escapeCypher(edge.targetNodeId)}',
        weight: ${edge.weight},
        label: ${edge.label ? `'${this.escapeCypher(edge.label)}'` : 'NULL'},
        activation_count: ${edge.activationCount},
        direction: '${this.escapeCypher(edge.direction)}',
        created_at: ${ts},
        updated_at: ${ts}
      }]->(target)
    `);
    
    const result: MemoryEdge = { ...edge, id, createdAt: ts, updatedAt: ts };
    this.edgeCache.set(id, result);
    return result;
  }

  async getEdge(id: string): Promise<MemoryEdge | undefined> {
    await this.ready;
    
    const cached = this.edgeCache.get(id);
    if (cached) {
      return cached;
    }
    
    const result = await this.conn.query(`
      MATCH ()-[r:MemoryEdge {id: '${this.escapeCypher(id)}'}]->()
      RETURN r
    `);
    
    const rows = result.getAll();
    if (rows.length === 0) {
      return undefined;
    }
    
    const edge = this.rowToEdge(rows[0].r);
    if (edge) {
      this.edgeCache.set(id, edge);
    }
    return edge;
  }

  async getEdgesBySource(sourceNodeId: string): Promise<MemoryEdge[]> {
    await this.ready;
    
    const result = await this.conn.query(`
      MATCH ()-[r:MemoryEdge {source_node_id: '${this.escapeCypher(sourceNodeId)}'}]->()
      RETURN r
      ORDER BY r.created_at DESC
    `);
    
    const rows = result.getAll();
    return rows.map((r: any) => {
      const edge = this.rowToEdge(r.r);
      if (edge) {
        this.edgeCache.set(edge.id, edge);
      }
      return edge;
    }).filter(Boolean);
  }

  async getEdgesByTarget(targetNodeId: string): Promise<MemoryEdge[]> {
    await this.ready;
    
    const result = await this.conn.query(`
      MATCH ()-[r:MemoryEdge {target_node_id: '${this.escapeCypher(targetNodeId)}'}]->()
      RETURN r
      ORDER BY r.created_at DESC
    `);
    
    const rows = result.getAll();
    return rows.map((r: any) => {
      const edge = this.rowToEdge(r.r);
      if (edge) {
        this.edgeCache.set(edge.id, edge);
      }
      return edge;
    }).filter(Boolean);
  }

  async updateEdge(id: string, updates: Partial<Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    await this.ready;
    
    const ts = now();
    const setClauses: string[] = [`updated_at = ${ts}`];
    
    if (updates.sourceNodeId !== undefined) {
      setClauses.push(`source_node_id = '${this.escapeCypher(updates.sourceNodeId)}'`);
    }
    if (updates.targetNodeId !== undefined) {
      setClauses.push(`target_node_id = '${this.escapeCypher(updates.targetNodeId)}'`);
    }
    if (updates.weight !== undefined) {
      setClauses.push(`weight = ${updates.weight}`);
    }
    if (updates.label !== undefined) {
      setClauses.push(`label = ${updates.label ? `'${this.escapeCypher(updates.label)}'` : 'NULL'}`);
    }
    if (updates.activationCount !== undefined) {
      setClauses.push(`activation_count = ${updates.activationCount}`);
    }
    if (updates.direction !== undefined) {
      setClauses.push(`direction = '${this.escapeCypher(updates.direction)}'`);
    }
    
    await this.conn.query(`
      MATCH ()-[r:MemoryEdge {id: '${this.escapeCypher(id)}'}]->()
      SET ${setClauses.join(', ')}
    `);
    
    this.edgeCache.delete(id);
  }

  async deleteEdge(id: string): Promise<void> {
    await this.ready;
    
    await this.conn.query(`
      MATCH ()-[r:MemoryEdge {id: '${this.escapeCypher(id)}'}]->()
      DELETE r
    `);
    
    this.edgeCache.delete(id);
  }

  async getNeighbors(nodeId: string, depth: number = 1): Promise<MemoryNode[]> {
    await this.ready;
    
    const result = await this.conn.query(`
      MATCH (n:MemoryNode {id: '${this.escapeCypher(nodeId)}'})-[*1..${depth}]-(neighbor:MemoryNode)
      WHERE neighbor.id <> '${this.escapeCypher(nodeId)}'
      RETURN DISTINCT neighbor
    `);
    
    const rows = result.getAll();
    const neighbors: MemoryNode[] = [];
    const seen = new Set<string>();
    
    for (const row of rows) {
      const node = this.rowToNode(row.neighbor);
      if (node && !seen.has(node.id)) {
        seen.add(node.id);
        neighbors.push(node);
        this.nodeCache.set(node.id, node);
      }
    }
    
    return neighbors;
  }

  async getNodesByTag(tagValue: string): Promise<MemoryNode[]> {
    await this.ready;
    
    const result = await this.conn.query(`
      MATCH (t:NodeTag {tag_value: '${this.escapeCypher(tagValue)}'})
      MATCH (n:MemoryNode {id: t.node_id})
      RETURN DISTINCT n
    `);
    
    const rows = result.getAll();
    return rows.map((r: any) => {
      const node = this.rowToNode(r.n);
      if (node) {
        this.nodeCache.set(node.id, node);
      }
      return node;
    }).filter(Boolean);
  }

  async addNodeTags(nodeId: string, tags: { domain?: string[], industry?: string[], concept?: string[], action?: string[] }): Promise<void> {
    await this.ready;
    
    const tagTypes = [
      { key: 'domain', values: tags.domain || [] },
      { key: 'industry', values: tags.industry || [] },
      { key: 'concept', values: tags.concept || [] },
      { key: 'action', values: tags.action || [] },
    ];
    
    for (const { key, values } of tagTypes) {
      for (const value of values) {
        await this.conn.query(`
          CREATE (t:NodeTag {
            node_id: '${this.escapeCypher(nodeId)}',
            tag_type: '${this.escapeCypher(key)}',
            tag_value: '${this.escapeCypher(value)}'
          })
        `);
      }
    }
    
    this.nodeCache.delete(nodeId);
  }

  async getTagsByNode(nodeId: string): Promise<{ domain: string[], industry: string[], concept: string[], action: string[] }> {
    await this.ready;
    
    const result = await this.conn.query(`
      MATCH (t:NodeTag {node_id: '${this.escapeCypher(nodeId)}'})
      RETURN t.tag_type, t.tag_value
    `);
    
    const rows = result.getAll();
    const tags = { domain: [] as string[], industry: [] as string[], concept: [] as string[], action: [] as string[] };
    
    for (const row of rows) {
      const type = row.tag_type;
      const value = row.tag_value;
      
      if (type === 'domain') tags.domain.push(value);
      else if (type === 'industry') tags.industry.push(value);
      else if (type === 'concept') tags.concept.push(value);
      else if (type === 'action') tags.action.push(value);
    }
    
    return tags;
  }

  async close(): Promise<void> {
    try {
      await this.ready;
      this.db.close();
    } catch { /* Ignore close errors */ }
    
    this.nodeCache.clear();
    this.edgeCache.clear();
  }

  private rowToNode(row: any): MemoryNode | undefined {
    if (!row || !row.id || !row.type) {
      return undefined;
    }
    
    return {
      id: row.id,
      type: row.type as MemoryNode['type'],
      content: row.content || '',
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      salienceScore: row.salience_score !== undefined ? row.salience_score : 0.5,
      emotionalTag: row.emotional_tag || undefined,
      retrievalCount: row.retrieval_count !== undefined ? row.retrieval_count : 0,
      lastRetrieved: row.last_retrieved || undefined,
      strength: row.strength !== undefined ? row.strength : 0.5,
      decayRate: row.decay_rate !== undefined ? row.decay_rate : 0.05,
      createdAt: row.created_at || 0,
      updatedAt: row.updated_at || 0,
    };
  }

  private rowToEdge(row: any): MemoryEdge | undefined {
    if (!row || !row.source_node_id || !row.target_node_id) {
      return undefined;
    }
    
    return {
      id: row.id || '',
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      weight: row.weight !== undefined ? row.weight : 0.5,
      label: row.label || undefined,
      activationCount: row.activation_count !== undefined ? row.activation_count : 0,
      direction: (row.direction || 'undirected') as MemoryEdge['direction'],
      createdAt: row.created_at || 0,
      updatedAt: row.updated_at || 0,
    };
  }

  private escapeCypher(value: string): string {
    return value.replace(/'/g, "''");
  }
}

export function isCongraphDBAvailable(): boolean {
  return CongraphDB !== null;
}