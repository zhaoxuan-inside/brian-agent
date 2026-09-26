import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
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

export class MQAccess {
  private readonly service: MQService;

  

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    
    new MQSchemaInitializer(relationDb).init();
    
    const rawService = new MQService(relationDb);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  async sendMQ(input: SendMQInput, output: SendMQOutput, context: MQContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.sendMQ(input, output, context, metrics, report);
  }

  
  async consumeMQ(input: ConsumeMQInput, output: ConsumeMQOutput, context: MQContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.consumeMQ(input, output, context, metrics, report);
  }

  
  async ackMQ(input: AckMQInput, output: AckMQOutput, context: MQContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.ackMQ(input, output, context, metrics, report);
  }

  
  async nackMQ(input: NackMQInput, output: NackMQOutput, context: MQContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.nackMQ(input, output, context, metrics, report);
  }

  
  async soQueueStats(input: GetQueueStatsInput, output: GetQueueStatsOutput, context: MQContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soQueueStats(input, output, context, metrics, report);
  }

  
  async enableMQ(input: EnableMQInput, output: EnableMQOutput, context: MQContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableMQ(input, output, context, metrics, report);
  }

  
  async closeMQ(input: CloseMQInput, output: CloseMQOutput, context: MQContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.closeMQ(input, output, context, metrics, report);
  }

  
  async cleanupExpiredMessages(): Promise<number> {
    return this.service.cleanupExpiredMessages();
  }

  
  async recoverStuckMessages(queue?: string): Promise<number> {
    return this.service.recoverStuckMessages(queue);
  }

  
  async replayMQ(messageId: string): Promise<boolean> {
    return this.service.replayMQ(messageId);
  }
}
