/**
 * @fileoverview MQCoreProvider 领域层类型定义。
 *
 * 定义 MQCoreContext、WorkerInfo 及各功能的 Input / Output 类型。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output } from '@brian-agent/base';
import type { MessageRecord } from '@brian-agent/base';

/**
 * MQCore 上下文（MQCoreContext）。
 *
 * 继承 Context 基类，工作器管理相关操作的执行上下文。
 */
export class MQCoreContext extends Context {}

/**
 * 工作器信息（对外暴露的只读快照）。
 */
export interface WorkerInfo {
  /** 工作器唯一标识 */
  worker_id: string;
  /** 监听的队列名称 */
  queue: string;
  /** 启动时间（毫秒时间戳） */
  started_at: number;
  /** 已成功处理的消息数 */
  processed_count: number;
  /** 处理失败次数 */
  error_count: number;
}

/**
 * 工作器消息处理函数签名。
 *
 * 接收被消费的消息，返回 true 表示成功、false 表示失败。
 */
export type WorkerHandler = (msg: MessageRecord) => Promise<boolean>;

// ---------------------------------------------------------------------------
// startWorker
// ---------------------------------------------------------------------------

/** startWorker 入参 */
export class StartWorkerInput extends Input {
  /** 队列名称 */
  queue!: string;
  /** 消息处理函数 */
  handler!: WorkerHandler;
  /** 轮询间隔（毫秒），默认 1000 */
  interval?: number;
}

/** startWorker 出参 */
export class StartWorkerOutput extends Output {
  /** 分配的工作器 ID */
  worker_id = '';
}

// ---------------------------------------------------------------------------
// stopWorker
// ---------------------------------------------------------------------------

/** stopWorker 入参 */
export class StopWorkerInput extends Input {
  /** 工作器 ID 或队列名称；匹配 worker_id 时精确停止单个工作器，匹配队列名时停止该队列全部工作器 */
  identifier!: string;
}

/** stopWorker 出参 */
export class StopWorkerOutput extends Output {
  /** 停止的工作器数量 */
  stopped_count = 0;
}

// ---------------------------------------------------------------------------
// soWorker
// ---------------------------------------------------------------------------

/** soWorker 入参 */
export class SoWorkerInput extends Input {
  /** 队列名称（可选），不指定则返回所有工作器 */
  queue?: string;
}

/** soWorker 出参 */
export class SoWorkerOutput extends Output {
  /** 工作器列表 */
  workers: WorkerInfo[] = [];
}
