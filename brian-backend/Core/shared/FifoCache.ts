export class FifoCache<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly maxEntries: number) {}

  
  get(key: string): V | undefined {
    return this.map.get(key);
  }

  
  set(key: string, value: V): void {
    if (this.maxEntries <= 0) {
      return;
    }
    if (!this.map.has(key) && this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  
  delete(key: string): boolean {
    return this.map.delete(key);
  }

  
  clear(): void {
    this.map.clear();
  }

  
  get size(): number {
    return this.map.size;
  }

  
  entries(): Array<[string, V]> {
    return [...this.map.entries()];
  }
}
