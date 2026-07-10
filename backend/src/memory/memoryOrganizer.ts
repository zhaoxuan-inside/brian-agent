import { GraphStorage } from '../storage/graphStorage';
import { MemoryNode, MemoryEdge } from '@shared/types';

export class MemoryOrganizer {
  private graphStorage: GraphStorage;
  private minWeightThreshold: number;

  constructor(graphStorage: GraphStorage, minWeightThreshold: number = 0.1) {
    this.graphStorage = graphStorage;
    this.minWeightThreshold = minWeightThreshold;
  }

  organize(): void {
    this.buildConnections();
    this.strengthenConnections();
    this.breakLowValueConnections();
  }

  buildConnections(): void {
    const memories = this.graphStorage.getAllNodes().filter((node) => node.type === 'memory');

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const memory1 = memories[i];
        const memory2 = memories[j];

        if (!this.hasEdge(memory1.id, memory2.id)) {
          const weight = this.calculateConnectionWeight(memory1, memory2);
          if (weight > 0.2) {
            this.graphStorage.createEdge({
              sourceNodeId: memory1.id,
              targetNodeId: memory2.id,
              weight,
              label: 'related',
              activationCount: 0,
              direction: 'undirected',
            });
          }
        }
      }
    }
  }

  strengthenConnections(): void {
    const edges = this.graphStorage.getAllNodes().map((node) => this.graphStorage.getEdgesBySource(node.id)).flat();

    for (const edge of edges) {
      const sourceNode = this.graphStorage.getNode(edge.sourceNodeId);
      const targetNode = this.graphStorage.getNode(edge.targetNodeId);

      if (sourceNode && targetNode) {
        const newWeight = this.strengthenEdge(edge, sourceNode, targetNode);
        this.graphStorage.updateEdge(edge.id, { weight: newWeight });
      }
    }
  }

  breakLowValueConnections(): void {
    const edges = this.graphStorage.getAllNodes().map((node) => this.graphStorage.getEdgesBySource(node.id)).flat();

    for (const edge of edges) {
      if (edge.weight < this.minWeightThreshold) {
        this.graphStorage.deleteEdge(edge.id);
      }
    }
  }

  private calculateConnectionWeight(node1: MemoryNode, node2: MemoryNode): number {
    const tagOverlap = this.calculateTagOverlap(node1, node2);
    const contentSimilarity = this.calculateContentSimilarity(node1, node2);
    const timeProximity = this.calculateTimeProximity(node1, node2);

    return (tagOverlap * 0.4) + (contentSimilarity * 0.3) + (timeProximity * 0.3);
  }

  private calculateTagOverlap(node1: MemoryNode, node2: MemoryNode): number {
    const tags1 = (node1.metadata.tags as string[]) || [];
    const tags2 = (node2.metadata.tags as string[]) || [];

    if (tags1.length === 0 || tags2.length === 0) return 0;

    const intersection = tags1.filter((tag) => tags2.includes(tag));
    return intersection.length / Math.max(tags1.length, tags2.length);
  }

  private calculateContentSimilarity(node1: MemoryNode, node2: MemoryNode): number {
    const content1 = node1.content.toLowerCase();
    const content2 = node2.content.toLowerCase();

    const words1 = content1.split(/\s+/);
    const words2 = content2.split(/\s+/);

    if (words1.length === 0 || words2.length === 0) return 0;

    const commonWords = words1.filter((word) => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  private calculateTimeProximity(node1: MemoryNode, node2: MemoryNode): number {
    const timeDiff = Math.abs(node1.createdAt - node2.createdAt);
    const maxDiff = 7 * 24 * 60 * 60 * 1000;

    if (timeDiff > maxDiff) return 0;
    return 1 - (timeDiff / maxDiff);
  }

  private strengthenEdge(edge: MemoryEdge, source: MemoryNode, target: MemoryNode): number {
    const activationBoost = 0.1 * edge.activationCount;
    const decay = edge.weight * source.decayRate;
    const strengthFactor = (source.strength + target.strength) / 2;

    const newWeight = edge.weight + activationBoost - decay + (strengthFactor * 0.1);
    return Math.max(0, Math.min(1, newWeight));
  }

  private hasEdge(nodeId1: string, nodeId2: string): boolean {
    const edges = this.graphStorage.getEdgesBySource(nodeId1);
    return edges.some((edge) => edge.targetNodeId === nodeId2);
  }
}
