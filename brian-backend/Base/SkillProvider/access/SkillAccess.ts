/**
 * @fileoverview SkillProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 SkillSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { SkillSchemaInitializer } from '../infrastructure/SkillSchemaInitializer';
import { SkillService } from '../application/SkillService';
import { IsolatedVMSandbox } from '../infrastructure/sandbox/IsolatedVMSandbox';
import type { ISandbox } from '../infrastructure/sandbox/ISandbox';
import {
  SkillContext,
  AddSkillInput,
  AddSkillOutput,
  GetSkillInput,
  GetSkillOutput,
  UpdateSkillInput,
  UpdateSkillOutput,
  DelSkillInput,
  DelSkillOutput,
  SoSkillInput,
  SoSkillOutput,
  ExecSkillInput,
  ExecSkillOutput,
  EnableSkillInput,
  EnableSkillOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

/**
 * SkillProvider 接入层。
 *
 * 作为 Skill 的唯一操作入口，上层通过本类访问 Skill 数据。
 *
 * 用法示例：
 * ```typescript
 * const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await relationDb.initialize();
 *
 * const skillAccess = new SkillAccess(relationDb);
 * await skillAccess.initialize();
 *
 * const output = new AddSkillOutput();
 * await skillAccess.addSkill(
 *   { data: { skill_brief: '天气查询', work: 'result = params.city' } },
 *   new SkillContext(),
 *   output,
 * );
 * ```
 */
export class SkillAccess {
  private readonly service: SkillService;
  private readonly sandbox: ISandbox;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param logger 可选日志记录器
   */
  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    // 初始化表结构
    new SkillSchemaInitializer(relationDb).init();
    // 创建沙箱实例（自动检测平台，优先使用 isolated-vm，不可用时降级为 vm）
    this.sandbox = new IsolatedVMSandbox();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new SkillService(relationDb, this.sandbox);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /**
   * 初始化组件：写入默认配置并恢复 enabled 状态。
   */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 新增 Skill */
  async addSkill(
    input: AddSkillInput,
    context: SkillContext,
    output: AddSkillOutput,
  ): Promise<boolean> {
    return this.service.addSkill(input, context, output);
  }

  /** 获取 Skill */
  async getSkill(
    input: GetSkillInput,
    context: SkillContext,
    output: GetSkillOutput,
  ): Promise<boolean> {
    return this.service.getSkill(input, context, output);
  }

  /** 更新 Skill */
  async updateSkill(
    input: UpdateSkillInput,
    context: SkillContext,
    output: UpdateSkillOutput,
  ): Promise<boolean> {
    return this.service.updateSkill(input, context, output);
  }

  /** 删除 Skill */
  async delSkill(
    input: DelSkillInput,
    context: SkillContext,
    output: DelSkillOutput,
  ): Promise<boolean> {
    return this.service.delSkill(input, context, output);
  }

  /** 搜索 Skill */
  async soSkill(
    input: SoSkillInput,
    context: SkillContext,
    output: SoSkillOutput,
  ): Promise<boolean> {
    return this.service.soSkill(input, context, output);
  }

  /** 执行 Skill（沙箱执行） */
  async execSkill(
    input: ExecSkillInput,
    context: SkillContext,
    output: ExecSkillOutput,
  ): Promise<boolean> {
    return this.service.execSkill(input, context, output);
  }

  /** 启用/禁用 Skill 组件 */
  async enableSkill(
    input: EnableSkillInput,
    context: SkillContext,
    output: EnableSkillOutput,
  ): Promise<boolean> {
    return this.service.enableSkill(input, context, output);
  }
}
