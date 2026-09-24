/**
 * @fileoverview Tools 模块应用服务层（Runtime v2 · 阶段2）。
 *
 * 依据 `Tools/Tools-PRD.md` §4/§6：
 * - execTool 顺序：prepareToolArgs（zod safeParse）→ 失败即配对错误回流
 *   （**错误即结果**，不抛错）→ execute → truncate → 配对结果；
 * - 工具 execute 抛错也归一为配对 error 结果（fail-loud 于服务边界之上由 Loop 判定）；
 * - 注册表为实例 Map；内置 id（skill_exec/mcp_exec/cdt_browser）不可被覆盖；
 * - 每 5 参方法 ≤40 行，逻辑控制（handleXxx）与数据处理（prepareXxx/soXxx）拆分。
 */

import type { Logger, Metrics, Report } from '@brian-agent/base';
import { NotFoundError, ValidationError } from '@brian-agent/base';
import {
  ToolContext,
  ToolResult,
  RegisterToolInput,
  RegisterToolOutput,
  ExecToolInput,
  ExecToolOutput,
  SoToolsInput,
  SoToolsOutput,
  RegisterBuiltinToolsInput,
  RegisterBuiltinToolsOutput,
  RegisterRunSkillToolsInput,
  RegisterSkillToolsOutput,
  ConfigToolInput,
  ConfigToolOutput,
  AnyToolDef,
  ToolSpecJson,
  ToolExecutionContext,
  ToolResultStatus,
} from '../domain/types';
import { zodToJSONSchema } from '../domain/zodToJsonSchema';
import {
  BuiltinToolDeps,
  skillExecTool,
  mcpExecTool,
  cdtBrowserTool,
} from './builtinTools';
import { updatePlanTool } from './planTool';
import { delegateTool } from './delegateTool';
import { execTool } from './execTool';
import { buildSkillToolDefs } from './skillTool';
import { askUserTool } from './askUserTool';

/** 默认结果截断上限（字符） */
const DEFAULT_MAX_OUTPUT = 8000;

/** 内置工具 id（不可被自定义工具覆盖） */
const BUILTIN_TOOL_IDS = new Set(['skill_exec', 'mcp_exec', 'cdt_browser', 'update_plan', 'delegate', 'ask_user', 'exec']);

/**
 * ToolService。
 */
export class ToolService {
  private defaultMaxOutput = DEFAULT_MAX_OUTPUT;
  private readonly registry = new Map<string, AnyToolDef>();

  /**
   * 工具规格缓存（2026-09-11 新增）：
   * 会话每轮 LLM 调用前都要经 soLoopToolSpecs → soTools 取工具规格，
   * 原实现每次都重新做 zod → JSON Schema 转换（纯 CPU、随轮次重复）。
   * 工具定义注册后即为静态（initialize/registerBuiltinTools 已在启动期注册完毕），
   * 故在启动期预构建 spec 缓存；registerTool 覆盖注册时使对应缓存失效，
   * 下次查询自动重建。zodToJSONSchema 对同一 def 输出确定，缓存安全。
   */
  private readonly specCache = new Map<string, ToolSpecJson>();

  // ===== 2026-09-24 新增（Tool ⊕ Skill 合并；Tools-PRD §14）：run 作用域工具注册表 =====
  /** run 级动态工具（绑定的 Skill 以一等工具进 wire，id = skill_<id>；rule：绑定即授权；Loop 结束清理） */
  private readonly runTools = new Map<string, Map<string, AnyToolDef>>();

  /** run 作用域 def 解析（数据处理）：registry 未命中时按 run 注册表兜底 */
  private soRunDef(runId: string, toolId: string): AnyToolDef | undefined {
    return runId ? this.runTools.get(runId)?.get(toolId) : undefined;
  }

  constructor(
    private readonly deps: BuiltinToolDeps = {},
    private readonly logger?: Logger,
  ) {}

  /** 初始化组件（阶段2：注册表内存态，无持久化） */
  async initialize(): Promise<void> {
    // ===== 新增（2026-09-11）：启动期预热工具规格缓存，消除每轮 LLM 调用前的重复 zod→JSON Schema 转换 =====
    this.warmSpecCache();
    this.logger?.debug?.(`ToolService 初始化完成（规格缓存 warmed=${this.specCache.size}）`);
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
  // registerTool / registerBuiltinTools
  // -------------------------------------------------------------------------

  /** 注册工具（逻辑控制；幂等；拒绝覆盖内置 id） */
  // ===== 修改后（2026-09-11）：覆盖注册时使旧规格缓存失效，下次查询自动按新 def 重建 =====
  async registerTool(input: RegisterToolInput, _output: RegisterToolOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.def?.id || !input.def.description || !input.def.parameters || !input.def.execute) {
      throw new ValidationError('工具定义缺少 id/description/parameters/execute');
    }
    if (this.registry.has(input.def.id)) {
      const existing = this.registry.get(input.def.id)!;
      if (existing === input.def) {
        return true;
      }
      if (BUILTIN_TOOL_IDS.has(input.def.id)) {
        throw new ValidationError(`内置工具 ${input.def.id} 不可被覆盖`);
      }
      // 覆盖自定义工具 → 旧规格缓存失效（幂等同引用时不改缓存）
      this.specCache.delete(input.def.id);
    }
    this.registry.set(input.def.id, input.def);
    return true;
  }

  /** 注册内置工具（逻辑控制；幂等；enabled 缺省全部） */
  async registerBuiltinTools(input: RegisterBuiltinToolsInput, output: RegisterBuiltinToolsOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const enabled = new Set(input.enabled ?? ['skill_exec', 'mcp_exec', 'cdt_browser', 'update_plan', 'delegate', 'ask_user', 'exec']);
    const candidates = this.prepareBuiltinCandidates();
    for (const def of candidates) {
      if (!enabled.has(def.id)) {
        continue;
      }
      await this.registerTool(this.prepareRegisterInput(def), new RegisterToolOutput(), new ToolContext(), _metrics);
      output.registered.push(def.id);
    }
    // ===== 新增（2026-09-11）：启动期注册完内置工具后立即预热规格缓存 =====
    this.warmSpecCache();
    return true;
  }


  /** 组装内置工具候选（数据处理） */
  private prepareBuiltinCandidates(): AnyToolDef[] {
    return [
      skillExecTool(this.deps),
      mcpExecTool(this.deps),
      cdtBrowserTool(this.deps),
      updatePlanTool(),
      delegateTool({ submitRun: (input) => {
        if (!this.deps.runGateway) {
          throw new ValidationError('delegate 未接线（runGateway 未注入）');
        }
        return this.deps.runGateway.submitRun(input);
      } }),
      execTool(),
      askUserTool({ waitAnswer: (input) => {
        if (!this.deps.askUserGate) {
          throw new ValidationError('ask_user 未接线（askUserGate 未注入）');
        }
        return this.deps.askUserGate.waitAnswer(input);
      } }),
    ];
  }

  /** 组装注册入参（数据处理） */
  private prepareRegisterInput(def: AnyToolDef): RegisterToolInput {
    const input = new RegisterToolInput();
    input.def = def;
    return input;
  }

  // -------------------------------------------------------------------------
  // execTool（校验错误回流 → execute → truncate → 配对结果）
  // -------------------------------------------------------------------------

  /** 执行单工具调用（逻辑控制） */
  async execTool(input: ExecToolInput, output: ExecToolOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    // ===== 2026-09-24 Tool ⊕ Skill 合并：run 级 Skill 工具兜底（绑定即授权，走同表权限语义）=====
    const def = this.registry.get(input.tool_id) ?? this.soRunDef(input.run_id ?? '', input.tool_id);
    if (!def) {
      throw new NotFoundError('Tool', input.tool_id);
    }
    const ctx = this.prepareToolContext(input, _metrics, _report);
    const parsed = this.prepareToolArgs(def, input.raw_args);
    if (!parsed.ok) {
      output.result = this.toFeedbackError(def.id, parsed.error);
      return true;
    }
    output.result = await this.executeToolSafely(def, parsed.args, ctx);
    return true;
  }

  /** 工具执行上下文组装（数据处理；emitEvent 为工具→事件流出口；component_scope 贯穿执行门；透传 metrics/report） */
  private prepareToolContext(input: ExecToolInput, metrics?: Metrics, report?: Report): ToolExecutionContext {
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
  private prepareToolArgs(
    def: AnyToolDef,
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
  private async executeToolSafely(
    def: AnyToolDef,
    args: unknown,
    ctx: ToolExecutionContext,
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    try {
      const result = await def.execute(args, ctx);
      return this.truncateResult(result, def.max_output ?? this.defaultMaxOutput);
    } catch (err) {
      return {
        status: ToolResultStatus.Error,
        output: `工具 ${def.id} 执行失败: ${err instanceof Error ? err.message : String(err)}`,
        elapsed_ms: Date.now() - startedAt,
      };
    }
  }

  /** 结果截断（数据处理） */
  private truncateResult(result: ToolResult, maxOutput: number): ToolResult {
    if (result.output.length <= maxOutput) {
      return result;
    }
    const truncated = `${result.output.slice(0, maxOutput)}\n…[输出已截断，原文 ${result.output.length} 字符]`;
    return { ...result, output: truncated };
  }

  /** 校验失败 → 模型反馈错误（数据处理；OpenCode invalid-args 回流语义） */
  private toFeedbackError(toolId: string, error: string): ToolResult {
    return {
      status: ToolResultStatus.Error,
      output: `The ${toolId} tool was called with invalid arguments: ${error} Please rewrite the input and try again.`,
    };
  }

  // -------------------------------------------------------------------------
  // soTools / configTool
  // -------------------------------------------------------------------------

  /** 查询工具规格（逻辑控制） */
  // ===== 修改后（2026-09-11）：优先读启动期规格缓存，miss 时重建回填；registerTool 覆盖注册已使缓存失效 =====
  async soTools(input: SoToolsInput, output: SoToolsOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const ids = input.tool_ids?.length ? input.tool_ids : Array.from(this.registry.keys());
    const runTools = input.run_id ? this.runTools.get(input.run_id) : undefined;
    output.specs = ids
      .map((id) => this.soCachedSpec(id))
      .filter((spec): spec is ToolSpecJson => Boolean(spec));
    // ===== 2026-09-24 Tool ⊕ Skill 合并：绑定 Skill 的 run 级一等工具并入 wire 规格（原实现 registry-only 过滤，runTools 在 SoToolsInput 无 run_id 时不可见）=====
    if (runTools) {
      for (const [id, toolDef] of runTools) {
        if (!input.tool_ids?.length || input.tool_ids.includes(id)) {
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
  async registerRunSkillTools(input: RegisterRunSkillToolsInput, output: RegisterSkillToolsOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.run_id) {
      throw new ValidationError('registerRunSkillTools 需要 run_id');
    }
    const skillAccess = this.deps.skillAccess;
    if (!skillAccess) {
      throw new ValidationError('Skill Provider 未注入（skillAccess 为空）');
    }
    if (input.skill_ids.length === 0) {
      this.runTools.delete(input.run_id);
      output.registered = [];
      return true;
    }
    const defs = await buildSkillToolDefs(input.skill_ids, skillAccess as never);
    this.runTools.set(input.run_id, new Map(defs.map((toolDef) => [toolDef.id, toolDef])));
    output.registered = defs.map((toolDef) => toolDef.id);
    return true;
  }

  /** 清理 run 级注册表（逻辑控制；Loop settle 调用，防会话性工具滞留全局） */
  async clearRunTools(input: { run_id: string }, _context: ToolContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.runTools.delete(input.run_id);
    return true;
  }

  /** 规格缓存查询（数据处理；registry miss 返回 undefined —— runTools 由调用方合并） */
  private soCachedSpec(id: string): ToolSpecJson | undefined {
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
  private toSpecJson(def: AnyToolDef): ToolSpecJson {
    return {
      id: def.id,
      description: def.description,
      parameters: zodToJSONSchema(def.parameters),
    };
  }

  /** 模块配置（逻辑控制） */
  async configTool(input: ConfigToolInput, _output: ConfigToolOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.default_max_output !== undefined) {
      this.defaultMaxOutput = input.default_max_output;
    }
    return true;
  }
}
