import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import type { WriterAgentAccess, EvolutorAgentAccess } from '@brian-agent/agent';
import { UserProfileSchemaInitializer } from '../infrastructure/UserProfileSchemaInitializer';
import { UserProfileService } from '../application/UserProfileService';
import {
  UserProfileContext,
  ConfigProfileDirectionInput, ConfigProfileDirectionOutput,
  DeleteProfileDirectionInput, DeleteProfileDirectionOutput,
  GetProfileDirectionInput, GetProfileDirectionOutput,
  GetUserProfileInput, GetUserProfileOutput,
  GenerateProfileInput, GenerateProfileOutput,
  SaveUserPreferenceInput, SaveUserPreferenceOutput,
  GetProfileHistoryInput, GetProfileHistoryOutput,
  GetProfileByVersionInput, GetProfileByVersionOutput,
  GetAllProfilesInput, GetAllProfilesOutput,
  ResetUserProfileInput, ResetUserProfileOutput,
  ConfigUserProfileInput, ConfigUserProfileOutput,
} from '../domain/types';

export class UserProfileAccess {
  private readonly service: UserProfileService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    writerAgent: WriterAgentAccess,
    evolutorAgent: EvolutorAgentAccess,
    infoCore: InfoCoreAccess,
    llmCore: LLMCoreAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    this.initPromise = new UserProfileSchemaInitializer(relationDb).init();
    const raw = new UserProfileService(
      relationDb, writerAgent, evolutorAgent, infoCore, llmCore, llmAccess, promptsAccess, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  
  async startAutoGeneration(): Promise<void> {
    await this.initPromise;
    await (this.service as unknown as { startAutoGeneration(): void }).startAutoGeneration();
  }

  
  async stopAutoGeneration(): Promise<void> {
    await this.initPromise;
    (this.service as unknown as { stopAutoGeneration(): void }).stopAutoGeneration();
  }

  async configProfileDirection(i: ConfigProfileDirectionInput, o: ConfigProfileDirectionOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configProfileDirection(i, o, c, metrics, report);
  }

  async deleteProfileDirection(i: DeleteProfileDirectionInput, o: DeleteProfileDirectionOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.deleteProfileDirection(i, o, c, metrics, report);
  }

  async soProfileDirection(i: GetProfileDirectionInput, o: GetProfileDirectionOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soProfileDirection(i, o, c, metrics, report);
  }

  async soUserProfile(i: GetUserProfileInput, o: GetUserProfileOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soUserProfile(i, o, c, metrics, report);
  }

  async generateProfile(i: GenerateProfileInput, o: GenerateProfileOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.generateProfile(i, o, c, metrics, report);
  }

  async saveUserPreference(i: SaveUserPreferenceInput, o: SaveUserPreferenceOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.saveUserPreference(i, o, c, metrics, report);
  }

  async soProfileHistory(i: GetProfileHistoryInput, o: GetProfileHistoryOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soProfileHistory(i, o, c, metrics, report);
  }

  async soProfileByVersion(i: GetProfileByVersionInput, o: GetProfileByVersionOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soProfileByVersion(i, o, c, metrics, report);
  }

  async soAllProfiles(i: GetAllProfilesInput, o: GetAllProfilesOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soAllProfiles(i, o, c, metrics, report);
  }

  async resetUserProfile(i: ResetUserProfileInput, o: ResetUserProfileOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.resetUserProfile(i, o, c, metrics, report);
  }

  async configUserProfile(i: ConfigUserProfileInput, o: ConfigUserProfileOutput, c: UserProfileContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configUserProfile(i, o, c, metrics, report);
  }
}
