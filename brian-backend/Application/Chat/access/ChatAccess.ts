import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import type { WriterAgentAccess, EvolutorAgentAccess } from '@brian-agent/agent';
import type { OrchestrationEntryAccess } from '@brian-agent/orchestration';
import { ChatSchemaInitializer } from '../infrastructure/ChatSchemaInitializer';
import { ChatService } from '../application/ChatService';
import {
  ChatContext,
  SubmitWorkInput, SubmitWorkOutput,
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
  CancelWorkInput, CancelWorkOutput,
  ConfigChatInput, ConfigChatOutput,
  OpenChatStreamInput, OpenChatStreamOutput,
} from '../domain/types';

export class ChatAccess {
  private readonly service: ChatService;

  constructor(
    relationDb: RelationDBAccess,
    infoCore: InfoCoreAccess,
    writerAgent: WriterAgentAccess,
    evolutorAgent: EvolutorAgentAccess,
    orchestrationEntry: OrchestrationEntryAccess,
    logger?: Logger,
  ) {
    new ChatSchemaInitializer(relationDb).init();
    const raw = new ChatService(relationDb, infoCore, writerAgent, evolutorAgent, orchestrationEntry, logger);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async submitWork(
    i: SubmitWorkInput, c: ChatContext, o: SubmitWorkOutput,
  ): Promise<boolean> {
    return this.service.submitWork(i, c, o);
  }

  async createSession(
    i: CreateSessionInput, c: ChatContext, o: CreateSessionOutput,
  ): Promise<boolean> {
    return this.service.createSession(i, c, o);
  }

  async deleteSession(
    i: DeleteSessionInput, c: ChatContext, o: DeleteSessionOutput,
  ): Promise<boolean> {
    return this.service.deleteSession(i, c, o);
  }

  async searchSession(
    i: SearchSessionInput, c: ChatContext, o: SearchSessionOutput,
  ): Promise<boolean> {
    return this.service.searchSession(i, c, o);
  }

  async getSessionDetail(
    i: GetSessionDetailInput, c: ChatContext, o: GetSessionDetailOutput,
  ): Promise<boolean> {
    return this.service.getSessionDetail(i, c, o);
  }

  async updateSessionTitle(
    i: UpdateSessionTitleInput, c: ChatContext, o: UpdateSessionTitleOutput,
  ): Promise<boolean> {
    return this.service.updateSessionTitle(i, c, o);
  }

  async checkSessionOverflow(
    i: CheckSessionOverflowInput, c: ChatContext, o: CheckSessionOverflowOutput,
  ): Promise<boolean> {
    return this.service.checkSessionOverflow(i, c, o);
  }

  async getChatHistory(
    i: GetChatHistoryInput, c: ChatContext, o: GetChatHistoryOutput,
  ): Promise<boolean> {
    return this.service.getChatHistory(i, c, o);
  }

  async searchMessage(
    i: SearchMessageInput, c: ChatContext, o: SearchMessageOutput,
  ): Promise<boolean> {
    return this.service.searchMessage(i, c, o);
  }

  async pinMessage(
    i: PinMessageInput, c: ChatContext, o: PinMessageOutput,
  ): Promise<boolean> {
    return this.service.pinMessage(i, c, o);
  }

  async getMessageGraph(
    i: GetMessageGraphInput, c: ChatContext, o: GetMessageGraphOutput,
  ): Promise<boolean> {
    return this.service.getMessageGraph(i, c, o);
  }

  async cancelWork(
    i: CancelWorkInput, c: ChatContext, o: CancelWorkOutput,
  ): Promise<boolean> {
    return this.service.cancelWork(i, c, o);
  }

  async openChatStream(
    i: OpenChatStreamInput, c: ChatContext, o: OpenChatStreamOutput,
  ): Promise<boolean> {
    return this.service.openChatStream(i, c, o);
  }

  async configChat(
    i: ConfigChatInput, c: ChatContext, o: ConfigChatOutput,
  ): Promise<boolean> {
    return this.service.configChat(i, c, o);
  }
}
