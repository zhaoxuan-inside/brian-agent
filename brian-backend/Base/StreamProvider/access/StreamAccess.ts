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

  
  async publishEvent(i: PushEventToEndpointInput, o: PushEventToEndpointOutput, _c: StreamContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    return this.service.publishEvent(i, o);
  }

  
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

  
  
  

  

  async pushText(
    sessionId: string,
    event: string,
    text: string,
    meta?: {
      run_id?: string;
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
      run_id: meta?.run_id,
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

  

  async pushEvent<T = unknown>(
    sessionId: string,
    event: string,
    msgType: SSEMessageType,
    data: T,
    meta?: {
      run_id?: string;
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
      run_id: meta?.run_id,
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
