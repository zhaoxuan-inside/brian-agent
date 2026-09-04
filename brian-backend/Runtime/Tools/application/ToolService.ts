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
  ConfigToolInput,
  ConfigToolOutput,
  AnyToolDef,
  ToolSpecJson,
  ToolExecutionContext,
} from '../domain/types';
import { zodToJSONSchema } from '../domain/zodToJsonSchema';
import {
  BuiltinToolDeps,
  skillExecTool,
  mcpExecTool,
  cdtBrowserTool,
} from './builtinTools';

/** 默认结果截断上限（字符） */
const DEFAULT_MAX_OUTPUT = 8000;

/** 内置工具 id（不可被自定义工具覆盖） */
const BUILTIN_TOOL_IDS = new Set(['skill_exec', 'mcp_exec', 'cdt_browser']);

/**
 * ToolService。
 */
export class ToolService {
  private defaultMaxOutput = DEFAULT_MAX_OUTPUT;
  private readonly registry = new Map<string, AnyToolDef>();

  constructor(
    private readonly deps: BuiltinToolDeps = {},
    private readonly logger?: Logger,
  ) {}

  /** 初始化组件（阶段2：注册表内存态，无持久化） */
  async initialize(): Promise<void> {
    this.logger?.debug?.('ToolService 初始化完成');
  }

  // -------------------------------------------------------------------------
  // registerTool / registerBuiltinTools
  // -------------------------------------------------------------------------

  /** 注册工具（逻辑控制；幂等；拒绝覆盖内置 id） */
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
    }
    this.registry.set(input.def.id, input.def);
    return true;
  }

  /** 注册内置工具（逻辑控制；幂等；enabled 缺省全部） */
  async registerBuiltinTools(input: RegisterBuiltinToolsInput, output: RegisterBuiltinToolsOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const enabled = new Set(input.enabled ?? ['skill_exec', 'mcp_exec', 'cdt_browser']);
    const candidates = this.prepareBuiltinCandidates();
    for (const def of candidates) {
      if (!enabled.has(def.id)) {
        continue;
      }
      await this.registerTool(this.prepareRegisterInput(def), new RegisterToolOutput(), new ToolContext());
      output.registered.push(def.id);
    }
    return true;
  }


  /** 组装内置工具候选（数据处理） */
  private prepareBuiltinCandidates(): AnyToolDef[] {
    return [skillExecTool(this.deps), mcpExecTool(this.deps), cdtBrowserTool(this.deps)];
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
    const def = this.registry.get(input.tool_id);
    if (!def) {
      throw new NotFoundError('Tool', input.tool_id);
    }
    const ctx = this.prepareToolContext(input);
    const parsed = this.prepareToolArgs(def, input.raw_args);
    if (!parsed.ok) {
      output.result = this.toFeedbackError(def.id, parsed.error);
      return true;
    }
    output.result = await this.executeToolSafely(def, parsed.args, ctx);
    return true;
  }

  /** 工具执行上下文组装（数据处理） */
  private prepareToolContext(input: ExecToolInput): ToolExecutionContext {
    return { run_id: input.run_id, session_key: input.session_key, signal: input.signal };
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
        status: 'error',
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
      status: 'error',
      output: `The ${toolId} tool was called with invalid arguments: ${error} Please rewrite the input and try again.`,
    };
  }

  // -------------------------------------------------------------------------
  // soTools / configTool
  // -------------------------------------------------------------------------

  /** 查询工具规格（逻辑控制） */
  async soTools(input: SoToolsInput, output: SoToolsOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const ids = input.tool_ids?.length ? input.tool_ids : Array.from(this.registry.keys());
    output.specs = ids
      .filter((id) => this.registry.has(id))
      .map((id) => this.toSpecJson(this.registry.get(id)!));
    return true;
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
