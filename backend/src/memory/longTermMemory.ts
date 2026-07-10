import { GraphStorage } from '../storage/graphStorage';
import { VectorStorage } from '../storage/vectorStorage';
import { MemoryNode } from '@shared/types';

interface LongTermMemoryItem {
  id: string;
  content: string;
  type: 'episodic' | 'semantic' | 'procedural';
  tags: string[];
  role: 'user' | 'assistant' | 'system';
  summary: string;
  strength: number;
  decayRate: number;
  salienceScore: number;
  retrievalCount: number;
  lastRetrieved?: number;
  createdAt: number;
  updatedAt: number;
}

export class LongTermMemory {
  private graphStorage: GraphStorage;
  private vectorStorage: VectorStorage;

  constructor(graphStorage: GraphStorage, vectorStorage: VectorStorage) {
    this.graphStorage = graphStorage;
    this.vectorStorage = vectorStorage;
  }

  store(item: Omit<LongTermMemoryItem, 'id' | 'createdAt' | 'updatedAt'>): string {
    const node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'> = {
      type: 'memory',
      content: item.content,
      metadata: {
        memoryType: item.type,
        tags: item.tags,
        role: item.role,
        summary: item.summary,
      },
      salienceScore: item.salienceScore,
      retrievalCount: item.retrievalCount,
      strength: item.strength,
      decayRate: item.decayRate,
    };

    const createdNode = this.graphStorage.createNode(node);

    for (const tag of item.tags) {
      const tagNode = this.findOrCreateTag(tag);
      this.graphStorage.createEdge({
        sourceNodeId: createdNode.id,
        targetNodeId: tagNode.id,
        weight: 0.7,
        label: 'tagged_with',
        activationCount: 0,
        direction: 'directed',
      });
    }

    return createdNode.id;
  }

  retrieve(maxResults: number = 10): LongTermMemoryItem[] {
    const allNodes = this.graphStorage.getAllNodes();
    const memoryNodes = allNodes.filter((node) => node.type === 'memory');

    return memoryNodes
      .map((node) => this.mapNodeToItem(node))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxResults);
  }

  getById(id: string): LongTermMemoryItem | undefined {
    const node = this.graphStorage.getNode(id);
    if (!node || node.type !== 'memory') return undefined;
    return this.mapNodeToItem(node);
  }

  update(id: string, updates: Partial<Omit<LongTermMemoryItem, 'id' | 'createdAt' | 'updatedAt'>>): void {
    const nodeUpdates: Partial<Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>> = {};

    if (updates.content !== undefined) {
      nodeUpdates.content = updates.content;
    }
    if (updates.strength !== undefined) {
      nodeUpdates.strength = updates.strength;
    }
    if (updates.decayRate !== undefined) {
      nodeUpdates.decayRate = updates.decayRate;
    }
    if (updates.salienceScore !== undefined) {
      nodeUpdates.salienceScore = updates.salienceScore;
    }
    if (updates.retrievalCount !== undefined) {
      nodeUpdates.retrievalCount = updates.retrievalCount;
    }
    if (updates.lastRetrieved !== undefined) {
      nodeUpdates.lastRetrieved = updates.lastRetrieved;
    }

    this.graphStorage.updateNode(id, nodeUpdates);
  }

  delete(id: string): void {
    this.graphStorage.deleteNode(id);
  }

  retrieveByTag(tag: string): LongTermMemoryItem[] {
    const tagNode = this.graphStorage.getAllNodes().find((node) => node.type === 'tag' && node.content === tag);
    if (!tagNode) return [];

    const edges = this.graphStorage.getEdgesByTarget(tagNode.id);
    const memoryIds = edges.map((edge) => edge.sourceNodeId);

    return memoryIds
      .map((id) => this.graphStorage.getNode(id))
      .filter((node): node is MemoryNode => node !== undefined && node.type === 'memory')
      .map((node) => this.mapNodeToItem(node));
  }

  getTagGraph(): { nodes: { id: string; name: string; weight: number; degree: number }[]; edges: { source: string; target: string; weight: number; label: string }[] } {
    const allNodes = this.graphStorage.getAllNodes();
    const tagNodes = allNodes.filter((node) => node.type === 'tag');
    const allEdges = this.graphStorage['sqlite']
      .prepare('SELECT * FROM memory_edges')
      .all() as any[];

    const tagNodeMap = new Map<string, { id: string; name: string; weight: number; degree: number }>();

    // Build tag nodes with degree
    for (const tag of tagNodes) {
      const tagEdges = allEdges.filter((e: any) => e.target_node_id === tag.id);
      const degree = tagEdges.length;
      const totalWeight = tagEdges.reduce((s: number, e: any) => s + e.weight, 0);
      tagNodeMap.set(tag.id, {
        id: tag.id,
        name: tag.content,
        weight: degree > 0 ? Math.round(totalWeight / degree * 100) / 100 : 0.5,
        degree,
      });
    }

    // Build co-occurrence edges between tags (tags that appear on same memory)
    const tagEdges: { source: string; target: string; weight: number; label: string }[] = [];
    const coOccurrence = new Map<string, number>();

    for (const tagA of tagNodes) {
      const edgesA = allEdges.filter((e: any) => e.target_node_id === tagA.id);
      const memoryIdsA = new Set(edgesA.map((e: any) => e.source_node_id));

      for (const tagB of tagNodes) {
        if (tagA.id >= tagB.id) continue;
        const edgesB = allEdges.filter((e: any) => e.target_node_id === tagB.id);
        const memoryIdsB = new Set(edgesB.map((e: any) => e.source_node_id));

        let coCount = 0;
        for (const mid of memoryIdsA) {
          if (memoryIdsB.has(mid)) coCount++;
        }

        if (coCount > 0) {
          const key = `${tagA.id}::${tagB.id}`;
          coOccurrence.set(key, coCount);
          tagEdges.push({
            source: tagA.id,
            target: tagB.id,
            weight: Math.round(coCount * 10) / 10,
            label: 'co-occurrence',
          });
        }
      }
    }

    return {
      nodes: Array.from(tagNodeMap.values()).sort((a, b) => b.degree - a.degree),
      edges: tagEdges,
    };
  }

  private findOrCreateTag(tag: string): MemoryNode {
    const existing = this.graphStorage.getAllNodes().find((node) => node.type === 'tag' && node.content === tag);
    if (existing) return existing;

    return this.graphStorage.createNode({
      type: 'tag',
      content: tag,
      metadata: {},
      salienceScore: 0.5,
      retrievalCount: 0,
      strength: 0.5,
      decayRate: 0.05,
    });
  }

  private mapNodeToItem(node: MemoryNode): LongTermMemoryItem {
    const metadata = node.metadata as Record<string, unknown>;
    return {
      id: node.id,
      content: node.content,
      type: (metadata.memoryType as LongTermMemoryItem['type']) || 'episodic',
      tags: (metadata.tags as string[]) || [],
      role: (metadata.role as LongTermMemoryItem['role']) || 'user',
      summary: (metadata.summary as string) || node.content.slice(0, 60),
      strength: node.strength,
      decayRate: node.decayRate,
      salienceScore: node.salienceScore,
      retrievalCount: node.retrievalCount,
      lastRetrieved: node.lastRetrieved,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }
}
