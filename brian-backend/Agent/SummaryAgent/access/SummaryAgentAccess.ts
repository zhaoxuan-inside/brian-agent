import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, SoulAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import { SummaryAgentService } from '../application/SummaryAgentService';
import {
  SummaryAgentContext,
  GenerateSummaryInput, GenerateSummaryOutput,
} from '../domain/types';

export class SummaryAgentAccess {
  private readonly service: SummaryAgentService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    soulAccess: SoulAccess,
    agentBuilder: AgentBuilderAccess,
    agentLibrary: AgentLibraryAccess,
    infoCore: InfoCoreAccess,
    llmCore?: LLMCoreAccess,
    logger?: Logger,
  ) {
    const raw = new SummaryAgentService(
      relationDb, llmAccess, promptsAccess, soulAccess, agentBuilder, agentLibrary, infoCore, llmCore, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
    // 初始化：确保内置摘要 Soul / 系统 Agent 就绪（幂等，失败仅告警不阻断启动）
    this.initPromise = raw.initialize(new SummaryAgentContext());
  }

  /**
   * 初始化：确保内置摘要 Soul / 系统 Agent 就绪（幂等，失败仅告警不阻断启动）。
   */
  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async ensureBuiltin(ctx: SummaryAgentContext): Promise<boolean> {
    await this.initPromise;
    return this.service.ensureBuiltin(ctx);
  }

  async generateSummary(i: GenerateSummaryInput, o: GenerateSummaryOutput, c: SummaryAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.generateSummary(i, o, c, metrics, report);
  }
}
