import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { Logger } from '../../shared/aop/AopProxy';
import { StreamSchemaInitializer } from '../infrastructure/StreamSchemaInitializer';
import { StreamService } from '../application/StreamService';
import {
  StreamContext,
  RegisterStreamInput,
  RegisterStreamOutput,
  CloseStreamInput,
  CloseStreamOutput,
  GetStreamStatsOutput,
  ConfigStreamInput,
  ConfigStreamOutput,
} from '../domain/types';
import type { TaskEvent } from '@brian-agent/shared';

/**
 * StreamAccess：SSE 传输门面（ADR-013 瘦身后）。
 * 只负责 连接注册/心跳/写帧/关闭 —— 落库与状态归 Observability 总线。
 */
export class StreamAccess {
  private readonly service: StreamService;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    new StreamSchemaInitializer(relationDb).init();
    this.service = new StreamService(relationDb, logger);
  }

  async registerStream(input: RegisterStreamInput, output: RegisterStreamOutput, _context: StreamContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    return this.service.registerStream(input, output);
  }

  async closeStream(input: CloseStreamInput, output: CloseStreamOutput, _context: StreamContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    return this.service.closeStream(input, output);
  }

  async soStreamStats(
    _context: StreamContext,
    output: GetStreamStatsOutput,
  ): Promise<boolean> {
    return this.service.soStreamStats(output);
  }

  async configStream(input: ConfigStreamInput, output: ConfigStreamOutput, _context: StreamContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    return this.service.configStream(input, output);
  }

  /** 观测总线传输通道：endpoint → 会话定位后直写 TaskEvent 帧（不落库） */
  pushFrame(sessionId: string, endpointId: string, ev: TaskEvent): boolean {
    return this.service.pushEventFrame(sessionId, endpointId, ev);
  }
}

import type { Metrics } from '../../shared/base/Metrics';
import type { Report } from '../../shared/base/Report';
