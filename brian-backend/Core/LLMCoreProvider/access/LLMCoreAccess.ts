/**
 * @fileoverview LLMCoreProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 LLMCoreSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用（方法签名保持 input/output 序列化友好）。
 *
 * 上层（Core 层的 Agent 等模块）通过本类访问 LLM 匹配与配额能力。
 */

import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { LLMCoreSchemaInitializer } from '../infrastructure/LLMCoreSchemaInitializer';
import { LLMCoreService } from '../application/LLMCoreService';
import {
  LLMCoreContext,
  MatchLLMInput,
  MatchLLMOutput,
  LimitLLMInput,
  LimitLLMOutput,
  CheckLLMQuotaInput,
  CheckLLMQuotaOutput,
  ConfigLLMCoreInput,
  ConfigLLMCoreOutput,
  RecordLLMUsageInput,
  RecordLLMUsageOutput,
} from '../domain/types';

/**
 * LLMCoreProvider 接入层。
 *
 * 作为 LLM 匹配与配额管理的唯一操作入口，上层通过本类访问 LLM 核心能力。
 *
 * 用法示例：
 * ```typescript
 * const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await relationDb.initialize();
 *
 * const llmAccess = new LLMAccess(relationDb);
 * await llmAccess.initialize();
 *
 * const promptsAccess = new PromptsAccess(relationDb);
 * await promptsAccess.initialize();
 *
 * const llmCore = new LLMCoreAccess(relationDb, llmAccess, promptsAccess);
 * await llmCore.initialize();
 *
 * const output = new MatchLLMOutput();
 * await llmCore.matchLLM(
 *   { agent_id: 'xxx', context_id: 'yyy', interact_id: 'zzz' },
 *   new LLMCoreContext(),
 *   output,
 * );
 * ```
 */
export class LLMCoreAccess {
  private readonly service: LLMCoreService;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param llmAccess LLMProvider 接入层实例
   * @param promptsAccess PromptsProvider 接入层实例
   * @param logger 可选日志记录器
   */
  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    // 初始化表结构
    new LLMCoreSchemaInitializer(relationDb).init();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new LLMCoreService(relationDb, llmAccess, promptsAccess);
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
   * 为指定 Agent 匹配合适的 LLM 提供商。
   *
   * 包含缓存检查与 regen_rate 重新评估机制。
   */
  async matchLLM(
    input: MatchLLMInput,
    context: LLMCoreContext,
    output: MatchLLMOutput,
  ): Promise<boolean> {
    return this.service.matchLLM(input, context, output);
  }

  /**
   * 为指定 LLM 提供商设置配额限制（upsert）。
   */
  async limitLLM(
    input: LimitLLMInput,
    context: LLMCoreContext,
    output: LimitLLMOutput,
  ): Promise<boolean> {
    return this.service.limitLLM(input, context, output);
  }

  /**
   * 检查指定提供商的配额使用情况。
   *
   * 返回每日/每周/每月维度的限额、已用量与可用余量。
   */
  async checkLLMQuota(
    input: CheckLLMQuotaInput,
    context: LLMCoreContext,
    output: CheckLLMQuotaOutput,
  ): Promise<boolean> {
    return this.service.checkLLMQuota(input, context, output);
  }

  /**
   * 获取当前 LLMCore 配置。
   */
  async configLLMCore(
    input: ConfigLLMCoreInput,
    context: LLMCoreContext,
    output: ConfigLLMCoreOutput,
  ): Promise<boolean> {
    return this.service.configLLMCore(input, context, output);
  }

  /**
   * 记录一次 LLM 用量的使用条目供配额统计。
   */
  async recordLLMUsage(
    input: RecordLLMUsageInput,
    context: LLMCoreContext,
    output: RecordLLMUsageOutput,
  ): Promise<boolean> {
    return this.service.recordLLMUsage(input, context, output);
  }
}
