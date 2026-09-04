/**
 * @fileoverview Bus 模块接入层（Runtime v2 · 阶段1）。
 *
 * 职责（Bus-PRD §3）：
 * 1. 初始化表结构（BusSchemaInitializer）；
 * 2. 经 AopProxy.wrap 封装 EventBusService，注入日志与耗时切面；
 * 3. 提供 5 参签名（Input, Output, Context, Metrics?, Report?）调用入口。
 */

import type { RelationDBAccess, Metrics, Report, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { BusSchemaInitializer } from '../infrastructure/BusSchemaInitializer';
import { EventBusService } from '../application/EventBusService';
import {
  EventBusContext,
  PublishEventInput,
  PublishEventOutput,
  SoEventReplayInput,
  SoEventReplayOutput,
  RegisterProjectionInput,
  RegisterProjectionOutput,
  UnregisterProjectionInput,
  UnregisterProjectionOutput,
  ConfigBusInput,
  ConfigBusOutput,
} from '../domain/types';

/**
 * EventBusAccess。
 */
export class EventBusAccess {
  private readonly service: EventBusService;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    new BusSchemaInitializer(relationDb).init();
    const rawService = new EventBusService(relationDb, logger);
    this.service = AopProxy.wrap(rawService, { logger }) as EventBusService;
  }

  /** 初始化组件 */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 发布持久化事件（副作用唯一出口） */
  async publishEvent(input: PublishEventInput, output: PublishEventOutput, context: EventBusContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.publishEvent(input, output, context, metrics, report);
  }

  /** 重放查询（after_seq 之后按 seq 升序） */
  async soEventReplay(input: SoEventReplayInput, output: SoEventReplayOutput, context: EventBusContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soEventReplay(input, output, context, metrics, report);
  }

  /** 注册投影（durable：重放 → 直播无缝尾随） */
  async registerProjection(input: RegisterProjectionInput, output: RegisterProjectionOutput, context: EventBusContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.registerProjection(input, output, context, metrics, report);
  }

  /** 释放投影订阅（幂等） */
  async unregisterProjection(input: UnregisterProjectionInput, output: UnregisterProjectionOutput, context: EventBusContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.unregisterProjection(input, output, context, metrics, report);
  }

  /** 模块配置 */
  async configBus(input: ConfigBusInput, output: ConfigBusOutput, context: EventBusContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configBus(input, output, context, metrics, report);
  }
}
