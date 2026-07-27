/**
 * @fileoverview MQCoreProvider 应用服务层。
 *
 * 提供工作器（Worker）管理业务逻辑：startWorker / stopWorker / soWorker。
 * 每个工作器通过 setInterval 定时轮询 MQProvider 消费消息并通过 handler 处理。
 *
 * 并发控制：单个工作器最多同时处理 5 条消息（semaphore），
 * 超限时跳过当前轮询周期（backpressure）。
 *
 * 重试控制：每条消息最多重试 3 次，通过内存 Map 独立追踪；
 * 达到上限后 MQProvider 的 nackMQ 自动将消息标记为 FAILED。
 */

import {
  MQAccess,
  MQContext,
  ConsumeMQInput,
  ConsumeMQOutput,
  AckMQInput,
  AckMQOutput,
  NackMQInput,
  NackMQOutput,
} from '@brian-agent/base';
import type { MessageRecord } from '@brian-agent/base';
import { v4 as uuidv4 } from 'uuid';
import {
  MQCoreContext,
  StartWorkerInput,
  StartWorkerOutput,
  StopWorkerInput,
  StopWorkerOutput,
  SoWorkerInput,
  SoWorkerOutput,
  WorkerInfo,
} from '../domain/types';

/** 最大并发处理消息数 */
const MAX_CONCURRENCY = 5;

/** 最大重试次数 */
const MAX_RETRIES = 3;

/**
 * 内存中的工作器状态。
 */
interface WorkerState {
  worker_id: string;
  queue: string;
  handler: (msg: MessageRecord) => Promise<boolean>;
  interval_id: ReturnType<typeof setInterval>;
  interval: number;
  started_at: number;
  processed_count: number;
  error_count: number;
  /** 当前正在处理的消息数（semaphore） */
  active_count: number;
}

/**
 * MQCoreProvider 应用服务。
 *
 * 管理多个轮询消费工作器，每个工作器独立维护生命周期与统计信息。
 * 本服务无状态持久化需求——所有工作器状态仅在运行时存于内存。
 */
export class MQCoreService {
  /** worker_id → WorkerState */
  private readonly workers = new Map<string, WorkerState>();

  /** message_id → 当前已重试次数 */
  private readonly retryMap = new Map<string, number>();

  /**
   * @param mqAccess MQProvider 接入层实例（已初始化）
   */
  constructor(private readonly mqAccess: MQAccess) {}

  /**
   * 启动一个轮询消费工作器。
   *
   * PRD 3.1 条：为指定队列创建轮询工作器，按 interval 定时消费并处理消息。
   *
   * @returns worker_id 写入 output.worker_id
   */
  async startWorker(
    input: StartWorkerInput,
    _context: MQCoreContext,
    output: StartWorkerOutput,
  ): Promise<boolean> {
    const { queue, handler } = input;
    const interval = input.interval ?? 1000;

    const workerId = uuidv4();
    const state: WorkerState = {
      worker_id: workerId,
      queue,
      handler,
      // setInterval 返回 Timeout 对象，Node.js 下调用 clearInterval 即可清除
      interval_id: undefined as unknown as ReturnType<typeof setInterval>,
      interval,
      started_at: Date.now(),
      processed_count: 0,
      error_count: 0,
      active_count: 0,
    };

    const intervalId = setInterval(() => {
      void this.pollTick(state);
    }, interval);

    state.interval_id = intervalId;
    this.workers.set(workerId, state);

    output.worker_id = workerId;
    return true;
  }

  /**
   * 停止工作器。
   *
   * PRD 3.2 条：按 worker_id 精确停止单个工作器；按 queue 批量停止该队列所有工作器。
   *
   * @param input.identifier 工作器 ID 或队列名
   * @returns 停止数量写入 output.stopped_count
   */
  async stopWorker(
    input: StopWorkerInput,
    _context: MQCoreContext,
    output: StopWorkerOutput,
  ): Promise<boolean> {
    const identifier = input.identifier;
    let stoppedCount = 0;

    // 精确按 worker_id 匹配
    const byId = this.workers.get(identifier);
    if (byId) {
      clearInterval(byId.interval_id);
      this.workers.delete(identifier);
      stoppedCount = 1;
    } else {
      // 按队列名称匹配，停止所有同队列工作器
      const toStop: string[] = [];
      for (const [id, state] of this.workers) {
        if (state.queue === identifier) {
          clearInterval(state.interval_id);
          toStop.push(id);
        }
      }
      for (const id of toStop) {
        this.workers.delete(id);
      }
      stoppedCount = toStop.length;
    }

    output.stopped_count = stoppedCount;
    return true;
  }

  /**
   * 查询运行中的工作器。
   *
   * PRD 3.3 条：列出所有工作器或按队列过滤。
   *
   * @param input.queue 可选队列名，不指定则返回全部
   * @returns 工作器列表写入 output.workers
   */
  async soWorker(
    input: SoWorkerInput,
    _context: MQCoreContext,
    output: SoWorkerOutput,
  ): Promise<boolean> {
    const queueFilter = input.queue;
    const result: WorkerInfo[] = [];

    for (const state of this.workers.values()) {
      if (queueFilter && state.queue !== queueFilter) {
        continue;
      }
      result.push({
        worker_id: state.worker_id,
        queue: state.queue,
        started_at: state.started_at,
        processed_count: state.processed_count,
        error_count: state.error_count,
      });
    }

    output.workers = result;
    return true;
  }

  // -------------------------------------------------------------------------
  // 内部实现
  // -------------------------------------------------------------------------

  /**
   * 单次轮询处理：从队列消费一条消息并调用 handler 处理。
   *
   * 并发控制（backpressure）：若当前 active_count ≥ 5 则跳过本轮。
   * 成功 → ack；失败 → nack 并跟踪重试。
   */
  private async pollTick(state: WorkerState): Promise<void> {
    // 背压：并发数已满
    if (state.active_count >= MAX_CONCURRENCY) {
      return;
    }

    state.active_count++;

    try {
      const consumeOutput = new ConsumeMQOutput();
      const consumeInput = new ConsumeMQInput();
      consumeInput.queue = state.queue;
      await this.mqAccess.consumeMQ(consumeInput, new MQContext(), consumeOutput);

      const msg = consumeOutput.message;
      if (!msg) {
        return;
      }

      try {
        const ok = await state.handler(msg);
        if (ok) {
          const ackInput = new AckMQInput();
          ackInput.message_id = msg.id;
          await this.mqAccess.ackMQ(ackInput, new MQContext(), new AckMQOutput());

          // 成功后清理重试计数
          this.retryMap.delete(msg.id);
          state.processed_count++;
        } else {
          await this.handleFailure(state, msg);
        }
      } catch {
        await this.handleFailure(state, msg);
      }
    } catch {
      // consumeMQ 自身抛出的错误（例如网络、组件禁用）不增加 error_count，
      // 等待下一轮重试
    } finally {
      state.active_count--;
    }
  }

  /**
   * 处理 handler 失败：nack 消息并跟踪重试。
   */
  private async handleFailure(
    state: WorkerState,
    msg: MessageRecord,
  ): Promise<void> {
    // 更新内存重试计数
    const attempts = this.retryMap.get(msg.id) ?? 0;
    const nextAttempt = attempts + 1;

    // 达到上限后 MQProvider 的 nackMQ 会将消息标记为 FAILED
    if (nextAttempt >= MAX_RETRIES) {
      this.retryMap.delete(msg.id);
    } else {
      this.retryMap.set(msg.id, nextAttempt);
    }

    const nackInput = new NackMQInput();
    nackInput.message_id = msg.id;
    nackInput.reason = `handler returned false or threw (attempt ${nextAttempt}/${MAX_RETRIES})`;
    await this.mqAccess.nackMQ(nackInput, new MQContext(), new NackMQOutput());

    state.error_count++;
  }
}
