/**
 * @fileoverview Runs 模块领域层类型定义（Runtime v2 · 阶段3/4 前置 · 最小可用版）。
 *
 * 依据 `Runs/Runs-PRD.md`：两段式 submitRun（立即 ack）+ session lane（并发 1）
+ 队列模式（steer/followup/interrupt）+ 类型化 abort。
 */

import type { Metrics, Report } from '@brian-agent/base';
import { Input, Context, Output } from '@brian-agent/base';
import { AbortReason } from '../../shared/types';

/**
 * Runs 上下文（RunGatewayContext）。
 */
export class RunGatewayContext extends Context {}

// ---------------------------------------------------------------------------
// 枚举
// ---------------------------------------------------------------------------

/** Lane 种类（OpenClaw lane 代数）：session 并发 1 / main 16 / subagent 8 / background 2 */
export enum LaneKind {
  Session = 'session',
  Main = 'main',
  Subagent = 'subagent',
  Background = 'background',
}

/** 各 lane 并发上限 */
export const LANE_CONCURRENCY: Record<LaneKind, number> = {
  [LaneKind.Session]: 1,
  [LaneKind.Main]: 16,
  [LaneKind.Subagent]: 8,
  [LaneKind.Background]: 2,
}

/** 队列模式（session lane 忙时的入队语义；collect 阶段4 落地） */
export enum QueueMode {
  /** 注入活动 run 边界（默认） */
  Steer = 'steer',
  /** 排队，当前 run 结束后执行 */
  Followup = 'followup',
  /** 合并静默窗口内消息（阶段4） */
  Collect = 'collect',
  /** 中止活动 run 后运行最新消息 */
  Interrupt = 'interrupt',
}

/** Run 状态机：accepted → running → finished/error/aborted；排队为 queued */
export enum RunStatus {
  Accepted = 'accepted',
  Running = 'running',
  Queued = 'queued',
  Finished = 'finished',
  Error = 'error',
  Aborted = 'aborted',
}

/** Run 记录 */
export interface RunRecord {
  id: string;
  session_key: string;
  /** 引用 runtime_session.id（submitRun 服务端按 session_key 幂等解析后落账） */
  session_id: string;
  agent_def_id: string;
  lane: string;
  status: RunStatus;
  stop_reason?: string;
  queue_mode?: QueueMode;
  budget_total: number;
  budget_used: number;
  accepted_at: number;
  started_at?: number;
  settled_at?: number;
  created: number;
  updated: number;
}

// ---------------------------------------------------------------------------
// submitRun（两段式：立即 ack；结果经事件流/waitRun 承载）
// ---------------------------------------------------------------------------

/** submitRun 入参 */
export class SubmitRunInput extends Input {
  /** 外部会话标识（lane/steering 定位） */
  session_key!: string;
  /** 调用方传入的会话标识（兼容保留；运行记录统一落 runtime_session.id，服务端按 session_key 幂等解析） */
  session_id?: string;
  /** 用户消息 */
  user_message!: string;
  /** 队列模式（缺省 steer） */
  queue_mode?: QueueMode;
  context_id?: string;
  /** 预算覆盖（缺省取快照 budget_total） */
  budget_total?: number;
  /** Lane 种类（缺省 session；delegate 子代理用 subagent，curator 用 background） */
  lane_kind?: LaneKind;
}

/** submitRun 出参（两段式 ack） */
export class SubmitRunOutput extends Output {
  /** 本消息关联的 run ID（steer 模式为活动 run，排队/新启动为本 run） */
  run_id!: string;
  /** 立即受理时间戳 */
  accepted_at!: number;
  /** 是否排队（followup/interrupt 时 true，由 lane 排水后执行） */
  queued!: boolean;
  /** steer 模式：消息已注入活动 run */
  steered!: boolean;
}

// ---------------------------------------------------------------------------
// waitRun / steerRun / abortRun / soRunStatus
// ---------------------------------------------------------------------------

/** waitRun 入参（等待 run 结算；HTTP 流式端点在订阅投影后 await） */
export class WaitRunInput extends Input {
  /** 目标 run ID */
  run_id!: string;
  /** 超时毫秒（缺省 0=不限） */
  timeout_ms?: number;
}

/** waitRun 出参 */
export class WaitRunOutput extends Output {
  /** 结算状态 */
  status!: RunStatus;
  /** 终止原因 */
  stop_reason?: string;
}

/** steerRun 入参（向活动 run 注入排队消息，边界抽干生效） */
export class SteerRunInput extends Input {
  /** 目标会话 */
  session_key!: string;
  /** 注入消息 */
  message!: string;
}

/** steerRun 出参 */
export class SteerRunOutput extends Output {
  /** 活动 run ID（无活动 run 时为空串） */
  run_id!: string;
  /** 是否已入 steering 队列 */
  enqueued!: boolean;
}

/** abortRun 入参（类型化取消） */
export class AbortRunInput extends Input {
  /** 目标 run ID */
  run_id!: string;
  /** 取消原因（枚举注册点 Runtime/shared AbortReason） */
  reason!: AbortReason;
}

/** abortRun 出参 */
export class AbortRunOutput extends Output {
  /** 是否发出取消信号 */
  signalled!: boolean;
}

/** soRunStatus 入参 */
export class SoRunStatusInput extends Input {
  /** 目标 run ID */
  run_id!: string;
}

/** soRunStatus 出参 */
export class SoRunStatusOutput extends Output {
  /** run 记录 */
  run?: RunRecord;
}

// ---------------------------------------------------------------------------
// askPermission / answerPermission / waitPermission（权限门：Deferred 挂起）
// ---------------------------------------------------------------------------

/** waitPermission 入参 */
export class WaitPermissionInput extends Input {
  /** 权限请求 ID（Loop 生成并随 permission.asked 事件下发） */
  permission_id!: string;
  /** 工具 ID（2026-09-12 新增：信任表命中时直接放行，无需挂起） */
  tool_id?: string;
}

/** waitPermission 出参 */
export class WaitPermissionOutput extends Output {
  /** 是否批准 */
  approved = false;
  /** 是否已应答（超时/未应答时 false） */
  answered = false;
  /** 是否由信任表自动放行（2026-09-12 新增：无用户交互） */
  auto_approved = false;
}

/** answerPermission 入参 */
export class AnswerPermissionInput extends Input {
  /** 权限请求 ID */
  permission_id!: string;
  /** 是否批准 */
  approved!: boolean;
  /** 是否记住为信任工具（2026-09-12 新增：批准且记住时写入信任表，后续同工具自动放行） */
  remember?: boolean;
}

/** answerPermission 出参 */
export class AnswerPermissionOutput extends Output {
  /** 是否成功应答（权限不存在/已应答时 false） */
  answered = false;
}

// ---------------------------------------------------------------------------
// waitUserAnswer / answerUserAsk（ask_user 工具：Deferred 挂起，答复=下一条 user 消息）
// ---------------------------------------------------------------------------

/** waitUserAnswer 入参（ask_user 工具挂起等待用户答复） */
export class WaitUserAnswerInput extends Input {
  /** 提问 ID（工具生成并随 permission.asked 事件下发） */
  ask_id!: string;
  /** 引用 runtime_run.id（答复落库归因） */
  run_id!: string;
  /** 外部会话标识 */
  session_key!: string;
}

/** waitUserAnswer 出参 */
export class WaitUserAnswerOutput extends Output {
  /** 用户答复文本（超时/未应答为空串） */
  answer = '';
  /** 是否已应答 */
  answered = false;
}

/** answerUserAsk 入参（HTTP 端点调用，唤醒挂起的 ask_user 工具） */
export class AnswerUserAskInput extends Input {
  /** 提问 ID */
  ask_id!: string;
  /** 用户答复文本（作为下一条 user 消息落库） */
  answer!: string;
}

/** answerUserAsk 出参 */
export class AnswerUserAskOutput extends Output {
  /** 是否成功应答（提问不存在/已应答/已超时时 false） */
  answered = false;
}

// ---------------------------------------------------------------------------
// configRuns
// ---------------------------------------------------------------------------

/** configRuns 入参 */
export class ConfigRunsInput extends Input {
  /** 启用/禁用网关（缺省 true） */
  enabled?: boolean;
  /** 权限等待超时（毫秒；超时默认拒绝；2026-09-11 新增） */
  permission_wait_timeout_ms?: number;
  /** 信任工具表全量覆盖（2026-09-12 新增：用于撤销信任；缺省不改动） */
  trusted_tools?: string[];
  // ===== 2026-09-14 新增：评估 Agent 执行策略 =====
  /** 评估异步后台执行（缺省 true：评估不阻塞写作与 run 结算，实测评估 LLM 可达 20s+） */
  eval_async?: boolean;
  /** 低风险场景跳过评估（缺省 true：单轮直答 stop 且仅 1 轮时跳过评估） */
  eval_skip_low_risk?: boolean;
}

/** configRuns 出参 */
export class ConfigRunsOutput extends Output {
  /** 当前配置 */
  permission_wait_timeout_ms?: number;
  /** 当前信任工具表（2026-09-12 新增） */
  trusted_tools?: string[];
  /** 当前评估异步开关（2026-09-14 新增） */
  eval_async?: boolean;
  /** 当前低风险跳过开关（2026-09-14 新增） */
  eval_skip_low_risk?: boolean;
}

// ---------------------------------------------------------------------------
// 网关内部数据结构（实例注册表条目）
// ---------------------------------------------------------------------------

/** 会话 lane（实例字段；活动 run / 排队 / steering 队列） */
export interface SessionLane {
  /** 活动 run ID（未结算） */
  activeRunId?: string;
  /** 排队 run（followup/interrupt；parent 携带调用方 metrics/report 供执行期上报） */
  pending: Array<{ runId: string; input: SubmitRunInput; parent?: { metrics?: Metrics; report?: Report } }>;
  /** steering 消息队列（活动 run 边界抽干） */
  steering: string[];
}

/** 结算 waiter（waitRun 注册） */
export interface Waiter {
  resolve: (result: { status: RunStatus; stop_reason?: string }) => void;
}

// ---------------------------------------------------------------------------
// 表名
// ---------------------------------------------------------------------------

/** runtime_run 表名 */
export const RUNTIME_RUN_TABLE = 'runtime_run';



/** runtime_runs_config 配置表名 */
export const RUNTIME_RUNS_CONFIG_TABLE = 'runtime_runs_config';
