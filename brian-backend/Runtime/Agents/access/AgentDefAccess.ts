/**
 * @fileoverview Agents 模块接入层（Runtime v2 · 阶段3 前置）。
 */

import type { RelationDBAccess, Metrics, Report, Logger, LLMAccess } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { AgentsSchemaInitializer } from '../infrastructure/AgentsSchemaInitializer';
import { AgentDefService, type AgentDefComponents } from '../application/AgentDefService';
import {
  AgentDefContext,
  MatchAgentDefInput,
  MatchAgentDefOutput,
  SoAgentSnapshotInput,
  SoAgentSnapshotOutput,
  DeclareAgentInput,
  DeclareAgentOutput,
  SoAgentDefsInput,
  SoAgentDefsOutput,
  ConfigAgentDefInput,
  ConfigAgentDefOutput,
} from '../domain/types';

/**
 * AgentDefAccess。
 */
export class AgentDefAccess {
  private readonly service: AgentDefService;

  constructor(relationDb: RelationDBAccess, llm: LLMAccess, components: AgentDefComponents, logger?: Logger) {
    new AgentsSchemaInitializer(relationDb).init();
    const rawService = new AgentDefService(relationDb, llm, components, logger);
    this.service = AopProxy.wrap(rawService, { logger }) as AgentDefService;
  }

  /** 初始化组件 */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 确定性匹配（exact → signature → llm → 构建） */
  async matchAgentDef(input: MatchAgentDefInput, output: MatchAgentDefOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.matchAgentDef(input, output, context, metrics, report);
  }

  /** 组装会话级快照（组件按任务重解析） */
  async soAgentSnapshot(input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soAgentSnapshot(input, output, context, metrics, report);
  }

  /** 声明式定义 upsert（幂等 by name） */
  async declareAgent(input: DeclareAgentInput, output: DeclareAgentOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.declareAgent(input, output, context, metrics, report);
  }

  /** 查询定义列表 */
  async soAgentDefs(input: SoAgentDefsInput, output: SoAgentDefsOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soAgentDefs(input, output, context, metrics, report);
  }

  /** 模块配置 */
  async configAgentDef(input: ConfigAgentDefInput, output: ConfigAgentDefOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configAgentDef(input, output, context, metrics, report);
  }
}
