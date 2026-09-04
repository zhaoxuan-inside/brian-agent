/**
 * @fileoverview Session 模块接入层（Runtime v2 · 阶段1）。
 *
 * 职责（Session-PRD §3）：
 * 1. 初始化表结构（SessionSchemaInitializer）；
 * 2. 经 AopProxy.wrap 封装 SessionService，注入日志与耗时切面；
 * 3. 提供 5 参签名（Input, Output, Context, Metrics?, Report?）调用入口。
 */

import type { RelationDBAccess, Metrics, Report, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { SessionSchemaInitializer } from '../infrastructure/SessionSchemaInitializer';
import { SessionService } from '../application/SessionService';
import {
  SessionContext,
  AddSessionInput,
  AddSessionOutput,
  AddMessageInput,
  AddMessageOutput,
  AddPartInput,
  AddPartOutput,
  UpdatePartInput,
  UpdatePartOutput,
  SoMessagesInput,
  SoMessagesOutput,
  EnsureRunStateInput,
  EnsureRunStateOutput,
  ReleaseRunStateInput,
  ReleaseRunStateOutput,
  ConfigSessionInput,
  ConfigSessionOutput,
} from '../domain/types';

/**
 * SessionAccess。
 */
export class SessionAccess {
  private readonly service: SessionService;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    new SessionSchemaInitializer(relationDb).init();
    const rawService = new SessionService(relationDb, logger);
    this.service = AopProxy.wrap(rawService, { logger }) as SessionService;
  }

  /** 初始化组件 */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 新增会话（幂等） */
  async addSession(input: AddSessionInput, output: AddSessionOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addSession(input, output, context, metrics, report);
  }

  /** 新增消息 */
  async addMessage(input: AddMessageInput, output: AddMessageOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addMessage(input, output, context, metrics, report);
  }

  /** 新增 Part */
  async addPart(input: AddPartInput, output: AddPartOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addPart(input, output, context, metrics, report);
  }

  /** 更新 Part */
  async updatePart(input: UpdatePartInput, output: UpdatePartOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updatePart(input, output, context, metrics, report);
  }

  /** 追加 Part 内容（delta 语义） */
  async appendPartContent(input: UpdatePartInput, output: UpdatePartOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.appendPartContent(input, output, context, metrics, report);
  }

  /** 查询消息（含 Parts） */
  async soMessages(input: SoMessagesInput, output: SoMessagesOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMessages(input, output, context, metrics, report);
  }

  /** 会话忙锁获取 */
  async ensureRunState(input: EnsureRunStateInput, output: EnsureRunStateOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.ensureRunState(input, output, context, metrics, report);
  }

  /** 会话忙锁释放（幂等） */
  async releaseRunState(input: ReleaseRunStateInput, output: ReleaseRunStateOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.releaseRunState(input, output, context, metrics, report);
  }

  /** 模块配置 */
  async configSession(input: ConfigSessionInput, output: ConfigSessionOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configSession(input, output, context, metrics, report);
  }
}
