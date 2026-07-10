import { SensoryMemory } from './sensoryMemory';

interface WorkingMemoryItem {
  id: string;
  content: string;
  type: 'fact' | 'thought' | 'emotion' | 'goal';
  relevance: number;
  timestamp: number;
  sourceId?: string;
}

export class WorkingMemory {
  private items: WorkingMemoryItem[];
  private readonly maxCapacity: number;
  private readonly sensoryMemory: SensoryMemory;

  constructor(sensoryMemory: SensoryMemory, maxCapacity: number = 7) {
    this.items = [];
    this.maxCapacity = maxCapacity;
    this.sensoryMemory = sensoryMemory;
  }

  add(item: Omit<WorkingMemoryItem, 'id' | 'timestamp'>): string {
    const id = `working-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const timestamp = Date.now();

    if (this.items.length >= this.maxCapacity) {
      this.items.sort((a, b) => b.relevance - a.relevance);
      this.items.pop();
    }

    this.items.push({
      id,
      ...item,
      timestamp,
    });

    return id;
  }

  retrieve(): WorkingMemoryItem[] {
    return this.items.slice().sort((a, b) => b.relevance - a.relevance);
  }

  getById(id: string): WorkingMemoryItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  updateRelevance(id: string, relevance: number): void {
    const item = this.items.find((item) => item.id === id);
    if (item) {
      item.relevance = relevance;
    }
  }

  consolidate(): WorkingMemoryItem[] {
    const consolidated = this.items.filter((item) => item.relevance > 0.5);
    this.items = this.items.filter((item) => item.relevance <= 0.5);
    return consolidated;
  }

  clear(): void {
    this.items = [];
  }

  getSize(): number {
    return this.items.length;
  }
}
