/**
 * @fileoverview LogProvider 接入层。
 *
 * 作为日志的唯一操作入口，封装 application 层 Service，
 * 通过 AOP 代理注入切面能力。
 *
 * 同时暴露 getRawService() 供 LogInterceptor 使用，
 * 避免 AOP 代理与日志切面之间产生递归调用。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { LogSchemaInitializer } from '../infrastructure/LogSchemaInitializer';
import { LogService } from '../application/LogService';
import {
  LogContext,
  AddLogInput,
  AddLogOutput,
  GetLogInput,
  GetLogOutput,
  SoLogInput,
  SoLogOutput,
  DelLogInput,
  DelLogOutput,
  CountLogInput,
  CountLogOutput,
  VisualizedLogInput,
  VisualizedLogOutput,
  EnableLogInput,
  EnableLogOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

export class LogAccess {
  /** 原始 Service（未经 AOP 包装），供 LogInterceptor 使用 */
  private readonly rawService: LogService;
  /** AOP 包装后的 Service */
  private readonly service: LogService;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    new LogSchemaInitializer(relationDb).init();
    this.rawService = new LogService(relationDb);
    this.service = AopProxy.wrap(this.rawService, { logger });
  }

  /** 初始化组件 */
  async initialize(): Promise<void> {
    await this.rawService.initialize();
  }

  /**
   * 获取原始 Service（未经 AOP 包装）。
   *
   * 供 LogInterceptor 使用，避免 AOP 代理与日志切面之间产生递归调用。
   */
  getRawService(): LogService {
    return this.rawService;
  }

  async addLog(i: AddLogInput, c: LogContext, o: AddLogOutput) {
    return this.service.addLog(i, c, o);
  }
  async getLog(i: GetLogInput, c: LogContext, o: GetLogOutput) {
    return this.service.getLog(i, c, o);
  }
  async soLog(i: SoLogInput, c: LogContext, o: SoLogOutput) {
    return this.service.soLog(i, c, o);
  }
  async delLog(i: DelLogInput, c: LogContext, o: DelLogOutput) {
    return this.service.delLog(i, c, o);
  }
  async countLog(i: CountLogInput, c: LogContext, o: CountLogOutput) {
    return this.service.countLog(i, c, o);
  }
  async visualizedLog(i: VisualizedLogInput, c: LogContext, o: VisualizedLogOutput) {
    return this.service.visualizedLog(i, c, o);
  }
  async enableLog(i: EnableLogInput, c: LogContext, o: EnableLogOutput) {
    return this.service.enableLog(i, c, o);
  }
  async queryLogs(options: {
    level?: string; source?: string; keyword?: string;
    start_time?: number; end_time?: number;
    page?: number; pageSize?: number;
  }) {
    return this.service.queryLogs(options);
  }
  async getLogStats(options?: { start_time?: number; end_time?: number }) {
    return this.service.getLogStats(options);
  }
}
