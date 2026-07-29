import type { RelationDBAccess, LLMAccess, PromptsAccess, SoulAccess, Logger } from '@brian-agent/base';
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
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    infoCore: InfoCoreAccess,
    agentBuilder: AgentBuilderAccess,
    agentLibrary: AgentLibraryAccess,
    soulAccess?: SoulAccess,
    logger?: Logger,
  ) {
    this.initPromise = new WriterAgentSchemaInitializer(relationDb).init();
    const raw = new WriterAgentService(
      relationDb, llmAccess, promptsAccess, infoCore, agentBuilder, agentLibrary, soulAccess,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async write(i: WriteInput, c: WriterAgentContext, o: WriteOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.write(i, c, o);
  }

  async saveUserProfile(
    i: SaveUserProfileInput, c: WriterAgentContext, o: SaveUserProfileOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.saveUserProfile(i, c, o);
  }

  async getUserProfile(
    i: GetUserProfileInput, c: WriterAgentContext, o: GetUserProfileOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getUserProfile(i, c, o);
  }

  async configWriterAgent(
    i: ConfigWriterAgentInput, c: WriterAgentContext, o: ConfigWriterAgentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configWriterAgent(i, c, o);
  }
}