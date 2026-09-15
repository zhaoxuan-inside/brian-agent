/**
 * @fileoverview LogProvider 接入层。
 *
 * 作为日志的唯一操作入口，封装 application 层 Service，
 * 通过 AOP 代理注入切面能力。
 *
 * 同时暴露 getRawService() 供 LogInterceptor 使用，
 * 避免 AOP 代理与日志切面之间产生递归调用。
 */

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { SQLiteRelationDBOptions } from '../../RelationDBProvider/infrastructure/SQLiteRelationDBRepository';
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
  ConfigLogInput,
  ConfigLogOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

export class LogAccess {
  /** 原始 Service（未经 AOP 包装），供 LogInterceptor 使用 */
  private readonly rawService: LogService;
  /** AOP 包装后的 Service */
  private readonly service: LogService;

  /** 专用于日志的 RelationDB 实例 */
  private readonly relationDb: RelationDBAccess;

  // ===== 修改后的构造函数 =====
  constructor(
    relationDbOrOptions?: RelationDBAccess | SQLiteRelationDBOptions | string,
    logger?: Logger,
  ) {
    if (relationDbOrOptions && typeof relationDbOrOptions === 'object' && 'executeRaw' in relationDbOrOptions) {
      this.relationDb = relationDbOrOptions as RelationDBAccess;
    } else if (typeof relationDbOrOptions === 'string') {
      this.relationDb = new RelationDBAccess({ dbPath: relationDbOrOptions, wal: true, autoCreateConfigTable: true });
    } else if (relationDbOrOptions && typeof relationDbOrOptions === 'object') {
      this.relationDb = new RelationDBAccess(relationDbOrOptions as SQLiteRelationDBOptions);
    } else {
      this.relationDb = new RelationDBAccess({ dbPath: './data/brian_log.db', wal: true, autoCreateConfigTable: true });
    }

    new LogSchemaInitializer(this.relationDb).init();
    this.rawService = new LogService(this.relationDb);
    this.service = AopProxy.wrap(this.rawService, { logger });
  }

  /** 获取日志模块底层的 RelationDBAccess 实例 */
  getRelationDb(): RelationDBAccess {
    return this.relationDb;
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

  async addLog(i: AddLogInput, o: AddLogOutput, c: LogContext, metrics?: Metrics, report?: Report) {
    return this.service.addLog(i, o, c, metrics, report);
  }
  async soLogById(i: GetLogInput, o: GetLogOutput, c: LogContext, metrics?: Metrics, report?: Report) {
    return this.service.soLogById(i, o, c, metrics, report);
  }
  async soLog(i: SoLogInput, o: SoLogOutput, c: LogContext, metrics?: Metrics, report?: Report) {
    return this.service.soLog(i, o, c, metrics, report);
  }
  async delLog(i: DelLogInput, o: DelLogOutput, c: LogContext, metrics?: Metrics, report?: Report) {
    return this.service.delLog(i, o, c, metrics, report);
  }
  async countLog(i: CountLogInput, o: CountLogOutput, c: LogContext, metrics?: Metrics, report?: Report) {
    return this.service.countLog(i, o, c, metrics, report);
  }
  async visualizedLog(i: VisualizedLogInput, o: VisualizedLogOutput, c: LogContext, metrics?: Metrics, report?: Report) {
    return this.service.visualizedLog(i, o, c, metrics, report);
  }
  async enableLog(i: EnableLogInput, o: EnableLogOutput, c: LogContext, metrics?: Metrics, report?: Report) {
    return this.service.enableLog(i, o, c, metrics, report);
  }
  async configLog(i: ConfigLogInput, o: ConfigLogOutput, c: LogContext, metrics?: Metrics, report?: Report) {
    return this.service.configLog(i, o, c, metrics, report);
  }
  async queryLogs(options: {
    level?: string; source?: string; keyword?: string;
    trace_id?: string; work_id?: string; run_id?: string;
    log_source?: string;
    start_time?: number; end_time?: number;
    page?: number; pageSize?: number;
  }) {
    return this.service.queryLogs(options);
  }
  async soLogStats(options?: { start_time?: number; end_time?: number }) {
    return this.service.soLogStats(options);
  }
  async listSources() {
    return this.service.listSources();
  }
}
