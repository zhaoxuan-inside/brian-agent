export class LaneSemaphore {
  private running = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  
  get inFlight(): number {
    return this.running;
  }

  
  acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.running += 1;
        resolve();
      });
    });
  }

  
  release(): void {
    this.running = Math.max(0, this.running - 1);
    const next = this.waiters.shift();
    next?.();
  }
}
