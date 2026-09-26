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

const DEFAULT_MAX_OUTPUT = 8000;

const BUILTIN_SKILL_GATE_IDS = new Set(['mcp_exec']);

export class SkillRuntimeService {
  private defaultMaxOutput = DEFAULT_MAX_OUTPUT;
  private readonly registry = new Map<string, AnySkillDef>();

  

  private readonly specCache = new Map<string, SkillSpecJson>();

  
  
  private readonly runSkills = new Map<string, Map<string, AnySkillDef>>();

  
  private soRunDef(runId: string, toolId: string): AnySkillDef | undefined {
    return runId ? this.runSkills.get(runId)?.get(toolId) : undefined;
  }

  constructor(
    private readonly deps: SkillRuntimeDeps = {},
    private readonly logger?: Logger,
  ) {}

  
  async initialize(): Promise<void> {
    
    this.warmSpecCache();
    this.logger?.debug?.(`SkillRuntimeService 初始化完成（规格缓存 warmed=${this.specCache.size}）`);
  }

  
  private warmSpecCache(): void {
    for (const id of this.registry.keys()) {
      if (!this.specCache.has(id)) {
        this.specCache.set(id, this.toSpecJson(this.registry.get(id)!));
      }
    }
  }

  
  
  

  
  
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
      
      this.specCache.delete(input.def.id);
    }
    this.registry.set(input.def.id, input.def);
    return true;
  }

  
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
    
    this.warmSpecCache();
    return true;
  }

  

  private prepareBuiltinCandidates(): AnySkillDef[] {
    return [mcpExecTool(this.deps)];
  }

  
  private prepareRegisterInput(def: AnySkillDef): RegisterSkillInput {
    const input = new RegisterSkillInput();
    input.def = def;
    return input;
  }

  
  
  

  
  async execSkill(input: ExecSkillInput, output: ExecSkillOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    
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

  
  private truncateResult(result: SkillResult, maxOutput: number): SkillResult {
    if (result.output.length <= maxOutput) {
      return result;
    }
    const truncated = `${result.output.slice(0, maxOutput)}\n…[输出已截断，原文 ${result.output.length} 字符]`;
    return { ...result, output: truncated };
  }

  
  private toFeedbackError(toolId: string, error: string): SkillResult {
    return {
      status: SkillResultStatus.Error,
      output: `The ${toolId} tool was called with invalid arguments: ${error} Please rewrite the input and try again.`,
    };
  }

  
  
  

  
  
  async soSkills(input: SoSkillsInput, output: SoSkillsOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const ids = input.skill_ids?.length ? input.skill_ids : Array.from(this.registry.keys());
    const runSkills = input.run_id ? this.runSkills.get(input.run_id) : undefined;
    output.specs = ids
      .map((id) => this.soCachedSpec(id))
      .filter((spec): spec is SkillSpecJson => Boolean(spec));
    
    if (runSkills) {
      for (const [id, toolDef] of runSkills) {
        if (!input.skill_ids?.length || input.skill_ids.includes(id)) {
          output.specs.push(this.toSpecJson(toolDef));
        }
      }
    }
    return true;
  }

  
  
  

  
  async registerRunSkills(input: RegisterRunSkillsInput, output: RegisterSkillsOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.run_id) {
      throw new ValidationError('registerRunSkills 需要 run_id');
    }
    
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

  
  async clearRunSkills(input: { run_id: string }, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.runSkills.delete(input.run_id);
    return true;
  }

  
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

  
  private toSpecJson(def: AnySkillDef): SkillSpecJson {
    return {
      id: def.id,
      description: def.description,
      parameters: zodToJSONSchema(def.parameters),
    };
  }

  
  async configTool(input: ConfigToolInput, _output: ConfigToolOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.default_max_output !== undefined) {
      this.defaultMaxOutput = input.default_max_output;
    }
    return true;
  }
}
