/**
 * @fileoverview MQCoreProvider 接入层。
 *
 * DDD 中 access 层作为模块对外的统一入口。
 * 本层职责：
 * 1. 封装 application 层 MQCoreService，提供 (Input, Context, Output) 签名的方法调用入口；
 * 2. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 3. MQCoreProvider 无 DB 表依赖，无需 SchemaInitializer 或 initialize 步骤。
 */

import type { MQAccess } from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { MQCoreService } from '../application/MQCoreService';
import {
  MQCoreContext,
  StartWorkerInput,
  StartWorkerOutput,
  StopWorkerInput,
  StopWorkerOutput,
  SoWorkerInput,
  SoWorkerOutput,
} from '../domain/types';

/**
 * MQCoreProvider 接入层。
 *
 * 用法示例：
 * ```typescript
 * const mqAccess = new MQAccess(relationDb);
 * await mqAccess.initialize();
 *
 * const mqCore = new MQCoreAccess(mqAccess);
 *
 * const startOutput = new StartWorkerOutput();
 * await mqCore.startWorker(
 *   { queue: 'tasks', handler: async (msg) => { ... } },
 *   new MQCoreContext(),
 *   startOutput,
 * );
 * // 稍后停止
 * const stopOutput = new StopWorkerOutput();
 * await mqCore.stopWorker(
 *   { identifier: startOutput.worker_id },
 *   new MQCoreContext(),
 *   stopOutput,
 * );
 * ```
 */
export class MQCoreAccess {
  private readonly service: MQCoreService;

  /**
   * @param mqAccess MQProvider 接入层实例（需已初始化）
   * @param logger 可选日志记录器
   */
  constructor(mqAccess: MQAccess, logger?: Logger) {
    const rawService = new MQCoreService(mqAccess);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /** 启动一个轮询消费工作器 */
  async startWorker(
    input: StartWorkerInput,
    context: MQCoreContext,
    output: StartWorkerOutput,
  ): Promise<boolean> {
    return this.service.startWorker(input, context, output);
  }

  /** 停止工作器（按 ID 或队列名称） */
  async stopWorker(
    input: StopWorkerInput,
    context: MQCoreContext,
    output: StopWorkerOutput,
  ): Promise<boolean> {
    return this.service.stopWorker(input, context, output);
  }

  /** 查询运行中的工作器 */
  async soWorker(
    input: SoWorkerInput,
    context: MQCoreContext,
    output: SoWorkerOutput,
  ): Promise<boolean> {
    return this.service.soWorker(input, context, output);
  }
}
