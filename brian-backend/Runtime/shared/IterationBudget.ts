/**
 * @fileoverview IterationBudget —— 迭代预算（Runtime v2 · 阶段 0，Loop-PRD §6）。
 *
 * 范式来源：Hermes agent/iteration_budget（线程安全预算 + 超支宽限）。
 * 取代旧 `max_iterations: 10` / `max_execution_depth: 50` 散落配置。
 *
 * 语义：
 * - `consume()`：消费 1 个迭代；预算耗尽返回 false，但宽限期内（grace）仍允许
 *   消费 1 次，用于强制收尾调用（无工具收尾 prefill 由 Loop 侧处理）；
 * - `refund(n)`：退还未实际消耗的迭代（如子代理提前完成退还不适用额）；
 * - 子代理独立预算（delegate 传入 SUBAGENT_BUDGET，不与父共享）。
 */

/** 预算规格 */
export interface BudgetSpec {
  /** 总迭代数 */
  total: number;
  /** 单轮工具调用数上限（可选；不传不限） */
  tool_call_limit?: number;
  /** 超支宽限期：耗尽后仍允许 1 次收尾消费（默认 true） */
  grace?: boolean;
}

/** 预算耗尽后宽限收尾的标记事件（Loop 侧据此注入收尾 prefill） */
export const BUDGET_GRACE_MARKER = 'budget_grace';

/**
 * IterationBudget。
 */
export class IterationBudget {
  private readonly spec: Required<BudgetSpec>;
  private usedCount = 0;
  private graceConsumed = false;

  constructor(spec: BudgetSpec) {
    this.spec = {
      total: spec.total,
      tool_call_limit: spec.tool_call_limit ?? Number.MAX_SAFE_INTEGER,
      grace: spec.grace ?? true,
    };
  }

  /** 已消费迭代数 */
  get used(): number {
    return this.usedCount;
  }

  /** 剩余迭代数（含宽限期则为 0） */
  get remaining(): number {
    return Math.max(0, this.spec.total - this.usedCount);
  }

  /** 预算是否已耗尽（宽限未消费时仍可通过 consume 收尾） */
  get exhausted(): boolean {
    return this.remaining <= 0;
  }

  /** 单轮工具调用上限 */
  get toolCallLimit(): number {
    return this.spec.tool_call_limit;
  }

  /** 宽限期是否可用（未消费过且启用） */
  get graceAvailable(): boolean {
    return this.spec.grace && !this.graceConsumed;
  }

  /**
   * 消费 1 个迭代（逻辑控制）。
   *
   * @returns true 表示允许执行；false 表示耗尽且无宽限
   */
  consume(): boolean {
    if (this.remaining > 0) {
      this.usedCount += 1;
      return true;
    }
    if (this.graceAvailable) {
      this.graceConsumed = true;
      this.usedCount += 1;
      return true;
    }
    return false;
  }

  /**
   * 退还未实际消耗的迭代（数据处理；宽限收尾不可退还）。
   */
  refund(n = 1): void {
    this.usedCount = Math.max(0, this.usedCount - n);
  }

  /**
   * 校验单轮工具调用数是否超限（数据处理）。
   */
  withinToolCallLimit(count: number): boolean {
    return count <= this.spec.tool_call_limit;
  }
}
