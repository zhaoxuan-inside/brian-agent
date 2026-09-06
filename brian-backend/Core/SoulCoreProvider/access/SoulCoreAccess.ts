/**
 * @fileoverview SoulCoreProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 SoulCoreSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用。
 *
 * 上层（Core 层的 Agent 等模块）通过本类访问 Soul 匹配与老化能力。
 */

import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess } from '@brian-agent/base';
import type { SoulAccess } from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import type { PromptsAccess } from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { SoulCoreSchemaInitializer } from '../infrastructure/SoulCoreSchemaInitializer';
import { SoulCoreService } from '../application/SoulCoreService';
import {
  SoulCoreContext,
  MatchSoulInput,
  MatchSoulOutput,
  OptSoulInput,
  OptSoulOutput,
  AgeSoulInput,
  AgeSoulOutput,
  SoSoulContentInput,
  SoSoulContentOutput,
  SoSoulRuleInput,
  SoSoulRuleOutput,
  UpdateSoulRuleInput,
  UpdateSoulRuleOutput,
  ConfigSoulCoreInput,
  ConfigSoulCoreOutput,
} from '../domain/types';

/**
 * SoulCoreProvider 接入层。
 *
 * 作为 Soul 匹配、自动生成、比较优化与老化的唯一操作入口，
 * 上层通过本类访问 SoulCore 业务能力。
 *
 * 用法示例：
 * ```typescript
 * const soulCore = new SoulCoreAccess(
 *   relationDb, soulAccess, llmAccess, promptsAccess,
 * );
 * await soulCore.initialize();
 *
 * const output = new MatchSoulOutput();
 * await soulCore.matchSoul(
 *   { agent_id: '...', context_id: '...', interact_id: '...' },
 *   output, new SoulCoreContext(),
 * );
 * ```
 */
export class SoulCoreAccess {
  private readonly service: SoulCoreService;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param soulAccess SoulProvider 接入层实例
   * @param llmAccess LLMProvider 接入层实例
   * @param promptsAccess PromptsProvider 接入层实例
   * @param logger 可选日志记录器
   */
  constructor(
    relationDb: RelationDBAccess,
    soulAccess: SoulAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    // 初始化表结构
    new SoulCoreSchemaInitializer(relationDb).init();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new SoulCoreService(
      relationDb,
      soulAccess,
      llmAccess,
      promptsAccess,
    );
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /**
   * 初始化组件：写入默认配置。
   *
   * 必须在首次使用前调用。
   */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /**
   * 为指定 Agent 匹配 Soul（含缓存与 LLM 排名）。
   *
   * 若无可用 Soul，将调用 LLM 自生成并持久化。
   */
  async matchSoul(input: MatchSoulInput, output: MatchSoulOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.matchSoul(input, output, context, metrics, report);
  }

  /**
   * 比较优化：候选 Soul vs 当前绑定 Soul（A vs B 裁决）。
   *
   * 若候选更好则替换绑定；记录使用到 soul_core_usage 与 Base 层 soul_usage。
   */
  async optSoul(input: OptSoulInput, output: OptSoulOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.optSoul(input, output, context, metrics, report);
  }

  /**
   * 依据 soul_opt_rule 规则老化不活跃的 Soul（禁用）。
   */
  async ageSoul(input: AgeSoulInput, output: AgeSoulOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.ageSoul(input, output, context, metrics, report);
  }

  /**
   * 查询 Soul 优化规则。
   */
  async soSoulRule(input: SoSoulRuleInput, output: SoSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSoulRule(input, output, context, metrics, report);
  }

  /**
   * 批量更新 Soul 优化规则（事务）。
   */
  async updateSoulRule(input: UpdateSoulRuleInput, output: UpdateSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateSoulRule(input, output, context, metrics, report);
  }

  /**
   * 按 id 读取 Soul 内容（聚合查询；供声明式 Agent 快照等场景，替代跨模块直查 soul 表）。
   */
  async soSoulContent(input: SoSoulContentInput, output: SoSoulContentOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSoulContent(input, output, context, metrics, report);
  }

  /**
   * 获取当前 SoulCore 配置。
   */
  async configSoulCore(input: ConfigSoulCoreInput, output: ConfigSoulCoreOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configSoulCore(input, output, context, metrics, report);
  }
}
