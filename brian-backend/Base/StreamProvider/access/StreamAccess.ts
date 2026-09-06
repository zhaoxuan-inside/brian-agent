/**
 * @fileoverview StreamProvider 接入层。
 *
 * 作为统一流式输出（SSE）的操作入口，封装 application 层 Service。
 * 提供标准 (Input, Context, Output) 方法及便捷推送方法。
 */

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { StreamSchemaInitializer } from '../infrastructure/StreamSchemaInitializer';
import { StreamService } from '../application/StreamService';
import {
  StreamContext,
  RegisterStreamInput,
  RegisterStreamOutput,
  PushStreamInput,
  PushStreamOutput,
  CloseStreamInput,
  CloseStreamOutput,
  GetStreamStatsOutput,
  ConfigStreamInput,
  ConfigStreamOutput,
  SSEMessageType,
  PushEventToEndpointInput, PushEventToEndpointOutput,
  ReplayEndpointEventsInput, ReplayEndpointEventsOutput,
} from '../domain/types';
import type { Logger } from '../../shared/aop/AopProxy';

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

  /** 按端点 ID 推送业务事件（保存 + 在线投递；Report 携带端点 ID 调用） */
  async publishEvent(i: PushEventToEndpointInput, o: PushEventToEndpointOutput, _c: StreamContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    return this.service.publishEvent(i, o);
  }

  /** 端点事件重放（断线恢复） */
  async replayEvents(i: ReplayEndpointEventsInput, o: ReplayEndpointEventsOutput, _c: StreamContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    return this.service.replayEvents(i, o);
  }

  async pushStream<T = unknown>(
    input: PushStreamInput<T>,
    _context: StreamContext,
    output: PushStreamOutput,
  ): Promise<boolean> {
    return this.service.pushStream(input, output);
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

  // ---------------------------------------------------------------------------
  // 业务便捷调用扩展（直通底层服务）
  // ---------------------------------------------------------------------------

  /**
   * 推送打字机文本片段（自动 2-5 字符 chunk 切片）
   */
  async pushText(
    sessionId: string,
    event: string,
    text: string,
    meta?: {
      interact_id?: string;
      work_id?: string;
      agent_id?: string;
      agent_name?: string;
      agent_type?: string;
      node_id?: string;
      task_id?: string;
      chunk_delay_ms?: number;
    },
  ): Promise<boolean> {
    const input = Object.assign(new PushStreamInput<string>(), {
      session_id: sessionId,
      event,
      msg_type: 'TEXT' as SSEMessageType,
      data: text,
      interact_id: meta?.interact_id,
      work_id: meta?.work_id,
      agent_id: meta?.agent_id,
      agent_name: meta?.agent_name,
      agent_type: meta?.agent_type,
      node_id: meta?.node_id,
      task_id: meta?.task_id,
      enable_chunking: true,
      chunk_delay_ms: meta?.chunk_delay_ms,
    });
    const output = new PushStreamOutput();
    return this.service.pushStream(input, output);
  }

  /**
   * 推送结构化事件对象（DAG事件、上下文事件、Agent规格事件、控制事件等）
   */
  async pushEvent<T = unknown>(
    sessionId: string,
    event: string,
    msgType: SSEMessageType,
    data: T,
    meta?: {
      interact_id?: string;
      work_id?: string;
      agent_id?: string;
      agent_name?: string;
      agent_type?: string;
      node_id?: string;
      task_id?: string;
    },
  ): Promise<boolean> {
    const input = Object.assign(new PushStreamInput<T>(), {
      session_id: sessionId,
      event,
      msg_type: msgType,
      data,
      interact_id: meta?.interact_id,
      work_id: meta?.work_id,
      agent_id: meta?.agent_id,
      agent_name: meta?.agent_name,
      agent_type: meta?.agent_type,
      node_id: meta?.node_id,
      task_id: meta?.task_id,
    });
    const output = new PushStreamOutput();
    return this.service.pushStream(input, output);
  }
}
