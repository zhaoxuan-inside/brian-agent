import type { MemoryNode, MemoryEdge } from '../../shared/types';

export interface IGraphStorage {
  createNode(node: Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryNode>;
  
  getNode(id: string): Promise<MemoryNode | undefined>;
  
  getAllNodes(): Promise<MemoryNode[]>;
  
  getNodesByType(type: string): Promise<MemoryNode[]>;
  
  updateNode(id: string, updates: Partial<Omit<MemoryNode, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void>;
  
  deleteNode(id: string): Promise<void>;
  
  createEdge(edge: Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEdge>;
  
  getEdge(id: string): Promise<MemoryEdge | undefined>;
  
  getEdgesBySource(sourceNodeId: string): Promise<MemoryEdge[]>;
  
  getEdgesByTarget(targetNodeId: string): Promise<MemoryEdge[]>;
  
  updateEdge(id: string, updates: Partial<Omit<MemoryEdge, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void>;
  
  deleteEdge(id: string): Promise<void>;
  
  getNeighbors(nodeId: string, depth: number): Promise<MemoryNode[]>;
  
  getNodesByTag(tagValue: string): Promise<MemoryNode[]>;
  
  addNodeTags(nodeId: string, tags: { domain?: string[], industry?: string[], concept?: string[], action?: string[] }): Promise<void>;
  
  getTagsByNode(nodeId: string): Promise<{ domain: string[], industry: string[], concept: string[], action: string[] }>;
  
  close(): Promise<void>;
}