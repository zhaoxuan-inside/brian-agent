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
  ConfigSessionInput,
  ConfigSessionOutput,
} from '../domain/types';

export class SessionAccess {
  private readonly service: SessionService;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    new SessionSchemaInitializer(relationDb).init();
    const rawService = new SessionService(relationDb, logger);
    this.service = AopProxy.wrap(rawService, { logger }) as SessionService;
  }

  
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  async addSession(input: AddSessionInput, output: AddSessionOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addSession(input, output, context, metrics, report);
  }

  
  async addMessage(input: AddMessageInput, output: AddMessageOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addMessage(input, output, context, metrics, report);
  }

  
  async addPart(input: AddPartInput, output: AddPartOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addPart(input, output, context, metrics, report);
  }

  
  async updatePart(input: UpdatePartInput, output: UpdatePartOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updatePart(input, output, context, metrics, report);
  }

  
  async soMessages(input: SoMessagesInput, output: SoMessagesOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMessages(input, output, context, metrics, report);
  }

  
  async configSession(input: ConfigSessionInput, output: ConfigSessionOutput, context: SessionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configSession(input, output, context, metrics, report);
  }
}
