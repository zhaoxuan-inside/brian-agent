export interface BudgetSpec {
  
  total: number;
  
  tool_call_limit?: number;
  
  grace?: boolean;
}

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

  
  get used(): number {
    return this.usedCount;
  }

  
  get remaining(): number {
    return Math.max(0, this.spec.total - this.usedCount);
  }

  
  get exhausted(): boolean {
    return this.remaining <= 0;
  }

  
  get toolCallLimit(): number {
    return this.spec.tool_call_limit;
  }

  
  get graceAvailable(): boolean {
    return this.spec.grace && !this.graceConsumed;
  }

  

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

  

  refund(n = 1): void {
    this.usedCount = Math.max(0, this.usedCount - n);
  }

  

  withinToolCallLimit(count: number): boolean {
    return count <= this.spec.tool_call_limit;
  }
}
