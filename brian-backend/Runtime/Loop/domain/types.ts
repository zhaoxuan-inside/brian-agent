/**
 * @fileoverview Loop 模块领域层类型定义（Runtime v2 · 阶段2）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Loop/Loop-PRD.md` §2/§3/§5：
 * 两级 while 循环（外层 followup · 内层 tool_calls + steering）；
 * 循环控制状态从持久化 Part 派生（prepareModelMessages 读 runtime_message_part）；
 * 终止条件 = finish reason 无 tool_calls；预算 = IterationBudget。
 *
 * 阶段2 边界：steering/followup 队列为占位（阶段3 接 Runs 模块）。
 */

import { Input, Context, Output } from '@brian-agent/base';
import type { BudgetSpec } from '../../shared/IterationBudget';

/**
 * Loop 上下文（LoopContext）。
 */
export class LoopContext extends Context {}

// ---------------------------------------------------------------------------
// execAgentLoop
// ---------------------------------------------------------------------------

/** execAgentLoop 入参 */
export class ExecAgentLoopInput extends Input {
  /** 引用 runtime_run.id（阶段4 前由调用方本地生成） */
  run_id!: string;
  /** 外部会话标识（事件投影定位） */
  session_key!: string;
  /** 引用 runtime_session.id（消息/Part 持久化） */
  session_id!: string;
  /** 用户消息（写入会话后作为首条 wire 消息） */
  user_message!: string;
  /** 系统提示（Agents 声明式快照阶段3 接入前显式传入） */
  system?: string;
  /** LLM ID（llm_available.id；空串/缺省=默认模型故障降级队列） */
  llm_id?: string;
  /** 可见工具 id 列表（空=全部已注册工具） */
  tools?: string[];
  /** 预算规格（缺省 total=60 + 宽限收尾） */
  budget?: BudgetSpec;
  /** 采样温度 */
  temperature?: number;
  /** 最大 Token 数 */
  max_tokens?: number;
  /** 外部取消信号（与 abortLoopTurn 同构接线） */
  signal?: AbortSignal;
  /** 空闲看门狗毫秒数（透传 LLMEventsRunner，缺省 30000） */
  idle_watchdog_ms?: number;
}

/** execAgentLoop 出参 */
export class ExecAgentLoopOutput extends Output {
  /** 终止原因：stop | aborted | error | budget */
  stop_reason!: 'stop' | 'aborted' | 'error' | 'budget';
  /** 最终回复文本（finish_reason=stop 的 text 聚合） */
  result!: string;
  /** Token 用量 */
  token_usage!: { input_tokens: number; output_tokens: number };
  /** 内层循环轮数（= 消费预算数） */
  iterations!: number;
  /** 最终 assistant 消息 ID */
  message_id?: string;
}

// ---------------------------------------------------------------------------
// abortLoopTurn
// ---------------------------------------------------------------------------

/** abortLoopTurn 入参（类型化取消，OpenClaw turn-interruption 范式） */
export class AbortLoopTurnInput extends Input {
  /** 目标 run ID */
  run_id!: string;
  /** 取消原因 */
  reason!: 'user' | 'timeout' | 'budget' | 'superseded';
}

/** abortLoopTurn 出参 */
export class AbortLoopTurnOutput extends Output {
  /** 是否成功发出取消信号（run 不存在或已结束时 false） */
  signalled!: boolean;
}

// ---------------------------------------------------------------------------
// configLoop
// ---------------------------------------------------------------------------

/** configLoop 入参 */
export class ConfigLoopInput extends Input {
  /** 启用/禁用 Loop 组件（缺省 true） */
  enabled?: boolean;
  /** 默认预算 total（缺省 60） */
  default_budget_total?: number;
}

/** configLoop 出参 */
export class ConfigLoopOutput extends Output {}
