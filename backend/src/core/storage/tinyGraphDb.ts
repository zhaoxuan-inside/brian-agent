import type { MemoryNode, MemoryEdge } from '../../shared/types';
import type { IGraphStorage } from './graphInterface';
import TinyGraphDB from 'tiny-graph-db';

function now(): number {
  return Date.now();
}

export class TinyGraphDbStorage implements IGraphStorage {
  private db: any;
  private filePath: string;

  constructor(dbPath: string) {
    this.filePath = `${dbPath}.json`;
    this.db = new TinyGraphDB(this.filePath);
  }

  async createNode(node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryNode> {
    const ts = now();
    const dbNode = this.db.addNode(node.content, {
      type: node.type,
      metadata: JSON.stringify(node.metadata),
      salienceScore: node.salienceScore,
      emotionalTag: node.emotionalTag || '',
      retrievalCount: node.retrievalCount,
      lastRetrieved: node.lastRetrieved || 0,
      strength: node.strength,
      decayRate: node.decayRate,
      createdAt: ts,
      updatedAt: ts,
    });

    return this.dbNodeToMemoryNode(dbNode);
  }

  async getNode(id: string): Promise<MemoryNode | undefined> {
    const dbNode = this.db.getNode(id);
    if (!dbNode) {
      return undefined;
    }
    return this.dbNodeToMemoryNode(dbNode);
  }

  async getAllNodes(): Promise<MemoryNode[]> {
    const nodes = this.db.getAllNodes();
    return nodes.map((n: any) => this.dbNodeToMemoryNode(n));
  }

  async getNodesByType(type: string): Promise<MemoryNode[]> {
    const allNodes = await this.getAllNodes();
    return allNodes.filter(n => n.type === type);
  }

  async updateNode(id: string, updates: Partial<Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const dbNode = this.db.getNode(id);
    if (!dbNode) {
      return;
    }

    const currentMetadata = dbNode.metadata || {};
    const newMetadata: Record<string, any> = { ...currentMetadata };

    if (updates.content !== undefined) {
      dbNode.name = updates.content;
    }
    if (updates.type !== undefined) {
      newMetadata.type = updates.type;
    }
    if (updates.metadata !== undefined) {
      newMetadata.metadata = JSON.stringify(updates.metadata);
    }
    if (updates.salienceScore !== undefined) {
      newMetadata.salienceScore = updates.salienceScore;
    }
    if (updates.emotionalTag !== undefined) {
      newMetadata.emotionalTag = updates.emotionalTag || '';
    }
    if (updates.retrievalCount !== undefined) {
      newMetadata.retrievalCount = updates.retrievalCount;
    }
    if (updates.lastRetrieved !== undefined) {
      newMetadata.lastRetrieved = updates.lastRetrieved || 0;
    }
    if (updates.strength !== undefined) {
      newMetadata.strength = updates.strength;
    }
    if (updates.decayRate !== undefined) {
      newMetadata.decayRate = updates.decayRate;
    }

    newMetadata.updatedAt = now();

    this.db.updateNode(id, { metadata: newMetadata });
    this.db.flushToDisk();
  }

  async deleteNode(id: string): Promise<void> {
    this.db.deleteNode(id);
    this.db.flushToDisk();
  }

  async createEdge(edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEdge> {
    const ts = now();
    const relationName = edge.label || 'related';
    const dbRelation = this.db.addRelation(relationName, edge.sourceNodeId, edge.targetNodeId, {
      weight: edge.weight,
      label: edge.label || '',
      activationCount: edge.activationCount,
      direction: edge.direction,
      createdAt: ts,
      updatedAt: ts,
    });

    return this.dbRelationToMemoryEdge(dbRelation);
  }

  async getEdge(id: string): Promise<MemoryEdge | undefined> {
    const dbRelation = this.db.getRelation(id);
    if (!dbRelation) {
      return undefined;
    }
    return this.dbRelationToMemoryEdge(dbRelation);
  }

  async getEdgesBySource(sourceNodeId: string): Promise<MemoryEdge[]> {
    const relations = this.db.searchRelations({ sourceId: sourceNodeId });
    return relations.map((r: any) => this.dbRelationToMemoryEdge(r));
  }

  async getEdgesByTarget(targetNodeId: string): Promise<MemoryEdge[]> {
    const relations = this.db.searchRelations({ targetId: targetNodeId });
    return relations.map((r: any) => this.dbRelationToMemoryEdge(r));
  }

  async updateEdge(id: string, updates: Partial<Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const dbRelation = this.db.getRelation(id);
    if (!dbRelation) {
      return;
    }

    const currentMetadata = dbRelation.metadata || {};
    const newMetadata: Record<string, any> = { ...currentMetadata };

    if (updates.sourceNodeId !== undefined) {
      newMetadata.sourceId = updates.sourceNodeId;
    }
    if (updates.targetNodeId !== undefined) {
      newMetadata.targetId = updates.targetNodeId;
    }
    if (updates.weight !== undefined) {
      newMetadata.weight = updates.weight;
    }
    if (updates.label !== undefined) {
      newMetadata.label = updates.label || '';
    }
    if (updates.activationCount !== undefined) {
      newMetadata.activationCount = updates.activationCount;
    }
    if (updates.direction !== undefined) {
      newMetadata.direction = updates.direction;
    }

    newMetadata.updatedAt = now();

    this.db.updateRelation(id, { metadata: newMetadata });
    this.db.flushToDisk();
  }

  async deleteEdge(id: string): Promise<void> {
    this.db.deleteRelation(id);
    this.db.flushToDisk();
  }

  async getNeighbors(nodeId: string, _depth: number = 1): Promise<MemoryNode[]> {
    const neighbors = this.db.getNeighbors(nodeId);
    return neighbors.map((n: any) => this.dbNodeToMemoryNode(n));
  }

  async getNodesByTag(tagValue: string): Promise<MemoryNode[]> {
    const nodes = this.db.searchNodes({ metadata: { tagValue } });
    return nodes.map((n: any) => this.dbNodeToMemoryNode(n));
  }

  async addNodeTags(nodeId: string, tags: { domain?: string[], industry?: string[], concept?: string[], action?: string[] }): Promise<void> {
    const dbNode = this.db.getNode(nodeId);
    if (!dbNode) {
      return;
    }

    const currentMetadata = dbNode.metadata || {};
    const newMetadata = { ...currentMetadata };

    if (tags.domain) {
      newMetadata.domainTags = JSON.stringify(tags.domain);
    }
    if (tags.industry) {
      newMetadata.industryTags = JSON.stringify(tags.industry);
    }
    if (tags.concept) {
      newMetadata.conceptTags = JSON.stringify(tags.concept);
    }
    if (tags.action) {
      newMetadata.actionTags = JSON.stringify(tags.action);
    }

    this.db.updateNode(nodeId, { metadata: newMetadata });
    this.db.flushToDisk();
  }

  async getTagsByNode(nodeId: string): Promise<{ domain: string[], industry: string[], concept: string[], action: string[] }> {
    const dbNode = this.db.getNode(nodeId);
    if (!dbNode) {
      return { domain: [], industry: [], concept: [], action: [] };
    }

    const metadata = dbNode.metadata || {};
    return {
      domain: metadata.domainTags ? JSON.parse(metadata.domainTags) : [],
      industry: metadata.industryTags ? JSON.parse(metadata.industryTags) : [],
      concept: metadata.conceptTags ? JSON.parse(metadata.conceptTags) : [],
      action: metadata.actionTags ? JSON.parse(metadata.actionTags) : [],
    };
  }

  async close(): Promise<void> {
    this.db.flushToDisk();
  }

  private dbNodeToMemoryNode(dbNode: any): MemoryNode {
    const metadata = dbNode.metadata || {};
    return {
      id: dbNode.id,
      type: metadata.type || 'memory',
      content: dbNode.name || metadata._content,
      metadata: metadata.metadata ? JSON.parse(metadata.metadata) : {},
      salienceScore: metadata.salienceScore !== undefined ? metadata.salienceScore : 0.5,
      emotionalTag: metadata.emotionalTag || undefined,
      retrievalCount: metadata.retrievalCount !== undefined ? metadata.retrievalCount : 0,
      lastRetrieved: metadata.lastRetrieved || undefined,
      strength: metadata.strength !== undefined ? metadata.strength : 0.5,
      decayRate: metadata.decayRate !== undefined ? metadata.decayRate : 0.05,
      createdAt: metadata.createdAt || 0,
      updatedAt: metadata.updatedAt || 0,
    };
  }

  private dbRelationToMemoryEdge(dbRelation: any): MemoryEdge {
    const metadata = dbRelation.metadata || {};
    return {
      id: dbRelation.id,
      sourceNodeId: dbRelation.sourceId,
      targetNodeId: dbRelation.targetId,
      weight: metadata.weight !== undefined ? metadata.weight : 0.5,
      label: metadata.label || undefined,
      activationCount: metadata.activationCount !== undefined ? metadata.activationCount : 0,
      direction: (metadata.direction || 'undirected') as MemoryEdge['direction'],
      createdAt: metadata.createdAt || 0,
      updatedAt: metadata.updatedAt || 0,
    };
  }
}