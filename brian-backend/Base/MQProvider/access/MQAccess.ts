/**
 * @fileoverview MQProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 MQSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { MQSchemaInitializer } from '../infrastructure/MQSchemaInitializer';
import { MQService } from '../application/MQService';
import {
  MQContext,
  SendMQInput,
  SendMQOutput,
  ConsumeMQInput,
  ConsumeMQOutput,
  AckMQInput,
  AckMQOutput,
  NackMQInput,
  NackMQOutput,
  GetQueueStatsInput,
  GetQueueStatsOutput,
  EnableMQInput,
  EnableMQOutput,
  CloseMQInput,
  CloseMQOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

/**
 * MQProvider 接入层。
 *
 * 作为消息队列的唯一操作入口，上层通过本类访问消息队列。
 *
 * 用法示例：
 * ```typescript
 * const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await relationDb.initialize();
 *
 * const mqAccess = new MQAccess(relationDb);
 * await mqAccess.initialize();
 *
 * const sendOutput = new SendMQOutput();
 * await mqAccess.sendMQ(
 *   { data: { queue: 'task', payload: { action: 'sync' } } },
 *   new MQContext(),
 *   sendOutput,
 * );
 *
 * const consumeOutput = new ConsumeMQOutput();
 * await mqAccess.consumeMQ({ queue: 'task' }, new MQContext(), consumeOutput);
 * if (consumeOutput.message) {
 *   await mqAccess.ackMQ(
 *     { message_id: consumeOutput.message.id },
 *     new MQContext(),
 *     new AckMQOutput(),
 *   );
 * }
 * ```
 */
export class MQAccess {
  private readonly service: MQService;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param logger 可选日志记录器
   */
  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    // 初始化表结构
    new MQSchemaInitializer(relationDb).init();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new MQService(relationDb);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /**
   * 初始化组件：写入默认配置并恢复 enabled 状态。
   */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 发送消息 */
  async sendMQ(
    input: SendMQInput,
    context: MQContext,
    output: SendMQOutput,
  ): Promise<boolean> {
    return this.service.sendMQ(input, context, output);
  }

  /** 消费消息 */
  async consumeMQ(
    input: ConsumeMQInput,
    context: MQContext,
    output: ConsumeMQOutput,
  ): Promise<boolean> {
    return this.service.consumeMQ(input, context, output);
  }

  /** 确认消息 */
  async ackMQ(
    input: AckMQInput,
    context: MQContext,
    output: AckMQOutput,
  ): Promise<boolean> {
    return this.service.ackMQ(input, context, output);
  }

  /** 否认消息 */
  async nackMQ(
    input: NackMQInput,
    context: MQContext,
    output: NackMQOutput,
  ): Promise<boolean> {
    return this.service.nackMQ(input, context, output);
  }

  /** 获取队列统计 */
  async getQueueStats(
    input: GetQueueStatsInput,
    context: MQContext,
    output: GetQueueStatsOutput,
  ): Promise<boolean> {
    return this.service.getQueueStats(input, context, output);
  }

  /** 启用/禁用 MQ 组件 */
  async enableMQ(
    input: EnableMQInput,
    context: MQContext,
    output: EnableMQOutput,
  ): Promise<boolean> {
    return this.service.enableMQ(input, context, output);
  }

  /** 关闭 MQ 组件（终态释放，不可恢复） */
  async closeMQ(
    input: CloseMQInput,
    context: MQContext,
    output: CloseMQOutput,
  ): Promise<boolean> {
    return this.service.closeMQ(input, context, output);
  }
}
