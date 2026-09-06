/**
 * @fileoverview AgentDefService —— 声明式 Agent 定义与确定性匹配（Runtime v2 · 阶段3 前置）。
 *
 * 依据 `Agents/Agents-PRD.md` §5/§6：
 * - matchAgentDef 三层确定性匹配（exact → signature 相似度 → LLM 打分 → 构建），
 *   **无随机重建**（弃用 AgentLibrary.shouldReuseByRegenRate）；
 * - soAgentSnapshot 组件**按当前任务经 Core match 动态重解析**（soul/skills/mcps），
 *   不沿用 agent_soul/agent_skill 历史绑定（根治组件错配：如"通用问答 Agent 绑定编码研究 Soul"）；
 * - system = identity 段（builtin.identity，身份问题由此回答）+ soul 段 + 任务/工具清单段；
 * - 构建复用 AgentBuilder.buildAgent（force_new，写旧 agent 表资产），def 记录引用。
 *
 * 每 5 参方法 ≤40 行；逻辑控制与数据处理拆分。
 */

import type {
  RelationDBAccess,
  Logger,
  Metrics,
  Report,
  LLMAccess,
} from '@brian-agent/base';
import type {
  LLMCoreAccess,
  SoulCoreAccess,
  SkillCoreAccess,
  MCPCoreAccess,
} from '@brian-agent/core';
import type { AgentBuilderAccess as AgentBuilderAccessA, AgentLibraryAccess } from '@brian-agent/agent';
import {
  IdGenerator,
  Operator,
  newRecord,
  newPatch,
  ConfigService,
  ValidationError,
  NotFoundError,
  PROMPT_IDS,
  getBuiltinTemplate,
  renderTemplate,
  LLMContext,
  ExecLLMInput,
  ExecLLMOutput,
} from '@brian-agent/base';
import {
  AgentBuilderContext,
  AgentLibraryContext,
  GetAgentInput,
  GetAgentOutput,
  BuildAgentInput,
  BuildAgentOutput,
  parseJsonObject,
} from '@brian-agent/agent';
import { DEFAULT_BUDGET_TOTAL } from '../../shared/types';
import {
  SoulCoreContext,
  MatchSoulInput,
  MatchSoulOutput,
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
  McpCoreContext,
  MatchMcpInput,
  MatchMcpOutput,
  simpleSimilarity,
} from '@brian-agent/core';
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
  AgentDefRecord,
  AgentMode,
  AgentDefStatus,
  AgentMatchLayer,
  SnapshotToolEntry,
  RUNTIME_AGENT_DEF_TABLE,
  RUNTIME_AGENTS_CONFIG_TABLE,
} from '../domain/types';
import { SoSoulContentInput, SoSoulContentOutput } from '@brian-agent/core';

/** 旧 agent 资产字段子集（构建落账取名/用途用） */
interface AgentRecordLike {
  agent_id: string;
  agent_name?: string;
  agent_purpose?: string;
}

/** 默认签名相似度阈值 */
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

/** LLM 打分采纳阈值 */
const LLM_SCORE_THRESHOLD = 0.7;

/** 组件匹配依赖组合（收敛构造参数） */
export interface AgentDefComponents {
  agentBuilder: AgentBuilderAccessA;
  /** 旧 agent 资产查询（构建落账取名/用途用；缺省回退签名） */
  agentLibrary?: AgentLibraryAccess;
  llmCore?: LLMCoreAccess;
  soulCore?: SoulCoreAccess;
  skillCore?: SkillCoreAccess;
  mcpCore?: MCPCoreAccess;
}

/**
 * AgentDefService。
 */
export class AgentDefService {
  private similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD;
  private readonly config: ConfigService;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llm: LLMAccess,
    private readonly components: AgentDefComponents,
    private readonly logger?: Logger,
  ) {
    this.config = new ConfigService(relationDb, RUNTIME_AGENTS_CONFIG_TABLE);
  }

  /** 初始化组件：恢复配置 */
  async initialize(): Promise<void> {
    const threshold = await this.config.getString('match_similarity_threshold', '');
    if (threshold) {
      this.similarityThreshold = Number(threshold) || DEFAULT_SIMILARITY_THRESHOLD;
    }
    this.logger?.debug?.('AgentDefService 初始化完成');
  }

  // -------------------------------------------------------------------------
  // matchAgentDef（确定性三层）
  // -------------------------------------------------------------------------

  /** 确定性匹配（逻辑控制）：exact → signature → llm → 构建 */
  async matchAgentDef(input: MatchAgentDefInput, output: MatchAgentDefOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.task_content) {
      throw new ValidationError('task_content 不能为空');
    }
    const defs = await this.soActiveDefs();
    const exact = this.soExactMatch(defs, input.task_content, input.task_domain);
    if (exact) {
      output.def_id = exact.id;
      output.matched_by = AgentMatchLayer.Exact;
      output.def = exact;
      return true;
    }
    const signatureHit = this.soSignatureMatch(defs, input.task_content, input.task_domain);
    if (signatureHit) {
      output.def_id = signatureHit.id;
      output.matched_by = AgentMatchLayer.Signature;
      output.def = signatureHit;
      return true;
    }
    if (input.force_new !== true && defs.length > 0) {
      const llmHit = await this.soLLMRankedDef(defs, input.task_content);
      if (llmHit) {
        output.def_id = llmHit.id;
        output.matched_by = AgentMatchLayer.LLM;
        output.def = llmHit;
        return true;
      }
    }
    const built = await this.buildNewDef(input);
    output.def_id = built.id;
    output.matched_by = AgentMatchLayer.Built;
    output.def = built;
    return true;
  }

  /** 查询 active 定义（逻辑控制） */
  private async soActiveDefs(): Promise<AgentDefRecord[]> {
    const rows = await this.relationDb.select(RUNTIME_AGENT_DEF_TABLE, {
      conditions: [{ field: 'status', operator: Operator.EQ, value: 'active' }],
    });
    return rows.map((row) => this.toDefRecord(row));
  }

  /** 行转定义记录（数据处理） */
  private toDefRecord(row: Record<string, unknown>): AgentDefRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      mode: String(row.mode ?? AgentMode.Primary) as AgentDefRecord['mode'],
      agent_ref: String(row.agent_ref ?? ''),
      task_signature: String(row.task_signature ?? ''),
      agent_purpose: String(row.agent_purpose ?? ''),
      prompt_template_id: String(row.prompt_template_id ?? ''),
      model_id: String(row.model_id ?? ''),
      soul_id: String(row.soul_id ?? ''),
      tools_json: String(row.tools_json ?? ''),
      temperature: row.temperature === null || row.temperature === undefined ? undefined : Number(row.temperature),
      budget_total: Number(row.budget_total ?? DEFAULT_BUDGET_TOTAL),
      status: String(row.status ?? AgentDefStatus.Active) as AgentDefRecord['status'],
      created: Number(row.created),
      updated: Number(row.updated),
    };
  }

  /** L1 精确命中（数据处理：签名完全一致） */
  private soExactMatch(defs: AgentDefRecord[], taskContent: string, domain?: string): AgentDefRecord | null {
    const signature = this.buildSignature(taskContent, domain);
    return defs.find((def) => def.task_signature && def.task_signature === signature) ?? null;
  }

  /** L2 签名相似度命中（数据处理；bigram Jaccard ≥ 阈值，无随机） */
  private soSignatureMatch(defs: AgentDefRecord[], taskContent: string, domain?: string): AgentDefRecord | null {
    const signature = this.buildSignature(taskContent, domain);
    let best: AgentDefRecord | null = null;
    let bestScore = 0;
    for (const def of defs) {
      if (!def.task_signature) {
        continue;
      }
      const score = simpleSimilarity(signature, def.task_signature);
      if (score >= this.similarityThreshold && score > bestScore) {
        best = def;
        bestScore = score;
      }
    }
    return best;
  }

  /** 构建任务签名（数据处理；`[domain] 前256字` 统一格式） */
  private buildSignature(taskContent: string, domain?: string): string {
    const d = (domain ?? '').trim() || 'general';
    return `[${d}] ${(taskContent ?? '').slice(0, 256)}`;
  }

  /** L3 LLM 打分命中（逻辑控制；经 LLMAccess.execLLM，Prompt 为 builtin.agent_match 渲染） */
  private async soLLMRankedDef(defs: AgentDefRecord[], taskContent: string): Promise<AgentDefRecord | null> {
    const template = getBuiltinTemplate(PROMPT_IDS.agentMatch) ?? '';
    const candidates = defs
      .map((def, index) => `${index + 1}. agent_id=${def.agent_ref || def.id} 用途: ${def.name} — ${this.defBrief(def)}`)
      .join('\n');
    const prompt = renderTemplate(template, { task_content: taskContent, candidates });
    const execInput = new ExecLLMInput();
    execInput.prompt = prompt;
    execInput.max_tokens = 300;
    const execOutput = new ExecLLMOutput();
    const ok = await this.llm.execLLM(execInput, execOutput, new LLMContext());
    if (!ok || !execOutput.result) {
      return null;
    }
    const parsed = parseJsonObject(execOutput.result);
    if (!parsed) {
      return null;
    }
    const score = Number(parsed.score ?? 0);
    if (!(score >= LLM_SCORE_THRESHOLD)) {
      return null;
    }
    const agentRef = String(parsed.agent_id ?? '');
    return defs.find((def) => def.agent_ref === agentRef || def.id === agentRef) ?? null;
  }

  /** 定义简述（数据处理：agent_purpose 优先，签名兜底） */
  private defBrief(def: AgentDefRecord): string {
    return def.agent_purpose || def.task_signature || def.name;
  }

  /** L4 构建（逻辑控制）：复用 AgentBuilder.buildAgent（force_new）→ 写 def */
  private async buildNewDef(input: MatchAgentDefInput): Promise<AgentDefRecord> {
    const buildInput = new BuildAgentInput();
    buildInput.interact_id = input.interact_id ?? '';
    buildInput.task_content = input.task_content;
    buildInput.task_domain = input.task_domain;
    buildInput.force_new = true;
    const buildOutput = new BuildAgentOutput();
    const ctx = this.prepareBuilderContext(input);
    const ok = await this.components.agentBuilder.buildAgent(buildInput, buildOutput, ctx);
    if (!ok || !buildOutput.agent_id) {
      throw new ValidationError('Agent 构建失败（AgentBuilder 无返回）');
    }
    return this.insertDefFromAgent(buildOutput.agent_id, input);
  }

  /** 构建上下文组装（数据处理） */
  private prepareBuilderContext(input: MatchAgentDefInput): AgentBuilderContext {
    const ctx = new AgentBuilderContext();
    ctx.session_id = '';
    ctx.work_id = '';
    ctx.interact_id = input.interact_id ?? '';
    return ctx;
  }

  /** 从旧 agent 资产写声明定义（逻辑控制；取名/用途经 AgentLibraryAccess，落账 id 取自插入记录） */
  private async insertDefFromAgent(agentId: string, input: MatchAgentDefInput): Promise<AgentDefRecord> {
    const asset = await this.soAgentAsset(agentId);
    const name = asset?.agent_name || 'agent';
    const purpose = String(asset?.agent_purpose ?? '') || this.buildSignature(input.task_content, input.task_domain);
    const record = newRecord({
      name: `w2-${name}-${IdGenerator.generate().slice(0, 8)}`,
      mode: AgentMode.Primary,
      agent_ref: agentId,
      task_signature: this.buildSignature(input.task_content, input.task_domain),
      agent_purpose: purpose,
      prompt_template_id: '',
      model_id: '',
      soul_id: '',
      tools_json: '',
      budget_total: DEFAULT_BUDGET_TOTAL,
      status: AgentDefStatus.Active,
    });
    await this.relationDb.insert(RUNTIME_AGENT_DEF_TABLE, record);
    const defId = String(record[0].value);
    const row = await this.soDefRowById(defId);
    if (!row) {
      throw new NotFoundError(RUNTIME_AGENT_DEF_TABLE, defId);
    }
    return this.toDefRecord(row);
  }

  /** 查询旧 agent 资产（逻辑控制；经 AgentLibraryAccess，未注入返回 null） */
  private async soAgentAsset(agentId: string): Promise<AgentRecordLike | null> {
    if (!this.components.agentLibrary) {
      return null;
    }
    const input = new GetAgentInput();
    input.agent_id = agentId;
    const output = new GetAgentOutput();
    await this.components.agentLibrary.soAgent(input, output, new AgentLibraryContext());
    return output.agents.find((agent) => agent.agent_id === agentId) ?? null;
  }

  /** 按 id 查询定义行（逻辑控制） */
  private async soDefRowById(defId: string): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(RUNTIME_AGENT_DEF_TABLE, [
      { field: 'id', operator: Operator.EQ, value: defId },
    ]);
  }

  // -------------------------------------------------------------------------
  // soAgentSnapshot（组件按任务重解析）
  // -------------------------------------------------------------------------

  /** 组装会话级快照（逻辑控制） */
  async soAgentSnapshot(input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const def = await this.soDefRow(input.def_id);
    const soulContent = await this.soSoulContent(def, input);
    const tools = await this.soSnapshotTools(def, input);
    const system = this.prepareSystemPrompt(def, soulContent, tools, input.user_message ?? input.task_content);
    output.snapshot = {
      def_id: def.id,
      name: def.name,
      system,
      llm_id: def.model_id,
      temperature: def.temperature,
      budget_total: def.budget_total,
      tools,
      meta: { soul_id: def.soul_id || undefined, llm_id: def.model_id || undefined, matched_by: 'snapshot' },
    };
    return true;
  }

  /** 查询定义行（数据处理） */
  private async soDefRow(defId: string): Promise<AgentDefRecord> {
    const row = await this.relationDb.selectOne(RUNTIME_AGENT_DEF_TABLE, [
      { field: 'id', operator: Operator.EQ, value: defId },
    ]);
    if (!row) {
      throw new NotFoundError('runtime_agent_def', defId);
    }
    return this.toDefRecord(row);
  }

  /** Soul 内容解析（逻辑控制；**显式配置优先，否则按任务动态 matchSoul，不沿用历史绑定**；内容统一经 SoulCoreAccess） */
  private async soSoulContent(def: AgentDefRecord, input: SoAgentSnapshotInput): Promise<string> {
    if (def.soul_id) {
      return this.soSoulContentById(def.soul_id);
    }
    if (!this.components.soulCore) {
      return '';
    }
    const matchInput = new MatchSoulInput();
    matchInput.agent_id = def.agent_ref;
    matchInput.context_id = input.context_id ?? '';
    matchInput.interact_id = input.interact_id ?? '';
    matchInput.task_content = input.task_content;
    matchInput.task_domain = input.task_domain;
    const matchOutput = new MatchSoulOutput();
    const ok = await this.components.soulCore.matchSoul(matchInput, matchOutput, new SoulCoreContext());
    if (!ok) {
      return '';
    }
    return String(matchOutput.soul?.soul_content ?? '');
  }

  /** 按 id 读取 Soul 内容（逻辑控制；经 SoulCoreAccess.soSoulContent，禁止直查 soul 表） */
  private async soSoulContentById(soulId: string): Promise<string> {
    if (!this.components.soulCore) {
      return '';
    }
    const input = new SoSoulContentInput();
    input.soul_id = soulId;
    const output = new SoSoulContentOutput();
    await this.components.soulCore.soSoulContent(input, output, new SoulCoreContext());
    return output.content;
  }

  /** 工具清单解析（数据处理；显式 tools_json 优先，否则动态 matchSkill/matchMCP） */
  private async soSnapshotTools(def: AgentDefRecord, input: SoAgentSnapshotInput): Promise<SnapshotToolEntry[]> {
    if (def.tools_json) {
      const explicit = parseJsonObject(def.tools_json);
      return this.entriesFromExplicit(explicit);
    }
    const entries: SnapshotToolEntry[] = [];
    if (this.components.skillCore) {
      const matchInput = new MatchSkillInput();
      matchInput.agent_id = def.agent_ref;
      matchInput.context_id = input.context_id ?? '';
      matchInput.interact_id = input.interact_id ?? '';
      const matchOutput = new MatchSkillOutput();
      const ok = await this.components.skillCore.matchSkill(matchInput, matchOutput, new SkillCoreContext());
      if (ok) {
        for (const entry of matchOutput.skills) {
          entries.push({ kind: 'skill', id: entry.skill_id, brief: entry.skill_brief });
        }
      }
    }
    return this.appendMcpEntries(def, input, entries);
  }

  /** 显式工具清单展开（数据处理；阶段3 起由 def 直接管理 id 列表） */
  private entriesFromExplicit(explicit: Record<string, unknown> | null): SnapshotToolEntry[] {
    const entries: SnapshotToolEntry[] = [];
    const skills = Array.isArray(explicit?.skills) ? (explicit!.skills as string[]) : [];
    const mcps = Array.isArray(explicit?.mcps) ? (explicit!.mcps as string[]) : [];
    for (const id of skills) {
      entries.push({ kind: 'skill', id, brief: '' });
    }
    for (const id of mcps) {
      entries.push({ kind: 'mcp', id, brief: '' });
    }
    return entries;
  }

  /** 追加 MCP 条目（数据处理） */
  private async appendMcpEntries(def: AgentDefRecord, input: SoAgentSnapshotInput, entries: SnapshotToolEntry[]): Promise<SnapshotToolEntry[]> {
    if (!this.components.mcpCore) {
      return entries;
    }
    const matchInput = new MatchMcpInput();
    matchInput.agent_id = def.agent_ref;
    matchInput.context_id = input.context_id ?? '';
    matchInput.interact_id = input.interact_id ?? '';
    const matchOutput = new MatchMcpOutput();
    const ok = await this.components.mcpCore.matchMCP(matchInput, matchOutput, new McpCoreContext());
    if (ok) {
      for (const detail of matchOutput.mcp_details) {
        entries.push({ kind: 'mcp', id: String(detail.id ?? ''), brief: String(detail.mcp_brief ?? detail.mcp_title ?? '') });
      }
    }
    return entries;
  }

  /** 系统提示组装（数据处理）：identity 段在前（身份问题由此回答）+ soul 段 + 任务/工具清单段 */
  private prepareSystemPrompt(def: AgentDefRecord, soulContent: string, tools: SnapshotToolEntry[], userMessage: string): string {
    const template = getBuiltinTemplate(def.prompt_template_id || PROMPT_IDS.identity) ?? '';
    const toolLines = tools
      .map((t) => `- ${t.kind === 'skill' ? 'skill_exec(skill_id' : 'mcp_exec(mcp_id'}: "${t.id}") ${t.brief}`.replace('))', ')'))
      .join('\n');
    const directive = [
      `当前任务：${(userMessage ?? '').slice(0, 500)}`,
      tools.length ? `\n可用工具（经 skill_exec / mcp_exec 调用，按 id 传入）：\n${toolLines}` : '',
    ].join('\n');
    const system = renderTemplate(template, { soul: soulContent, task_directive: directive });
    this.logger?.debug?.('soAgentSnapshot.system', { head: system.slice(0, 400), template_id: def.prompt_template_id || 'builtin.identity' });
    return system;
  }

  // -------------------------------------------------------------------------
  // declareAgent / soAgentDefs / configAgentDef
  // -------------------------------------------------------------------------

  /** 声明式定义 upsert（逻辑控制；幂等 by name） */
  async declareAgent(input: DeclareAgentInput, output: DeclareAgentOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.name) {
      throw new ValidationError('name 不能为空');
    }
    const existing = await this.relationDb.selectOne(RUNTIME_AGENT_DEF_TABLE, [
      { field: 'name', operator: Operator.EQ, value: input.name },
    ]);
    if (existing) {
      await this.relationDb.update(RUNTIME_AGENT_DEF_TABLE, newPatch(this.prepareDefPatch(input)), [
        { field: 'name', operator: Operator.EQ, value: input.name },
      ]);
      output.def_id = String(existing.id);
      return true;
    }
    const record = newRecord({ ...this.prepareDefPatch(input), name: input.name });
    await this.relationDb.insert(RUNTIME_AGENT_DEF_TABLE, record);
    output.def_id = String(record[0].value);
    return true;
  }

  /** 定义补丁组装（数据处理） */
  private prepareDefPatch(input: DeclareAgentInput): Record<string, unknown> {
    const patch: Record<string, unknown> = {
      mode: input.mode ?? AgentMode.Primary,
      agent_ref: input.agent_ref ?? '',
      task_signature: input.task_signature ?? '',
      agent_purpose: input.agent_purpose ?? '',
      prompt_template_id: input.prompt_template_id ?? '',
      model_id: input.model_id ?? '',
      soul_id: input.soul_id ?? '',
      tools_json: input.tools_json ?? '',
      temperature: input.temperature,
      budget_total: input.budget_total ?? DEFAULT_BUDGET_TOTAL,
      status: input.status ?? AgentDefStatus.Active,
    };
    return patch;
  }

  /** 查询定义列表（逻辑控制） */
  async soAgentDefs(_input: SoAgentDefsInput, output: SoAgentDefsOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(RUNTIME_AGENT_DEF_TABLE, {
      order_by: [{ field: 'created', direction: 'DESC' }],
    });
    output.defs = rows.map((row) => this.toDefRecord(row));
    return true;
  }

  /** 模块配置（逻辑控制） */
  async configAgentDef(input: ConfigAgentDefInput, _output: ConfigAgentDefOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.match_similarity_threshold !== undefined) {
      this.similarityThreshold = input.match_similarity_threshold;
      await this.config.set('match_similarity_threshold', input.match_similarity_threshold, 'DOUBLE');
    }
    return true;
  }
}
