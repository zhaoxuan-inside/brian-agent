/**
 * @fileoverview 通用 FIFO 缓存（容量淘汰）。
 *
 * 算法（逻辑控制）与数据（Map 存取）分离：
 * - get/set/delete/clear 为纯存取；
 * - set 内部在容量超限时按插入序淘汰最旧条目。
 */
export class FifoCache<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly maxEntries: number) {}

  /** 读取条目（无过期逻辑；TTL 由调用方判定） */
  get(key: string): V | undefined {
    return this.map.get(key);
  }

  /** 写入条目；容量超限时淘汰最早插入的条目 */
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

  /** 删除条目 */
  delete(key: string): boolean {
    return this.map.delete(key);
  }

  /** 清空全部 */
  clear(): void {
    this.map.clear();
  }

  /** 当前条目数 */
  get size(): number {
    return this.map.size;
  }

  /** 全部条目快照（数据处理；sourceMap 键值对列表） */
  entries(): Array<[string, V]> {
    return [...this.map.entries()];
  }
}
