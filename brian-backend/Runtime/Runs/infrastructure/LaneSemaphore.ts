/**
 * @fileoverview Lane 并发信号量（Runs · background lane curator 并发上限；Runs-PRD §4 lane 代数）。
 *
 * 简单 promise 队列实现（零外部依赖）：acquire 满载时排队等待 release 唤醒，
 * 保证同一 lane 内并发不超过上限（前台回复永不与维护工作竞争）。
 */

/** lane 并发信号量（实例级；每个 lane 键一个） */
export class LaneSemaphore {
  private running = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  /** 当前占用数（观测用） */
  get inFlight(): number {
    return this.running;
  }

  /** 获取槽位（逻辑控制；满则排队，release 按序唤醒） */
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

  /** 释放槽位（逻辑控制；唤醒下一位等待者） */
  release(): void {
    this.running = Math.max(0, this.running - 1);
    const next = this.waiters.shift();
    next?.();
  }
}
