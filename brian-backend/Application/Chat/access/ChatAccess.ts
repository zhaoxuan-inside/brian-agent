import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, StreamAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { ChatRuntimeV2Deps } from '../application/ChatService';
import type { InfoCoreAccess } from '@brian-agent/core';
import { ChatSchemaInitializer } from '../infrastructure/ChatSchemaInitializer';
import { ChatService } from '../application/ChatService';
import {
  ChatContext,
  CreateSessionInput, CreateSessionOutput,
  DeleteSessionInput, DeleteSessionOutput,
  SearchSessionInput, SearchSessionOutput,
  GetSessionDetailInput, GetSessionDetailOutput,
  UpdateSessionTitleInput, UpdateSessionTitleOutput,
  CheckSessionOverflowInput, CheckSessionOverflowOutput,
  GetChatHistoryInput, GetChatHistoryOutput,
  SearchMessageInput, SearchMessageOutput,
  PinMessageInput, PinMessageOutput,
  GetMessageGraphInput, GetMessageGraphOutput,
  ConfigChatInput, ConfigChatOutput,
  OpenChatStreamInput, OpenChatStreamOutput,
  SSEEvent,
} from '../domain/types';

export class ChatAccess {
  private readonly service: ChatService;

  constructor(
    relationDb: RelationDBAccess,
    infoCore: InfoCoreAccess,
    logger?: Logger,
    streamAccess?: StreamAccess,
    runtime?: ChatRuntimeV2Deps,
  ) {
    new ChatSchemaInitializer(relationDb).init();
    const raw = new ChatService(relationDb, infoCore, logger, streamAccess, runtime);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async createSession(i: CreateSessionInput, o: CreateSessionOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.createSession(i, o, c, metrics, report);
  }

  async deleteSession(i: DeleteSessionInput, o: DeleteSessionOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.deleteSession(i, o, c, metrics, report);
  }

  async soSession(i: SearchSessionInput, o: SearchSessionOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSession(i, o, c, metrics, report);
  }

  async soSessionDetail(i: GetSessionDetailInput, o: GetSessionDetailOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSessionDetail(i, o, c, metrics, report);
  }

  async updateSessionTitle(i: UpdateSessionTitleInput, o: UpdateSessionTitleOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateSessionTitle(i, o, c, metrics, report);
  }

  async checkSessionOverflow(i: CheckSessionOverflowInput, o: CheckSessionOverflowOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.checkSessionOverflow(i, o, c, metrics, report);
  }

  async soChatHistory(i: GetChatHistoryInput, o: GetChatHistoryOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soChatHistory(i, o, c, metrics, report);
  }

  async soMessage(i: SearchMessageInput, o: SearchMessageOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMessage(i, o, c, metrics, report);
  }

  async pinMessage(i: PinMessageInput, o: PinMessageOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.pinMessage(i, o, c, metrics, report);
  }

  async soMessageGraph(i: GetMessageGraphInput, o: GetMessageGraphOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMessageGraph(i, o, c, metrics, report);
  }

  async openChatStream(
    i: OpenChatStreamInput, o: OpenChatStreamOutput, c: ChatContext,
    metrics?: Metrics, report?: Report,
    onEvent?: (event: SSEEvent) => void,
  ): Promise<boolean> {
    return this.service.openChatStream(i, o, c, metrics, report, onEvent);
  }

  async configChat(i: ConfigChatInput, o: ConfigChatOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configChat(i, o, c, metrics, report);
  }
}
