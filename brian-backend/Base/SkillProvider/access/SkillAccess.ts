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

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
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
 *   output, new SkillContext(),
 * );
 * ```
 */
export class SkillAccess {
  private readonly service: SkillService;
  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param logger 可选日志记录器
   */
  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    // 初始化表结构
    new SkillSchemaInitializer(relationDb).init();
    // 创建沙箱实例：IsolatedVMSandbox 延迟加载 isolated-vm 原生模块，
    // 优先使用 prebuilt/ 离线二进制；缺失时由 vendored loader 自动从源码
    // 编译兜底（Win/macOS/Linux 三平台，见 vendor/isolated-vm/isolated-vm.js），
    // 保证 .js Skill 沙箱在任意平台可用，不再有"缺失降级"路径。
    const sandbox: ISandbox = new IsolatedVMSandbox();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new SkillService(relationDb, sandbox);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /**
   * 初始化组件：写入默认配置并恢复 enabled 状态。
   */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 新增 Skill */
  async addSkill(input: AddSkillInput, output: AddSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addSkill(input, output, context, metrics, report);
  }

  /** 获取 Skill */
  async soSkillById(input: GetSkillInput, output: GetSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSkillById(input, output, context, metrics, report);
  }

  /** 更新 Skill */
  async updateSkill(input: UpdateSkillInput, output: UpdateSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateSkill(input, output, context, metrics, report);
  }

  /** 删除 Skill */
  async delSkill(input: DelSkillInput, output: DelSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delSkill(input, output, context, metrics, report);
  }

  /** 搜索 Skill */
  async soSkill(input: SoSkillInput, output: SoSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSkill(input, output, context, metrics, report);
  }

  /** 执行 Skill（沙箱执行） */
  async execSkill(input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execSkill(input, output, context, metrics, report);
  }

  /** 启用/禁用 Skill 组件 */
  async enableSkill(input: EnableSkillInput, output: EnableSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableSkill(input, output, context, metrics, report);
  }
}
