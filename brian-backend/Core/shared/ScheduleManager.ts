/**
 * @fileoverview Core 层通用后台调度管理器。
 *
 * 替代各模块中重复的 Map<string, NodeJS.Timeout> 模式，
 * 提供统一的 interval 调度生命周期管理。
 */

export type ScheduledTask = (key: string) => Promise<void> | void;

export class ScheduleManager {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  /**
   * 为一个 key 启动后台调度。重复调用会先取消旧的 interval。
   *
   * @param key 调度标识（如 soul/agent_id）
   * @param task 周期执行的任务函数
   * @param intervalMs 间隔毫秒数
   */
  schedule(key: string, task: ScheduledTask, intervalMs: number): void {
    this.cancel(key);
    const timer = setInterval(() => {
      void (async () => {
        try {
          await task(key);
        } catch {
          /* 调度任务错误不应崩溃整个 interval */
        }
      })();
    }, intervalMs);
    this.timers.set(key, timer);
  }

  /**
   * 取消某个 key 的调度。
   */
  cancel(key: string): void {
    const existing = this.timers.get(key);
    if (existing) {
      clearInterval(existing);
      this.timers.delete(key);
    }
  }

  /**
   * 检查某个 key 是否已调度。
   */
  has(key: string): boolean {
    return this.timers.has(key);
  }

  /**
   * 获取所有已调度的 key。
   */
  keys(): string[] {
    return Array.from(this.timers.keys());
  }

  /**
   * 取消所有调度。
   */
  cancelAll(): void {
    for (const key of this.timers.keys()) {
      this.cancel(key);
    }
  }
}
