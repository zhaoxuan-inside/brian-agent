/**
 * @fileoverview SkillCoreProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 SkillCoreSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用。
 */

import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess } from '@brian-agent/base';
import type { SkillAccess } from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import type { PromptsAccess } from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { SkillCoreSchemaInitializer } from '../infrastructure/SkillCoreSchemaInitializer';
import { SkillCoreService } from '../application/SkillCoreService';
import {
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
  OptSkillInput,
  OptSkillOutput,
  AgeSkillInput,
  AgeSkillOutput,
  SoSkillRuleInput,
  SoSkillRuleOutput,
  UpdateSkillRuleInput,
  UpdateSkillRuleOutput,
  ConfigSkillCoreInput,
  ConfigSkillCoreOutput,
} from '../domain/types';

/**
 * SkillCoreProvider 接入层。
 *
 * 作为 Skill 匹配、自动绑定与老化的唯一操作入口，
 * 上层通过本类访问 SkillCore 业务能力。
 *
 * 用法示例：
 * ```typescript
 * const skillCore = new SkillCoreAccess(
 *   relationDb, skillAccess, llmAccess, promptsAccess,
 * );
 *
 * const output = new MatchSkillOutput();
 * await skillCore.matchSkill(
 *   { agent_id: '...', context_id: '...', run_id: '...' },
 *   output, new SkillCoreContext(),
 * );
 * ```
 */
export class SkillCoreAccess {
  private readonly service: SkillCoreService;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param skillAccess SkillProvider 接入层实例
   * @param llmAccess LLMProvider 接入层实例
   * @param promptsAccess PromptsProvider 接入层实例
   * @param logger 可选日志记录器
   */
  constructor(
    relationDb: RelationDBAccess,
    skillAccess: SkillAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    // 初始化表结构
    new SkillCoreSchemaInitializer(relationDb).init();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new SkillCoreService(
      relationDb,
      skillAccess,
      llmAccess,
      promptsAccess,
    );
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /** 匹配 Skill（带缓存与 LLM 排序） */
  async matchSkill(input: MatchSkillInput, output: MatchSkillOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.matchSkill(input, output, context, metrics, report);
  }

  /** 自动绑定 Skill 并记录使用 */
  async optSkill(input: OptSkillInput, output: OptSkillOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.optSkill(input, output, context, metrics, report);
  }

  /** 年龄化过期 Skill */
  async ageSkill(input: AgeSkillInput, output: AgeSkillOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.ageSkill(input, output, context, metrics, report);
  }

  /** 查询 Skill 优化规则 */
  async soSkillRule(input: SoSkillRuleInput, output: SoSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSkillRule(input, output, context, metrics, report);
  }

  /** 批量更新 Skill 优化规则 */
  async updateSkillRule(input: UpdateSkillRuleInput, output: UpdateSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateSkillRule(input, output, context, metrics, report);
  }

  /** 返回 skill_core_config 配置 */
  async configSkillCore(input: ConfigSkillCoreInput, output: ConfigSkillCoreOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configSkillCore(input, output, context, metrics, report);
  }
}
