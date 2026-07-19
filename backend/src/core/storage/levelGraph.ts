import { Level } from 'level';
import levelgraph from 'levelgraph';
import { v4 as uuidv4 } from 'uuid';
import type { MemoryNode, MemoryEdge } from '../../shared/types';
import type { IGraphStorage } from './graphInterface';

function now(): number {
  return Date.now();
}

export class LevelGraphStorage implements IGraphStorage {
  private db: any;
  private nodeCache: Map<string, MemoryNode> = new Map();
  private edgeCache: Map<string, MemoryEdge> = new Map();
  private ready: Promise<void>;
  
  constructor(dbPath: string) {
    const levelDb = new Level(dbPath, { createIfMissing: true, errorIfExists: false });
    this.db = levelgraph(levelDb);
    this.ready = new Promise<void>((resolve, reject) => {
      levelDb.open((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  async createNode(node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryNode> {
    await this.ready;
    const id = uuidv4();
    const ts = now();
    
    const triples = [
      { subject: id, predicate: 'type', object: node.type },
      { subject: id, predicate: 'content', object: node.content },
      { subject: id, predicate: 'metadata', object: JSON.stringify(node.metadata) },
      { subject: id, predicate: 'salienceScore', object: node.salienceScore.toString() },
      { subject: id, predicate: 'retrievalCount', object: node.retrievalCount.toString() },
      { subject: id, predicate: 'strength', object: node.strength.toString() },
      { subject: id, predicate: 'decayRate', object: node.decayRate.toString() },
      { subject: id, predicate: 'createdAt', object: ts.toString() },
      { subject: id, predicate: 'updatedAt', object: ts.toString() },
    ];
    
    if (node.emotionalTag) {
      triples.push({ subject: id, predicate: 'emotionalTag', object: node.emotionalTag });
    }
    if (node.lastRetrieved) {
      triples.push({ subject: id, predicate: 'lastRetrieved', object: node.lastRetrieved.toString() });
    }
    
    await new Promise<void>((resolve, reject) => {
      this.db.put(triples, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
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
    
    const results = await new Promise<any[]>((resolve, reject) => {
      this.db.search({ subject: id }, (err: any, results: any[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (results.length === 0) {
      return undefined;
    }
    
    const node = this.triplesToNode(results);
    if (node) {
      this.nodeCache.set(id, node);
    }
    return node;
  }
  
  async getAllNodes(): Promise<MemoryNode[]> {
    await this.ready;
    const results = await new Promise<any[]>((resolve, reject) => {
      this.db.search({ predicate: 'type' }, (err: any, results: any[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    const nodeIds = [...new Set(results.map((r: any) => r.subject))];
    const nodes: MemoryNode[] = [];
    
    for (const id of nodeIds) {
      const node = await this.getNode(id);
      if (node) {
        nodes.push(node);
      }
    }
    
    return nodes.sort((a, b) => b.createdAt - a.createdAt);
  }
  
  async getNodesByType(type: string): Promise<MemoryNode[]> {
    await this.ready;
    const results = await new Promise<any[]>((resolve, reject) => {
      this.db.search({ predicate: 'type', object: type }, (err: any, results: any[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    const nodeIds = [...new Set(results.map((r: any) => r.subject))];
    const nodes: MemoryNode[] = [];
    
    for (const id of nodeIds) {
      const node = await this.getNode(id);
      if (node) {
        nodes.push(node);
      }
    }
    
    return nodes.sort((a, b) => b.createdAt - a.createdAt);
  }
  
  async updateNode(id: string, updates: Partial<Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    await this.ready;
    const ts = now();
    const triples: any[] = [{ subject: id, predicate: 'updatedAt', object: ts.toString() }];
    
    if (updates.type !== undefined) {
      triples.push({ subject: id, predicate: 'type', object: updates.type });
    }
    if (updates.content !== undefined) {
      triples.push({ subject: id, predicate: 'content', object: updates.content });
    }
    if (updates.metadata !== undefined) {
      triples.push({ subject: id, predicate: 'metadata', object: JSON.stringify(updates.metadata) });
    }
    if (updates.salienceScore !== undefined) {
      triples.push({ subject: id, predicate: 'salienceScore', object: updates.salienceScore.toString() });
    }
    if (updates.emotionalTag !== undefined) {
      triples.push({ subject: id, predicate: 'emotionalTag', object: updates.emotionalTag });
    }
    if (updates.retrievalCount !== undefined) {
      triples.push({ subject: id, predicate: 'retrievalCount', object: updates.retrievalCount.toString() });
    }
    if (updates.lastRetrieved !== undefined) {
      triples.push({ subject: id, predicate: 'lastRetrieved', object: updates.lastRetrieved.toString() });
    }
    if (updates.strength !== undefined) {
      triples.push({ subject: id, predicate: 'strength', object: updates.strength.toString() });
    }
    if (updates.decayRate !== undefined) {
      triples.push({ subject: id, predicate: 'decayRate', object: updates.decayRate.toString() });
    }
    
    await new Promise<void>((resolve, reject) => {
      this.db.put(triples, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    this.nodeCache.delete(id);
  }
  
  async deleteNode(id: string): Promise<void> {
    await this.ready;
    const triples = await new Promise<any[]>((resolve, reject) => {
      this.db.search({ subject: id }, (err: any, results: any[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    await new Promise<void>((resolve, reject) => {
      this.db.del(triples, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    this.nodeCache.delete(id);
  }
  
  async createEdge(edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEdge> {
    await this.ready;
    const id = uuidv4();
    const ts = now();
    
    const triples = [
      { subject: id, predicate: 'type', object: 'edge' },
      { subject: id, predicate: 'sourceNodeId', object: edge.sourceNodeId },
      { subject: id, predicate: 'targetNodeId', object: edge.targetNodeId },
      { subject: id, predicate: 'weight', object: edge.weight.toString() },
      { subject: id, predicate: 'activationCount', object: edge.activationCount.toString() },
      { subject: id, predicate: 'direction', object: edge.direction },
      { subject: id, predicate: 'createdAt', object: ts.toString() },
      { subject: id, predicate: 'updatedAt', object: ts.toString() },
    ];
    
    if (edge.label) {
      triples.push({ subject: id, predicate: 'label', object: edge.label });
    }
    
    await new Promise<void>((resolve, reject) => {
      this.db.put(triples, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
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
    
    const results = await new Promise<any[]>((resolve, reject) => {
      this.db.search({ subject: id }, (err: any, results: any[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (results.length === 0) {
      return undefined;
    }
    
    const edge = this.triplesToEdge(results);
    if (edge) {
      this.edgeCache.set(id, edge);
    }
    return edge;
  }
  
  async getEdgesBySource(sourceNodeId: string): Promise<MemoryEdge[]> {
    await this.ready;
    const results = await new Promise<any[]>((resolve, reject) => {
      this.db.search({ predicate: 'sourceNodeId', object: sourceNodeId }, (err: any, results: any[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    const edgeIds = [...new Set(results.map((r: any) => r.subject))];
    const edges: MemoryEdge[] = [];
    
    for (const id of edgeIds) {
      const edge = await this.getEdge(id);
      if (edge) {
        edges.push(edge);
      }
    }
    
    return edges.sort((a, b) => b.createdAt - a.createdAt);
  }
  
  async getEdgesByTarget(targetNodeId: string): Promise<MemoryEdge[]> {
    await this.ready;
    const results = await new Promise<any[]>((resolve, reject) => {
      this.db.search({ predicate: 'targetNodeId', object: targetNodeId }, (err: any, results: any[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    const edgeIds = [...new Set(results.map((r: any) => r.subject))];
    const edges: MemoryEdge[] = [];
    
    for (const id of edgeIds) {
      const edge = await this.getEdge(id);
      if (edge) {
        edges.push(edge);
      }
    }
    
    return edges.sort((a, b) => b.createdAt - a.createdAt);
  }
  
  async updateEdge(id: string, updates: Partial<Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    await this.ready;
    const ts = now();
    const triples: any[] = [{ subject: id, predicate: 'updatedAt', object: ts.toString() }];
    
    if (updates.sourceNodeId !== undefined) {
      triples.push({ subject: id, predicate: 'sourceNodeId', object: updates.sourceNodeId });
    }
    if (updates.targetNodeId !== undefined) {
      triples.push({ subject: id, predicate: 'targetNodeId', object: updates.targetNodeId });
    }
    if (updates.weight !== undefined) {
      triples.push({ subject: id, predicate: 'weight', object: updates.weight.toString() });
    }
    if (updates.label !== undefined) {
      triples.push({ subject: id, predicate: 'label', object: updates.label });
    }
    if (updates.activationCount !== undefined) {
      triples.push({ subject: id, predicate: 'activationCount', object: updates.activationCount.toString() });
    }
    if (updates.direction !== undefined) {
      triples.push({ subject: id, predicate: 'direction', object: updates.direction });
    }
    
    await new Promise<void>((resolve, reject) => {
      this.db.put(triples, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    this.edgeCache.delete(id);
  }
  
  async deleteEdge(id: string): Promise<void> {
    await this.ready;
    const triples = await new Promise<any[]>((resolve, reject) => {
      this.db.search({ subject: id }, (err: any, results: any[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    await new Promise<void>((resolve, reject) => {
      this.db.del(triples, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    this.edgeCache.delete(id);
  }
  
  async getNeighbors(nodeId: string, depth: number = 1): Promise<MemoryNode[]> {
    await this.ready;
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
        
        const outEdges = await this.getEdgesBySource(current.id);
        for (const edge of outEdges) {
          if (!visited.has(edge.targetNodeId)) {
            visited.add(edge.targetNodeId);
            queue.push({ id: edge.targetNodeId, dist: nextDist });
          }
        }
        
        const inEdges = await this.getEdgesByTarget(current.id);
        for (const edge of inEdges) {
          if (!visited.has(edge.sourceNodeId)) {
            visited.add(edge.sourceNodeId);
            queue.push({ id: edge.sourceNodeId, dist: nextDist });
          }
        }
      }
    }
    
    return result.sort((a, b) => a.dist - b.dist).map((r) => r.node);
  }
  
  async getNodesByTag(tagValue: string): Promise<MemoryNode[]> {
    await this.ready;
    const results = await new Promise<any[]>((resolve, reject) => {
      this.db.search({ object: tagValue }, (err: any, results: any[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    const nodeIds = [...new Set(
      results
        .filter((r: any) => r.predicate.startsWith('hasTag:'))
        .map((r: any) => r.subject)
    )];
    
    const nodes: MemoryNode[] = [];
    for (const id of nodeIds) {
      const node = await this.getNode(id);
      if (node) {
        nodes.push(node);
      }
    }
    
    return nodes;
  }
  
  async addNodeTags(nodeId: string, tags: { domain?: string[], industry?: string[], concept?: string[], action?: string[] }): Promise<void> {
    await this.ready;
    const triples: any[] = [];
    
    for (const tag of tags.domain || []) {
      triples.push({ subject: nodeId, predicate: 'hasTag:domain', object: tag });
    }
    for (const tag of tags.industry || []) {
      triples.push({ subject: nodeId, predicate: 'hasTag:industry', object: tag });
    }
    for (const tag of tags.concept || []) {
      triples.push({ subject: nodeId, predicate: 'hasTag:concept', object: tag });
    }
    for (const tag of tags.action || []) {
      triples.push({ subject: nodeId, predicate: 'hasTag:action', object: tag });
    }
    
    if (triples.length > 0) {
      await new Promise<void>((resolve, reject) => {
        this.db.put(triples, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    this.nodeCache.delete(nodeId);
  }
  
  async getTagsByNode(nodeId: string): Promise<{ domain: string[], industry: string[], concept: string[], action: string[] }> {
    await this.ready;
    const results = await new Promise<any[]>((resolve, reject) => {
      this.db.search({ subject: nodeId }, (err: any, results: any[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    const result = { domain: [] as string[], industry: [] as string[], concept: [] as string[], action: [] as string[] };
    
    for (const r of results) {
      if (r.predicate === 'hasTag:domain') {
        result.domain.push(r.object);
      } else if (r.predicate === 'hasTag:industry') {
        result.industry.push(r.object);
      } else if (r.predicate === 'hasTag:concept') {
        result.concept.push(r.object);
      } else if (r.predicate === 'hasTag:action') {
        result.action.push(r.object);
      }
    }
    
    return result;
  }
  
  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.db.close(resolve);
    });
    this.nodeCache.clear();
    this.edgeCache.clear();
  }
  
  private triplesToNode(triples: any[]): MemoryNode | undefined {
    const data: Record<string, any> = {};
    
    for (const t of triples) {
      data[t.predicate] = t.object;
    }
    
    if (!data.type || !data.content) {
      return undefined;
    }
    
    return {
      id: triples[0].subject,
      type: data.type as MemoryNode['type'],
      content: data.content,
      metadata: data.metadata ? JSON.parse(data.metadata) : {},
      salienceScore: parseFloat(data.salienceScore || '0.5'),
      emotionalTag: data.emotionalTag || undefined,
      retrievalCount: parseInt(data.retrievalCount || '0'),
      lastRetrieved: data.lastRetrieved ? parseInt(data.lastRetrieved) : undefined,
      strength: parseFloat(data.strength || '0.5'),
      decayRate: parseFloat(data.decayRate || '0.05'),
      createdAt: parseInt(data.createdAt || '0'),
      updatedAt: parseInt(data.updatedAt || '0'),
    };
  }
  
  private triplesToEdge(triples: any[]): MemoryEdge | undefined {
    const data: Record<string, any> = {};
    
    for (const t of triples) {
      data[t.predicate] = t.object;
    }
    
    if (!data.sourceNodeId || !data.targetNodeId) {
      return undefined;
    }
    
    return {
      id: triples[0].subject,
      sourceNodeId: data.sourceNodeId,
      targetNodeId: data.targetNodeId,
      weight: parseFloat(data.weight || '0.5'),
      label: data.label || undefined,
      activationCount: parseInt(data.activationCount || '0'),
      direction: (data.direction || 'undirected') as MemoryEdge['direction'],
      createdAt: parseInt(data.createdAt || '0'),
      updatedAt: parseInt(data.updatedAt || '0'),
    };
  }
}