import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import { WriterAgentSchemaInitializer } from '../infrastructure/WriterAgentSchemaInitializer';
import { WriterAgentService } from '../application/WriterAgentService';
import {
  WriterAgentContext,
  WriteInput, WriteOutput,
  SaveUserProfileInput, SaveUserProfileOutput,
  GetUserProfileInput, GetUserProfileOutput,
  ConfigWriterAgentInput, ConfigWriterAgentOutput,
} from '../domain/types';

export class WriterAgentAccess {
  private readonly service: WriterAgentService;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    infoCore: InfoCoreAccess,
    agentBuilder: AgentBuilderAccess,
    agentLibrary: AgentLibraryAccess,
    logger?: Logger,
  ) {
    new WriterAgentSchemaInitializer(relationDb).init();
    const raw = new WriterAgentService(relationDb, llmAccess, promptsAccess, infoCore, agentBuilder, agentLibrary);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async write(i: WriteInput, c: WriterAgentContext, o: WriteOutput) { return this.service.write(i, c, o); }
  async saveUserProfile(i: SaveUserProfileInput, c: WriterAgentContext, o: SaveUserProfileOutput) { return this.service.saveUserProfile(i, c, o); }
  async getUserProfile(i: GetUserProfileInput, c: WriterAgentContext, o: GetUserProfileOutput) { return this.service.getUserProfile(i, c, o); }
  async configWriterAgent(i: ConfigWriterAgentInput, c: WriterAgentContext, o: ConfigWriterAgentOutput) { return this.service.configWriterAgent(i, c, o); }
}
