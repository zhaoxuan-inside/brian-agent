import { v4 as uuidv4 } from 'uuid';
import type { MemoryNode, MemoryEdge } from '../../shared/types';
import type { IGraphStorage } from './graphInterface';

function now(): number {
  return Date.now();
}

export class MemoryGraphStorage implements IGraphStorage {
  private nodes: Map<string, MemoryNode> = new Map();
  private edges: Map<string, MemoryEdge> = new Map();
  private nodeTags: Map<string, { domain: string[], industry: string[], concept: string[], action: string[] }> = new Map();

  async createNode(node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryNode> {
    const id = uuidv4();
    const ts = now();
    const result: MemoryNode = { ...node, id, createdAt: ts, updatedAt: ts };
    this.nodes.set(id, result);
    this.nodeTags.set(id, { domain: [], industry: [], concept: [], action: [] });
    return result;
  }

  async getNode(id: string): Promise<MemoryNode | undefined> {
    return this.nodes.get(id);
  }

  async getAllNodes(): Promise<MemoryNode[]> {
    return Array.from(this.nodes.values());
  }

  async getNodesByType(type: string): Promise<MemoryNode[]> {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }

  async updateNode(id: string, updates: Partial<Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const node = this.nodes.get(id);
    if (!node) return;

    const updated = { ...node, ...updates, updatedAt: now() };
    this.nodes.set(id, updated);
  }

  async deleteNode(id: string): Promise<void> {
    this.nodes.delete(id);
    this.nodeTags.delete(id);
    this.edges.forEach((edge, edgeId) => {
      if (edge.sourceNodeId === id || edge.targetNodeId === id) {
        this.edges.delete(edgeId);
      }
    });
  }

  async createEdge(edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEdge> {
    const id = uuidv4();
    const ts = now();
    const result: MemoryEdge = { ...edge, id, createdAt: ts, updatedAt: ts };
    this.edges.set(id, result);
    return result;
  }

  async getEdge(id: string): Promise<MemoryEdge | undefined> {
    return this.edges.get(id);
  }

  async getEdgesBySource(sourceNodeId: string): Promise<MemoryEdge[]> {
    return Array.from(this.edges.values()).filter(e => e.sourceNodeId === sourceNodeId);
  }

  async getEdgesByTarget(targetNodeId: string): Promise<MemoryEdge[]> {
    return Array.from(this.edges.values()).filter(e => e.targetNodeId === targetNodeId);
  }

  async updateEdge(id: string, updates: Partial<Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const edge = this.edges.get(id);
    if (!edge) return;

    const updated = { ...edge, ...updates, updatedAt: now() };
    this.edges.set(id, updated);
  }

  async deleteEdge(id: string): Promise<void> {
    this.edges.delete(id);
  }

  async getNeighbors(nodeId: string, depth: number = 1): Promise<MemoryNode[]> {
    const visited = new Set<string>();
    const toVisit = [{ id: nodeId, currentDepth: 0 }];
    const neighbors: MemoryNode[] = [];

    while (toVisit.length > 0) {
      const { id, currentDepth } = toVisit.shift()!;

      if (visited.has(id)) continue;
      visited.add(id);

      if (currentDepth > 0) {
        const node = this.nodes.get(id);
        if (node) {
          neighbors.push(node);
        }
      }

      if (currentDepth < depth) {
        const outEdges = Array.from(this.edges.values()).filter(e => e.sourceNodeId === id);
        const inEdges = Array.from(this.edges.values()).filter(e => e.targetNodeId === id);

        for (const edge of [...outEdges, ...inEdges]) {
          const nextId = edge.sourceNodeId === id ? edge.targetNodeId : edge.sourceNodeId;
          if (!visited.has(nextId)) {
            toVisit.push({ id: nextId, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    return neighbors;
  }

  async getNodesByTag(tagValue: string): Promise<MemoryNode[]> {
    const result: MemoryNode[] = [];

    this.nodeTags.forEach((tags, nodeId) => {
      if (tags.domain.includes(tagValue) || tags.industry.includes(tagValue) ||
          tags.concept.includes(tagValue) || tags.action.includes(tagValue)) {
        const node = this.nodes.get(nodeId);
        if (node) {
          result.push(node);
        }
      }
    });

    return result;
  }

  async addNodeTags(nodeId: string, tags: { domain?: string[], industry?: string[], concept?: string[], action?: string[] }): Promise<void> {
    const existing = this.nodeTags.get(nodeId) || { domain: [], industry: [], concept: [], action: [] };

    if (tags.domain) {
      existing.domain = [...new Set([...existing.domain, ...tags.domain])];
    }
    if (tags.industry) {
      existing.industry = [...new Set([...existing.industry, ...tags.industry])];
    }
    if (tags.concept) {
      existing.concept = [...new Set([...existing.concept, ...tags.concept])];
    }
    if (tags.action) {
      existing.action = [...new Set([...existing.action, ...tags.action])];
    }

    this.nodeTags.set(nodeId, existing);
  }

  async getTagsByNode(nodeId: string): Promise<{ domain: string[], industry: string[], concept: string[], action: string[] }> {
    return this.nodeTags.get(nodeId) || { domain: [], industry: [], concept: [], action: [] };
  }

  async close(): Promise<void> {
    this.nodes.clear();
    this.edges.clear();
    this.nodeTags.clear();
  }
}