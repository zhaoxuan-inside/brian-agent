/**
 * @fileoverview Tools 模块应用服务层（Runtime v2 · 阶段2）。
 *
 * 依据 `Tools/Tools-PRD.md` §4/§6：
 * - execSkill 顺序：prepareSkillArgs（zod safeParse）→ 失败即配对错误回流
 *   （**错误即结果**，不抛错）→ execute → truncate → 配对结果；
 * - 工具 execute 抛错也归一为配对 error 结果（fail-loud 于服务边界之上由 Loop 判定）；
 * - 注册表为实例 Map；内置 id（skill_exec/mcp_exec/cdt_browser）不可被覆盖；
 * - 每 5 参方法 ≤40 行，逻辑控制（handleXxx）与数据处理（prepareXxx/soXxx）拆分。
 */

import type { Logger, Metrics, Report } from '@brian-agent/base';
import { NotFoundError, ValidationError } from '@brian-agent/base';
import {
  SkillRuntimeContext,
  SkillResult,
  RegisterSkillInput,
  RegisterSkillOutput,
  ExecSkillInput,
  ExecSkillOutput,
  SoSkillsInput,
  SoSkillsOutput,
  RegisterBuiltinSkillsInput,
  RegisterBuiltinSkillsOutput,
  RegisterRunSkillsInput,
  RegisterSkillsOutput,
  ConfigToolInput,
  ConfigToolOutput,
  AnySkillDef,
  SkillSpecJson,
  SkillExecutionContext,
  SkillResultStatus,
} from '../domain/types';
import { zodToJSONSchema } from '../domain/zodToJsonSchema';
import { mcpExecTool, type SkillRuntimeDeps } from './mcpGate';
import { buildBoundSkillDefs } from './skillDefs';
import { buildSystemSkillDefs } from './builtinSkills';

/** 默认结果截断上限（字符） */
const DEFAULT_MAX_OUTPUT = 8000;

/** 内置工具 id（不可被自定义工具覆盖） */
const BUILTIN_SKILL_GATE_IDS = new Set(['mcp_exec']);

/**
 * SkillRuntimeService。
 */
export class SkillRuntimeService {
  private defaultMaxOutput = DEFAULT_MAX_OUTPUT;
  private readonly registry = new Map<string, AnySkillDef>();

  /**
   * 工具规格缓存（2026-09-11 新增）：
   * 会话每轮 LLM 调用前都要经 soLoopToolSpecs → soSkills 取工具规格，
   * 原实现每次都重新做 zod → JSON Schema 转换（纯 CPU、随轮次重复）。
   * 工具定义注册后即为静态（initialize/registerBuiltinSkills 已在启动期注册完毕），
   * 故在启动期预构建 spec 缓存；registerSkill 覆盖注册时使对应缓存失效，
   * 下次查询自动重建。zodToJSONSchema 对同一 def 输出确定，缓存安全。
   */
  private readonly specCache = new Map<string, SkillSpecJson>();

  // ===== 2026-09-24 新增（Tool ⊕ Skill 合并；Tools-PRD §14）：run 作用域工具注册表 =====
  /** run 级动态工具（绑定的 Skill 以一等工具进 wire，id = skill_<id>；rule：绑定即授权；Loop 结束清理） */
  private readonly runSkills = new Map<string, Map<string, AnySkillDef>>();

  /** run 作用域 def 解析（数据处理）：registry 未命中时按 run 注册表兜底 */
  private soRunDef(runId: string, toolId: string): AnySkillDef | undefined {
    return runId ? this.runSkills.get(runId)?.get(toolId) : undefined;
  }

  constructor(
    private readonly deps: SkillRuntimeDeps = {},
    private readonly logger?: Logger,
  ) {}

  /** 初始化组件（阶段2：注册表内存态，无持久化） */
  async initialize(): Promise<void> {
    // ===== 新增（2026-09-11）：启动期预热工具规格缓存，消除每轮 LLM 调用前的重复 zod→JSON Schema 转换 =====
    this.warmSpecCache();
    this.logger?.debug?.(`SkillRuntimeService 初始化完成（规格缓存 warmed=${this.specCache.size}）`);
  }

  /** 启动期预热规格缓存（数据处理；幂等） */
  private warmSpecCache(): void {
    for (const id of this.registry.keys()) {
      if (!this.specCache.has(id)) {
        this.specCache.set(id, this.toSpecJson(this.registry.get(id)!));
      }
    }
  }

  // -------------------------------------------------------------------------
  // registerSkill / registerBuiltinSkills
  // -------------------------------------------------------------------------

  /** 注册工具（逻辑控制；幂等；拒绝覆盖内置 id） */
  // ===== 修改后（2026-09-11）：覆盖注册时使旧规格缓存失效，下次查询自动按新 def 重建 =====
  async registerSkill(input: RegisterSkillInput, _output: RegisterSkillOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.def?.id || !input.def.description || !input.def.parameters || !input.def.execute) {
      throw new ValidationError('工具定义缺少 id/description/parameters/execute');
    }
    if (this.registry.has(input.def.id)) {
      const existing = this.registry.get(input.def.id)!;
      if (existing === input.def) {
        return true;
      }
      if (BUILTIN_SKILL_GATE_IDS.has(input.def.id)) {
        throw new ValidationError(`内置工具 ${input.def.id} 不可被覆盖`);
      }
      // 覆盖自定义工具 → 旧规格缓存失效（幂等同引用时不改缓存）
      this.specCache.delete(input.def.id);
    }
    this.registry.set(input.def.id, input.def);
    return true;
  }

  /** 注册内置工具（逻辑控制；幂等；enabled 缺省全部） */
  async registerBuiltinSkills(input: RegisterBuiltinSkillsInput, output: RegisterBuiltinSkillsOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const enabled = new Set(input.enabled ?? ['mcp_exec']);
    const candidates = this.prepareBuiltinCandidates();
    for (const def of candidates) {
      if (!enabled.has(def.id)) {
        continue;
      }
      await this.registerSkill(this.prepareRegisterInput(def), new RegisterSkillOutput(), new SkillRuntimeContext(), _metrics);
      output.registered.push(def.id);
    }
    // ===== 新增（2026-09-11）：启动期注册完内置工具后立即预热规格缓存 =====
    this.warmSpecCache();
    return true;
  }


  /** 组装全局注册的内置候选（数据处理；2026-09-24 概念退役后仅剩 MCP gate ——
   *  五个系统原语技能与绑定技能一律走 run 级注册，不占全局注册表） */
  private prepareBuiltinCandidates(): AnySkillDef[] {
    return [mcpExecTool(this.deps)];
  }

  /** 组装注册入参（数据处理） */
  private prepareRegisterInput(def: AnySkillDef): RegisterSkillInput {
    const input = new RegisterSkillInput();
    input.def = def;
    return input;
  }

  // -------------------------------------------------------------------------
  // execSkill（校验错误回流 → execute → truncate → 配对结果）
  // -------------------------------------------------------------------------

  /** 执行单工具调用（逻辑控制） */
  async execSkill(input: ExecSkillInput, output: ExecSkillOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    // ===== 2026-09-24 Tool ⊕ Skill 合并：run 级 Skill 工具兜底（绑定即授权，走同表权限语义）=====
    const def = this.registry.get(input.tool_id) ?? this.soRunDef(input.run_id ?? '', input.tool_id);
    if (!def) {
      throw new NotFoundError('Tool', input.tool_id);
    }
    const ctx = this.prepareSkillContext(input, _metrics, _report);
    const parsed = this.prepareSkillArgs(def, input.raw_args);
    if (!parsed.ok) {
      output.result = this.toFeedbackError(def.id, parsed.error);
      return true;
    }
    output.result = await this.executeSkillSafely(def, parsed.args, ctx);
    return true;
  }

  /** 工具执行上下文组装（数据处理；emitEvent 为工具→事件流出口；component_scope 贯穿执行门；透传 metrics/report） */
  private prepareSkillContext(input: ExecSkillInput, metrics?: Metrics, report?: Report): SkillExecutionContext {
    return {
      run_id: input.run_id,
      session_key: input.session_key,
      signal: input.signal,
      emitEvent: input.emitEvent,
      component_scope: input.component_scope,
      metrics,
      report,
    };
  }

  /** 参数解析与 zod 校验（数据处理；失败不抛错，转配对回流） */
  private prepareSkillArgs(
    def: AnySkillDef,
    rawArgs: string,
  ): { ok: true; args: unknown } | { ok: false; error: string } {
    let raw: unknown = {};
    try {
      raw = JSON.parse(rawArgs || '{}');
    } catch {
      return { ok: false, error: `参数不是合法 JSON: ${rawArgs.slice(0, 200)}` };
    }
    const parsed = def.parameters.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }
    return { ok: true, args: parsed.data };
  }

  /** 安全执行（逻辑控制；execute 抛错归一为配对 error 结果） */
  private async executeSkillSafely(
    def: AnySkillDef,
    args: unknown,
    ctx: SkillExecutionContext,
  ): Promise<SkillResult> {
    const startedAt = Date.now();
    try {
      const result = await def.execute(args, ctx);
      return this.truncateResult(result, def.max_output ?? this.defaultMaxOutput);
    } catch (err) {
      return {
        status: SkillResultStatus.Error,
        output: `工具 ${def.id} 执行失败: ${err instanceof Error ? err.message : String(err)}`,
        elapsed_ms: Date.now() - startedAt,
      };
    }
  }

  /** 结果截断（数据处理） */
  private truncateResult(result: SkillResult, maxOutput: number): SkillResult {
    if (result.output.length <= maxOutput) {
      return result;
    }
    const truncated = `${result.output.slice(0, maxOutput)}\n…[输出已截断，原文 ${result.output.length} 字符]`;
    return { ...result, output: truncated };
  }

  /** 校验失败 → 模型反馈错误（数据处理；OpenCode invalid-args 回流语义） */
  private toFeedbackError(toolId: string, error: string): SkillResult {
    return {
      status: SkillResultStatus.Error,
      output: `The ${toolId} tool was called with invalid arguments: ${error} Please rewrite the input and try again.`,
    };
  }

  // -------------------------------------------------------------------------
  // soSkills / configTool
  // -------------------------------------------------------------------------

  /** 查询工具规格（逻辑控制） */
  // ===== 修改后（2026-09-11）：优先读启动期规格缓存，miss 时重建回填；registerSkill 覆盖注册已使缓存失效 =====
  async soSkills(input: SoSkillsInput, output: SoSkillsOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const ids = input.skill_ids?.length ? input.skill_ids : Array.from(this.registry.keys());
    const runSkills = input.run_id ? this.runSkills.get(input.run_id) : undefined;
    output.specs = ids
      .map((id) => this.soCachedSpec(id))
      .filter((spec): spec is SkillSpecJson => Boolean(spec));
    // ===== 2026-09-24 Tool ⊕ Skill 合并：绑定 Skill 的 run 级一等工具并入 wire 规格（原实现 registry-only 过滤，runSkills 在 SoSkillsInput 无 run_id 时不可见）=====
    if (runSkills) {
      for (const [id, toolDef] of runSkills) {
        if (!input.skill_ids?.length || input.skill_ids.includes(id)) {
          output.specs.push(this.toSpecJson(toolDef));
        }
      }
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // run 级 Skill 工具注册（Tool ⊕ Skill 合并核心）
  // -------------------------------------------------------------------------

  /** 注册 run 级 Skill 一等工具（逻辑控制；工具清单生成依赖 deps.skillAccess；幂等覆盖本 run 清单） */
  async registerRunSkills(input: RegisterRunSkillsInput, output: RegisterSkillsOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.run_id) {
      throw new ValidationError('registerRunSkills 需要 run_id');
    }
    // ===== 2026-09-24 概念退役（Tool → Skill）：run 级注册 = 系统内置技能（恒定清单）∪ 绑定技能 =====
    const defs: AnySkillDef[] = [...buildSystemSkillDefs(this.deps)];
    const boundIds = (input.skill_ids ?? []).filter(Boolean);
    if (boundIds.length > 0) {
      const skillAccess = this.deps.skillAccess;
      if (!skillAccess) {
        throw new ValidationError('Skill Provider 未注入（skillAccess 为空）');
      }
      defs.push(...await buildBoundSkillDefs(boundIds, skillAccess as never));
    }
    if (defs.length === 0) {
      this.runSkills.delete(input.run_id);
      output.registered = [];
      return true;
    }
    this.runSkills.set(input.run_id, new Map(defs.map((def) => [def.id, def])));
    output.registered = defs.map((def) => def.id);
    return true;
  }

  /** 清理 run 级注册表（逻辑控制；Loop settle 调用，防会话性工具滞留全局） */
  async clearRunSkills(input: { run_id: string }, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.runSkills.delete(input.run_id);
    return true;
  }

  /** 规格缓存查询（数据处理；registry miss 返回 undefined —— runSkills 由调用方合并） */
  private soCachedSpec(id: string): SkillSpecJson | undefined {
    const cached = this.specCache.get(id);
    if (cached) {
      return cached;
    }
    const registered = this.registry.get(id);
    if (!registered) {
      return undefined;
    }
    const spec = this.toSpecJson(registered);
    this.specCache.set(id, spec);
    return spec;
  }

  /** 定义转 LLM 规格（数据处理：zod → JSON Schema） */
  private toSpecJson(def: AnySkillDef): SkillSpecJson {
    return {
      id: def.id,
      description: def.description,
      parameters: zodToJSONSchema(def.parameters),
    };
  }

  /** 模块配置（逻辑控制） */
  async configTool(input: ConfigToolInput, _output: ConfigToolOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.default_max_output !== undefined) {
      this.defaultMaxOutput = input.default_max_output;
    }
    return true;
  }
}
