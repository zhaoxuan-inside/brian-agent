import type {
  RelationDBAccess,
  Logger,
  Metrics,
  Report,
  LLMAccess,
} from '@brian-agent/base';
import { PROMPT_TEMPLATE_TABLE } from '@brian-agent/base';
import {
  LLMCoreAccess,
  SoulCoreAccess,
  SkillCoreAccess,
  MCPCoreAccess,
  AgentScoreThreshold,
} from '@brian-agent/core';
import type { AgentBuilderAccess as AgentBuilderAccessA, AgentLibraryAccess } from '@brian-agent/agent';
import {
  IdGenerator,
  Operator,
  newRecord,
  newPatch,
  ConfigService,
  renderTemplate,
  LLMContext,
  ExecLLMInput,
  ExecLLMOutput,
  EmbedLLMInput,
  EmbedLLMOutput,
  BusinessEvent,
} from '@brian-agent/base';
import {
  AgentBuilderContext,
  AgentLibraryContext,
  GetAgentInput,
  GetAgentOutput,
  BuildAgentInput,
  BuildAgentOutput,
  RecordAgentUsageInput,
  RecordAgentUsageOutput,
  DelAgentInput,
  DelAgentOutput,
  parseJsonObject,
} from '@brian-agent/agent';
import { rankCandidatesByBM25 } from './bm25';
import { DEFAULT_BUDGET_TOTAL } from '../../shared/types';
import {
  SoulCoreContext,
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
  KillErroredAgentInput,
  KillErroredAgentOutput,
  AgentDefRecord,
  AgentMode,
  AgentDefStatus,
  AgentMatchLayer,
  SnapshotToolEntry,
  RUNTIME_AGENT_DEF_TABLE,
  RUNTIME_AGENTS_CONFIG_TABLE,
} from '../domain/types';
import { SoSoulContentInput, SoSoulContentOutput } from '@brian-agent/core';

import { SYSTEM_SKILLS } from '../../SkillRuntime';

interface AgentRecordLike {
  agent_id: string;
  agent_name?: string;
  agent_purpose?: string;
  soul_id?: string;
  skill_ids?: string[];
  mcp_ids?: string[];
  prompt_template_id?: string;
  model_id?: string;
}

interface AgentBindingRow {
  agent_id: string;
  soul_id: string;
  skill_ids_json: string;
  mcp_ids_json: string;
  prompt_template_id?: string;
  agent_purpose: string;
}

type AgentRowFull = AgentBindingRow;

const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

const DEFAULT_VECTOR_THRESHOLD = 0.85;

const LLM_SCORE_DEFAULT = AgentScoreThreshold.Default;

export interface AgentDefComponents {
  agentBuilder: AgentBuilderAccessA;

  agentLibrary?: AgentLibraryAccess;
  llmCore?: LLMCoreAccess;
  soulCore?: SoulCoreAccess;
  skillCore?: SkillCoreAccess;
  mcpCore?: MCPCoreAccess;
}

export class AgentDefService {
  private similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD;
  private readonly config: ConfigService;

  private readonly agentBindingCache = new Map<string, AgentBindingRow>();
  private agentBindingCacheUpdatedAt = 0;

  private activeDefsCache: AgentDefRecord[] = [];
  private activeDefsCacheUpdatedAt = 0;

  private readonly defEmbeddingCache = new Map<string, number[]>();

  private vectorThreshold = DEFAULT_VECTOR_THRESHOLD;

  private static readonly ASSET_CACHE_TTL_MS = 30_000;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llm: LLMAccess,
    private readonly components: AgentDefComponents,
    private readonly logger?: Logger,
  ) {
    this.config = new ConfigService(relationDb, RUNTIME_AGENTS_CONFIG_TABLE);
  }

  async initialize(): Promise<void> {
    const threshold = await this.config.getString('match_similarity_threshold', '');
    if (threshold) {
      this.similarityThreshold = Number(threshold) || DEFAULT_SIMILARITY_THRESHOLD;
    }

    const vectorThreshold = await this.config.getString('match_vector_threshold', '');
    if (vectorThreshold) {
      const parsed = Number(vectorThreshold);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1) {
        this.vectorThreshold = parsed;
      }
    }
    await this.warmAssetCaches();
    this.logger?.debug?.(`AgentDefService 初始化完成（agent 绑定=${this.agentBindingCache.size}, active def=${this.activeDefsCache.length}）`);
  }

  private async warmAssetCaches(): Promise<void> {
    try {
      const agentRows = await this.relationDb.queryRaw<AgentRowFull>(
        'SELECT "agent_id", "soul_id", "skill_ids_json", "mcp_ids_json", "prompt_template_id", "agent_purpose" FROM "agent"',
        [],
      );
      this.agentBindingCache.clear();
      for (const row of agentRows ?? []) {
        this.agentBindingCache.set(String(row.agent_id), {
          agent_id: String(row.agent_id ?? ''),
          soul_id: String(row.soul_id ?? ''),
          skill_ids_json: String(row.skill_ids_json ?? '[]'),
          mcp_ids_json: String(row.mcp_ids_json ?? '[]'),
          prompt_template_id: String(row.prompt_template_id ?? ''),
          agent_purpose: String(row.agent_purpose ?? ''),
        });
      }
      this.agentBindingCacheUpdatedAt = Date.now();
    } catch (err) {

      this.logger?.warn?.('AgentDefService.warmAssetCaches agent 绑定缓存预热失败，回退按需读库', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      this.activeDefsCache = await this.loadActiveDefs();
      this.activeDefsCacheUpdatedAt = Date.now();
    } catch (err) {

      this.logger?.warn?.('AgentDefService.warmAssetCaches active def 缓存预热失败，回退 TTL 按需重读', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  invalidateAgentBindingCache(): void {
    this.agentBindingCache.clear();
    this.agentBindingCacheUpdatedAt = 0;
  }

  private async soAgentBinding(agentRef: string): Promise<AgentBindingRow | null> {
    if (agentRef && this.agentBindingCacheUpdatedAt > Date.now() - AgentDefService.ASSET_CACHE_TTL_MS) {
      const hit = this.agentBindingCache.get(agentRef);
      if (hit) {
        return hit;
      }
    }
    try {
      const row = (await this.relationDb.selectOne('agent', [
        { field: 'agent_id', operator: Operator.EQ, value: agentRef },
      ])) as Record<string, unknown> | null;
      if (!row) {
        return null;
      }
      const binding: AgentBindingRow = {
        agent_id: String(row.agent_id ?? ''),
        soul_id: String(row.soul_id ?? ''),
        skill_ids_json: String(row.skill_ids_json ?? '[]'),
        mcp_ids_json: String(row.mcp_ids_json ?? '[]'),
        prompt_template_id: String(row.prompt_template_id ?? ''),
        agent_purpose: String(row.agent_purpose ?? ''),
      };
      this.agentBindingCache.set(agentRef, binding);
      return binding;
    } catch {

      return null;
    }
  }

  private async loadActiveDefs(): Promise<AgentDefRecord[]> {
    const rows = await this.relationDb.select(RUNTIME_AGENT_DEF_TABLE, {
      conditions: [{ field: 'status', operator: Operator.EQ, value: 'active' }],
    });
    return rows.map((row) => this.toDefRecord(row));
  }

  private async soActiveDefsCached(): Promise<AgentDefRecord[]> {
    if (
      this.activeDefsCache.length
      && this.activeDefsCacheUpdatedAt > Date.now() - AgentDefService.ASSET_CACHE_TTL_MS
    ) {
      return this.activeDefsCache;
    }
    this.activeDefsCache = await this.loadActiveDefs();
    this.activeDefsCacheUpdatedAt = Date.now();

    this.defEmbeddingCache.clear();
    return this.activeDefsCache;
  }

  async matchAgentDef(input: MatchAgentDefInput, output: MatchAgentDefOutput, _context: AgentDefContext, _metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    if (!input.task_content) {
      output.error = 'task_content 不能为空';
      output.error_code = 'VALIDATION_ERROR';
      return false;
    }
    const defs = await this.soActiveDefs();
    if (this.tryMatchDirect(input, defs, output, report)) {
      return true;
    }

    if (input.force_new !== true && defs.length > 0) {
      const matchRes = await this.matchCascaded(input, defs, _metrics, report);
      if (matchRes) {
        output.def_id = matchRes.def.id;
        output.matched_by = matchRes.layer;
        output.def = matchRes.def;
        return true;
      }
    }
    return this.buildAndAssignNewDef(input, output, _metrics, report);
  }

  private tryMatchDirect(input: MatchAgentDefInput, defs: AgentDefRecord[], output: MatchAgentDefOutput, report?: Report): boolean {
    const referred = input.agent_ref ? this.soDefByAgentRef(defs, input.agent_ref) : null;
    if (referred) {
      output.def_id = referred.id;
      output.matched_by = AgentMatchLayer.Exact;
      output.def = referred;
      report?.pushBusinessEvent(BusinessEvent.AgentSelected, {
        def_id: referred.id,
        agent_name: referred.name,
        matched_by: 'ref',
      });
      return true;
    }
    const exact = this.soExactMatch(defs, input.task_content, input.task_domain);
    if (exact) {
      output.def_id = exact.id;
      output.matched_by = AgentMatchLayer.Exact;
      output.def = exact;
      return true;
    }
    return false;
  }

  private async matchCascaded(
    input: MatchAgentDefInput, defs: AgentDefRecord[], metrics?: Metrics, report?: Report,
  ): Promise<{ def: AgentDefRecord; layer: AgentMatchLayer } | null> {
    const bm25Candidates = await this.filterByBM25(input.task_content, defs, report);
    if (bm25Candidates.length === 0) {
      return null;
    }

    const vectorRes = await this.filterByVector(input, bm25Candidates, metrics, report);
    if (vectorRes.directHit) {
      return { def: vectorRes.directHit, layer: AgentMatchLayer.Vector };
    }
    if (vectorRes.candidates.length === 0) {
      return null;
    }

    const llmHit = await this.soLLMRankedDef(input, vectorRes.candidates, metrics, report);
    if (llmHit) {
      return { def: llmHit, layer: AgentMatchLayer.LLM };
    }
    return null;
  }

  private async filterByBM25(taskContent: string, defs: AgentDefRecord[], report?: Report): Promise<AgentDefRecord[]> {
    const threshold = await this.soMatchBm25Threshold();
    const docs = defs.map((d) => ({
      id: d.id,
      text: `${d.name} ${d.agent_purpose || ''} ${d.task_signature || ''}`.trim(),
    }));
    const ranked = rankCandidatesByBM25(taskContent, docs, threshold);
    if (ranked.length === 0) {
      report?.pushBusinessEvent(BusinessEvent.IntentAnalyzed, {
        score: 0,
        reason: `BM25 粗筛无候选得分达到阈值（${threshold}），直接走新建 Agent 流程`,
        candidates_count: 0,
        adopted: false,
        matched_via: 'bm25',
      });
      return [];
    }
    const hitIds = new Set(ranked.map((r) => r.id));
    return defs.filter((d) => hitIds.has(d.id));
  }

  private async filterByVector(
    input: MatchAgentDefInput, defs: AgentDefRecord[], metrics?: Metrics, report?: Report,
  ): Promise<{ directHit: AgentDefRecord | null; candidates: AgentDefRecord[] }> {
    const query = await this.soTaskEmbedding(input, metrics);
    if (query.length === 0) {
      return { directHit: null, candidates: defs };
    }
    const vectorThreshold = (await this.soMatchVectorThreshold()) / 100;
    const directAdoptThreshold = this.vectorThreshold;
    let bestHit: AgentDefRecord | null = null;
    let bestScore = 0;
    const qualified: AgentDefRecord[] = [];

    for (const def of defs) {
      const defEmb = await this.soDefEmbedding(def, input, metrics);
      if (defEmb.length === 0) continue;
      const sim = AgentDefService.cosineSimilarity(query, defEmb);
      if (sim >= vectorThreshold) qualified.push(def);
      if (sim > bestScore && sim >= directAdoptThreshold) {
        bestScore = sim;
        bestHit = def;
      }
    }
    if (bestHit) {
      report?.pushBusinessEvent(BusinessEvent.IntentAnalyzed, {
        score: Math.round(bestScore * 100),
        reason: `向量余弦相似度（${bestScore.toFixed(2)} ≥ 阈值 ${directAdoptThreshold}）高置信命中，直接采纳`,
        agent_id: bestHit.agent_ref || bestHit.id,
        agent_name: bestHit.name,
        adopted: true,
        candidates_count: defs.length,
        matched_via: 'vector',
      });
      return { directHit: bestHit, candidates: [] };
    }
    return { directHit: null, candidates: qualified };
  }

  private async soActiveDefs(): Promise<AgentDefRecord[]> {
    return this.soActiveDefsCached();
  }

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

  private soDefByAgentRef(defs: AgentDefRecord[], agentRef: string): AgentDefRecord | null {
    return defs.find((def) => def.agent_ref === agentRef || def.id === agentRef) ?? null;
  }

  private soCandidateProfiles(defs: AgentDefRecord[]): Array<Record<string, unknown>> {
    return defs.map((def) => ({
      agent_id: def.agent_ref || def.id,
      agent_name: def.name,
      description: def.agent_purpose || def.task_signature || '',
    }));
  }

  private parseDefTools(def: AgentDefRecord): { skills: string[]; mcps: string[] } {
    if (!def.tools_json) {
      return { skills: [], mcps: [] };
    }
    const parsed = parseJsonObject(def.tools_json);
    const skills = Array.isArray(parsed?.skills) ? (parsed!.skills as unknown[]).map(String) : [];
    const mcps = Array.isArray(parsed?.mcps) ? (parsed!.mcps as unknown[]).map(String) : [];
    return { skills, mcps };
  }

  private uniqueJoin(ids: string[], extra: string[]): string[] {
    const set = new Set<string>();
    for (const raw of [...ids, ...extra]) {
      const v = String(raw ?? '').trim();
      if (v) {
        set.add(v);
      }
    }
    return [...set];
  }

  private soNamesByIds(ids: string[], table: string, nameCol: string, fallbackCol: string): string[] {
    if (!ids.length) {
      return [];
    }
    try {
      const placeholders = ids.map(() => '?').join(',');
      const rows = this.relationDb.queryRaw<Record<string, unknown>>(
        `SELECT "id", "${nameCol}" AS "n1", "${fallbackCol}" AS "n2" FROM "${table}" WHERE "id" IN (${placeholders})`,
        ids,
      ) ?? [];
      const list: string[] = [];
      for (const row of rows) {
        const name = String(row.n1 ?? '').trim();
        const fallback = String(row.n2 ?? '').trim();
        list.push(name || fallback || String(row.id ?? ''));
      }
      return list;
    } catch {
      return [];
    }
  }

  private soExactMatch(defs: AgentDefRecord[], taskContent: string, domain?: string): AgentDefRecord | null {
    const signature = this.buildSignature(taskContent, domain);
    return defs.find((def) => def.task_signature && def.task_signature === signature) ?? null;
  }

  private async soVectorRankedDef(input: MatchAgentDefInput, defs: AgentDefRecord[], metrics?: Metrics, report?: Report,
  ): Promise<{ def: AgentDefRecord; score: number } | null> {
    if (input.force_new === true) {
      return null;
    }
    const query = await this.soTaskEmbedding(input, metrics);
    if (query.length === 0) {
      return null;
    }
    let best: AgentDefRecord | null = null;
    let bestScore = 0;
    for (const def of defs) {
      const defEmb = await this.soDefEmbedding(def, input, metrics);
      if (defEmb.length === 0) {
        continue;
      }
      const sim = AgentDefService.cosineSimilarity(query, defEmb);
      if (sim > bestScore) {
        best = def;
        bestScore = sim;
      }
    }
    if (!best || !(bestScore >= this.vectorThreshold)) {
      this.logger?.debug?.('向量召回未达标（回退 LLM 裁判）', {
        best_score: Number(bestScore.toFixed(4)),
        threshold: this.vectorThreshold,
        candidates: defs.length,
      });
      return null;
    }
    this.logger?.debug?.('向量召回命中（跳过 LLM 裁判）', {
      def_id: best.id,
      score: Number(bestScore.toFixed(4)),
      threshold: this.vectorThreshold,
    });
    report?.pushBusinessEvent(BusinessEvent.IntentAnalyzed, {
      score: Math.round(bestScore * 100),
      reason: `向量召回命中（余弦相似度 ${bestScore.toFixed(2)} ≥ 阈值 ${this.vectorThreshold}），直接采纳既有 Agent，跳过 LLM 意图打分`,
      agent_id: best.agent_ref || best.id,
      agent_name: best.name,
      adopted: true,
      candidates_count: defs.length,
      matched_via: 'vector',
    });
    return { def: best, score: bestScore };
  }

  private async soTaskEmbedding(input: MatchAgentDefInput, metrics?: Metrics): Promise<number[]> {
    const output = new EmbedLLMOutput();
    try {
      const ok = await this.llm.embedLLM(Object.assign(new EmbedLLMInput(), {
        input: (input.task_content ?? '').slice(0, 256),
        session_id: input.session_id ?? '',
        run_id: input.run_id ?? '',
        work_id: input.work_id ?? '',
        caller: 'AgentDefService.matchAgentDef.vector',
      }), output, new LLMContext(), metrics);
      if (ok && output.embedding.length > 0) {
        return output.embedding;
      }
    } catch {  }
    return [];
  }

  private async soDefEmbedding(def: AgentDefRecord, input: MatchAgentDefInput, metrics?: Metrics): Promise<number[]> {
    const cached = this.defEmbeddingCache.get(def.id);
    if (cached && cached.length > 0) {
      return cached;
    }
    const text = this.defEmbedText(def);
    if (!text) {
      return [];
    }
    const output = new EmbedLLMOutput();
    try {
      const ok = await this.llm.embedLLM(Object.assign(new EmbedLLMInput(), {
        input: text.slice(0, 256),
        session_id: input.session_id ?? '',
        run_id: input.run_id ?? '',
        work_id: input.work_id ?? '',
        caller: 'AgentDefService.matchAgentDef.vector',
      }), output, new LLMContext(), metrics);
      if (ok && output.embedding.length > 0) {
        this.defEmbeddingCache.set(def.id, output.embedding);
        return output.embedding;
      }
    } catch {  }
    return [];
  }

  private defEmbedText(def: AgentDefRecord): string {
    return `${def.name} ${def.agent_purpose || def.task_signature || ''}`.trim();
  }

  private static cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  private buildSignature(taskContent: string, domain?: string): string {
    const d = (domain ?? '').trim() || 'general';
    return `[${d}] ${(taskContent ?? '').slice(0, 256)}`;
  }

  private async soLLMRankedDef(input: MatchAgentDefInput, defs: AgentDefRecord[], metrics?: Metrics, report?: Report): Promise<AgentDefRecord | null> {
    const adoptThreshold = await this.soMatchScoreThreshold();
    const candidates = JSON.stringify(this.soCandidateProfiles(defs));
    const matchPromptId = await this.soMatchPromptTemplateId();
    const prompt = await this.renderMatchPrompt(matchPromptId, { task_content: input.task_content, candidates });

    report?.pushBusinessEvent(BusinessEvent.IntentStarted, { candidates_count: defs.length });
    const execInput = new ExecLLMInput();
    execInput.prompt = prompt;
    execInput.max_tokens = await this.soMatchMaxTokens();
    if (!(await this.soMatchEnableThinking())) {
      execInput.extra = { thinking: { type: 'disabled' }, enable_thinking: false };
    }
    execInput.session_id = input.session_id ?? '';
    execInput.run_id = input.run_id ?? '';
    execInput.work_id = input.work_id ?? '';
    execInput.caller = 'AgentDefService.matchAgentDef';
    const execOutput = new ExecLLMOutput();

    const ok = await this.llm.execLLM(execInput, execOutput, new LLMContext(), metrics, report);
    if (!ok || !execOutput.result) {
      return null;
    }
    return this.parseAndEvaluateLLMResult(execOutput.result, defs, adoptThreshold, report);
  }

  private parseAndEvaluateLLMResult(
    result: string, defs: AgentDefRecord[], adoptThreshold: number, report?: Report,
  ): AgentDefRecord | null {
    const parsed = parseJsonObject(result);
    if (!parsed) return null;
    const parsedScore = Number(parsed.score ?? 0);
    const score = parsedScore > 0 && parsedScore <= 1 ? Math.round(parsedScore * 100) : Math.round(parsedScore);
    const reason = String(parsed.reason ?? '');
    const agentRef = String(parsed.agent_id ?? '');
    const matchedDef = defs.find((def) => def.agent_ref === agentRef || def.id === agentRef) ?? null;
    report?.pushBusinessEvent(BusinessEvent.IntentAnalyzed, {
      score, reason: reason.slice(0, 1000), agent_id: agentRef, agent_name: matchedDef?.name ?? '',
      adopted: score >= adoptThreshold, candidates_count: defs.length, matched_via: 'llm',
    });
    return score >= adoptThreshold ? matchedDef : null;
  }

  private async soMatchPromptTemplateId(): Promise<string> {
    try {
      const rows = this.relationDb.queryRaw<{ prompt_template_id: string }>(
        'SELECT "prompt_template_id" FROM "agent_library_config" LIMIT 1',
        [],
      );
      if (rows?.[0]?.prompt_template_id) return String(rows[0].prompt_template_id);
    } catch {  }

    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.EQ, value: 'Agent 匹配评估' },
    ]);
    if (row && row.id) return String(row.id);
    return '';
  }

  private async buildAndAssignNewDef(
    input: MatchAgentDefInput, output: MatchAgentDefOutput, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const built = await this.buildNewDef(input, metrics, report);
    if (!built) {
      output.error = 'Agent 构建失败';
      output.error_code = 'BUILD_ERROR';
      return false;
    }
    output.def_id = built.id;
    output.matched_by = AgentMatchLayer.Built;
    output.def = built;
    return true;
  }

  private async buildNewDef(input: MatchAgentDefInput, metrics?: Metrics, report?: Report): Promise<AgentDefRecord | null> {
    try {
      const buildInput = new BuildAgentInput();
      buildInput.run_id = input.run_id ?? '';
      buildInput.task_content = input.task_content;
      buildInput.task_domain = input.task_domain;
      buildInput.force_new = true;
      const buildOutput = new BuildAgentOutput();
      const ctx = this.prepareBuilderContext(input);
      const ok = await this.components.agentBuilder.buildAgent(buildInput, buildOutput, ctx, metrics, report);
      if (!ok || !buildOutput.agent_id) {
        return null;
      }
      const def = await this.insertDefFromAgent(buildOutput.agent_id, input);
      if (!def) {
        return null;
      }
      report?.pushBusinessEvent(BusinessEvent.AgentBuilt, {
        agent_id: buildOutput.agent_id,
        def_id: def.id,
        name: def.name,
        purpose: String(def.agent_purpose ?? '').slice(0, 500),
        task_signature: def.task_signature,
      });
      return def;
    } catch (err) {
      this.logger?.warn?.('buildNewDef 发生异常，已拦截', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  private prepareBuilderContext(input: MatchAgentDefInput): AgentBuilderContext {
    const ctx = new AgentBuilderContext();
    ctx.session_id = '';
    ctx.work_id = '';
    ctx.run_id = input.run_id ?? '';
    return ctx;
  }

  private async insertDefFromAgent(agentId: string, input: MatchAgentDefInput): Promise<AgentDefRecord | null> {
    const asset = await this.soAgentAsset(agentId);
    const binding = await this.soAgentBinding(agentId);
    const name = asset?.agent_name || '通用问答';
    const purpose = String(asset?.agent_purpose ?? '') || this.buildSignature(input.task_content, input.task_domain);
    const soulId = asset?.soul_id || binding?.soul_id || '';
    const promptTemplateId = asset?.prompt_template_id || binding?.prompt_template_id || '';
    const skillIds = asset?.skill_ids || (binding ? this.soJsonIdArray(binding.skill_ids_json) : []);
    const mcpIds = asset?.mcp_ids || (binding ? this.soJsonIdArray(binding.mcp_ids_json) : []);
    const toolsJson = (skillIds.length > 0 || mcpIds.length > 0) ? JSON.stringify({ skills: skillIds, mcps: mcpIds }) : '';

    const existing = await this.relationDb.selectOne(RUNTIME_AGENT_DEF_TABLE, [
      { field: 'agent_ref', operator: Operator.EQ, value: agentId },
    ]);
    if (existing) {
      await this.relationDb.update(RUNTIME_AGENT_DEF_TABLE, [
        { field: 'name', value: name },
        { field: 'agent_purpose', value: purpose },
        { field: 'prompt_template_id', value: promptTemplateId },
        { field: 'model_id', value: asset?.model_id || '' },
        { field: 'soul_id', value: soulId },
        { field: 'tools_json', value: toolsJson },
        { field: 'status', value: AgentDefStatus.Active },
        { field: 'updated', value: IdGenerator.now() },
      ], [
        { field: 'id', operator: Operator.EQ, value: existing.id },
      ]);
      this.activeDefsCacheUpdatedAt = 0;
      const row = await this.soDefRowById(String(existing.id));
      return row ? this.toDefRecord(row) : null;
    }

    const record = newRecord({
      name,
      mode: AgentMode.Primary,
      agent_ref: agentId,
      task_signature: this.buildSignature(input.task_content, input.task_domain),
      agent_purpose: purpose,
      prompt_template_id: promptTemplateId,
      model_id: asset?.model_id || '',
      soul_id: soulId,
      tools_json: toolsJson,
      budget_total: DEFAULT_BUDGET_TOTAL,
      status: AgentDefStatus.Active,
    });
    await this.relationDb.insert(RUNTIME_AGENT_DEF_TABLE, record);

    this.activeDefsCacheUpdatedAt = 0;
    const defId = String(record[0].value);
    const row = await this.soDefRowById(defId);
    return row ? this.toDefRecord(row) : null;
  }

  private async soAgentAsset(agentId: string): Promise<AgentRecordLike | null> {
    if (this.components.agentLibrary) {
      const input = new GetAgentInput();
      input.agent_id = agentId;
      const output = new GetAgentOutput();
      await this.components.agentLibrary.soAgent(input, output, new AgentLibraryContext());
      const hit = output.agents.find((agent) => agent.agent_id === agentId);
      if (hit) {
        return hit;
      }
    }

    return this.soAgentBinding(agentId);
  }

  private async soDefRowById(defId: string): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(RUNTIME_AGENT_DEF_TABLE, [
      { field: 'id', operator: Operator.EQ, value: defId },
    ]);
  }

  async soAgentSnapshot(
    input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, _context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    if (!input.def_id) {
      output.error = 'def_id 不能为空';
      output.error_code = 'VALIDATION_ERROR';
      return false;
    }
    const def = await this.soDefRow(input.def_id);
    if (!def) {
      output.error = `Agent 定义不存在: ${input.def_id}`;
      output.error_code = 'NOT_FOUND';
      return false;
    }

    report?.pushBusinessEvent(BusinessEvent.LlmSelected, { llm_id: def.model_id, llm_name: this.soComponentName(def.model_id, 'llm_available', 'llm_title') });
    const soulId = def.soul_id || (def.agent_ref ? (await this.soAgentBinding(def.agent_ref))?.soul_id : '') || '';
    const soulContent = soulId ? await this.soSoulContentById(soulId) : '';
    const tools = await this.soSnapshotTools(def, report);

    const system = await this.resolveSnapshotSystem(def, soulContent, tools, input.user_message ?? input.task_content, metrics);
    const templateId = def.prompt_template_id || await this.soDefaultIdentityTemplateId();
    this.fillSnapshotOutput(def, soulId, soulContent, tools, system, templateId, output, report);
    return true;
  }

  private async resolveSnapshotSystem(def: AgentDefRecord, soulContent: string, tools: SnapshotToolEntry[], userMsg?: string, metrics?: Metrics): Promise<string> {
    const systemSpan = metrics ? metrics.beginSpan('Runtime.Agents.AgentDefService.soAgentSnapshot.system') : undefined;
    const system = await this.prepareSystemPrompt(def, soulContent, tools, userMsg ?? '');
    if (metrics && systemSpan) metrics.endSpan(systemSpan);
    return system;
  }

  private fillSnapshotOutput(
    def: AgentDefRecord, soulId: string, soulContent: string, tools: SnapshotToolEntry[],
    system: string, templateId: string, output: SoAgentSnapshotOutput, report?: Report,
  ): void {
    output.snapshot = {
      def_id: def.id,
      name: def.name,
      system,
      llm_id: def.model_id,
      temperature: def.temperature,
      budget_total: def.budget_total,
      tools,
      meta: { soul_id: soulId || undefined, llm_id: def.model_id || undefined, matched_by: 'snapshot' },
    };
    report?.pushBusinessEvent(BusinessEvent.PromptSelected, {
      template_id: templateId,
      prompt_name: this.soComponentName(templateId, 'prompt_template', 'prompt_template_title'),
      system: system.slice(0, 4000),
      soul_selected: Boolean(soulId && soulContent),
      tools_count: tools.length,
    });
  }

  private async soDefRow(defId: string): Promise<AgentDefRecord | null> {
    const row = await this.relationDb.selectOne(RUNTIME_AGENT_DEF_TABLE, [
      { field: 'id', operator: Operator.EQ, value: defId },
    ]);
    if (!row) {
      return null;
    }
    return this.toDefRecord(row);
  }

  private soComponentName(id: string, table: string, nameCol: string): string {
    if (!id) return '';
    try {
      const rows = this.relationDb.queryRaw<Record<string, unknown>>(
        `SELECT "${nameCol}" AS "n" FROM "${table}" WHERE "id" = ? LIMIT 1`,
        [id],
      );
      const raw = rows?.[0]?.n;
      return raw != null ? String(raw).trim() : '';
    } catch {
      return '';
    }
  }

  private soSkillName(id: string): string {
    return this.soComponentName(id, 'skill', 'name') || this.soComponentName(id, 'skill', 'skill_brief');
  }

  private async soSoulContent(def: AgentDefRecord): Promise<string> {
    if (!def.soul_id) {
      return '';
    }
    return this.soSoulContentById(def.soul_id);
  }

  private async soSoulContentById(soulId: string): Promise<string> {
    if (!this.components.soulCore || typeof this.components.soulCore.soSoulContent !== 'function') {
      return '';
    }
    const input = new SoSoulContentInput();
    input.soul_id = soulId;
    const output = new SoSoulContentOutput();
    await this.components.soulCore.soSoulContent(input, output, new SoulCoreContext());
    return output.content;
  }

  private async soSnapshotTools(def: AgentDefRecord, _report?: Report): Promise<SnapshotToolEntry[]> {
    const systemEntries: SnapshotToolEntry[] = SYSTEM_SKILLS.map((s) => ({
      kind: 'skill' as const,
      id: s.id,
      brief: s.brief,
      system: true,
    }));
    let toolsJson = def.tools_json;
    if (!toolsJson && def.agent_ref) {
      const binding = await this.soAgentBinding(def.agent_ref);
      if (binding && (binding.skill_ids_json !== '[]' || binding.mcp_ids_json !== '[]')) {
        const skillIds = this.soJsonIdArray(binding.skill_ids_json);
        const mcpIds = this.soJsonIdArray(binding.mcp_ids_json);
        if (skillIds.length > 0 || mcpIds.length > 0) {
          toolsJson = JSON.stringify({ skills: skillIds, mcps: mcpIds });
        }
      }
    }
    if (!toolsJson) {
      return systemEntries;
    }
    const explicit = parseJsonObject(toolsJson);
    const entries = this.entriesFromExplicit(explicit);

    const systemIds = new Set(systemEntries.map((e) => e.id));
    const boundEntries = entries.filter((e) => e.kind === 'mcp' || !systemIds.has(e.id));
    return [...systemEntries, ...boundEntries];
  }

  private soJsonIdArray(raw?: string): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((x) => String(x)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  private entriesFromExplicit(explicit: Record<string, unknown> | null): SnapshotToolEntry[] {
    const entries: SnapshotToolEntry[] = [];
    const skills = Array.isArray(explicit?.skills) ? (explicit!.skills as string[]) : [];
    const mcps = Array.isArray(explicit?.mcps) ? (explicit!.mcps as string[]) : [];
    for (const id of skills) {

      entries.push({ kind: 'skill', id, brief: '', system: id.startsWith('skill_builtin-') });
    }
    for (const id of mcps) {
      entries.push({ kind: 'mcp', id, brief: '' });
    }
    return entries;
  }

  private async prepareSystemPrompt(def: AgentDefRecord, soulContent: string, tools: SnapshotToolEntry[], userMessage: string): Promise<string> {
    const skills = tools.filter((t) => t.kind === 'skill');
    const mcps = tools.filter((t) => t.kind === 'mcp');
    const skillLines = skills
      .map((t) => `- ${t.id}：${t.brief || this.soSkillName(t.id)}`)
      .join('\n');
    const mcpLines = mcps
      .map((t) => `- mcp_exec（mcp_id: "${t.id}"）：${t.brief || this.soComponentName(t.id, 'mcp_install', 'mcp_title')}`)
      .join('\n');
    const directive = [
      `当前任务：${(userMessage ?? '').slice(0, 500)}`,
      skills.length ? `\n可用技能（Skill，以函数形式直接调用）：\n${skillLines}` : '',
      mcps.length ? `\n外部能力通道（MCP，经 mcp_exec 按参数调用）：\n${mcpLines}` : '',
    ].join('\n');
    const templateId = def.prompt_template_id || await this.soDefaultIdentityTemplateId();
    const system = await this.renderMatchPrompt(templateId, { soul: soulContent, task_directive: directive });
    this.logger?.debug?.('soAgentSnapshot.system', { head: system.slice(0, 400), template_id: templateId });
    return system;
  }

  private async soDefaultIdentityTemplateId(): Promise<string> {
    const identityRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.EQ, value: 'Brian 身份声明' },
      { field: 'is_system', operator: Operator.EQ, value: 1 },
    ]);
    if (identityRow && identityRow.id) return String(identityRow.id);
    const systemRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'is_system', operator: Operator.EQ, value: 1 },
    ]);
    if (systemRow && systemRow.id) return String(systemRow.id);
    return '';
  }

  private async soMatchScoreThreshold(): Promise<number> {
    try {
      const rows = this.relationDb.queryRaw<{ match_score_threshold: number }>(
        'SELECT "match_score_threshold" FROM "agent_library_config" LIMIT 1',
        [],
      );
      const value = Number(rows?.[0]?.match_score_threshold);
      if (Number.isFinite(value) && value > 0) return value;
    } catch {  }
    return this.config.getInt('match_score_threshold', LLM_SCORE_DEFAULT);
  }

  private async soMatchBm25Threshold(): Promise<number> {
    const val = await this.config.getInt('match_bm25_threshold', -1);
    if (val >= 0) return val;
    return this.config.getInt('agent_library.match_bm25_threshold', 50);
  }

  private async soMatchVectorThreshold(): Promise<number> {
    const val = await this.config.getInt('match_vector_threshold', -1);
    if (val >= 0) return val;
    return this.config.getInt('agent_library.match_vector_threshold', 50);
  }

  private async soMatchMaxTokens(): Promise<number> {
    const val = await this.config.getInt('match_max_tokens', -1);
    if (val > 0) return val;
    return this.config.getInt('agent_library.match_max_tokens', 512);
  }

  private async soMatchEnableThinking(): Promise<boolean> {
    const val = await this.config.getString('match_enable_thinking');
    if (val !== undefined) return val === 'true' || val === '1';
    return this.config.getBoolean('agent_library.match_enable_thinking', false);
  }

  private async renderMatchPrompt(templateId: string, variables: Record<string, unknown>): Promise<string> {
    if (!templateId) return '';
    try {
      const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
        { field: 'id', operator: Operator.EQ, value: templateId },
      ]);
      const template = row ? String(row['prompt_template'] ?? '') : '';
      if (!template) {
        return '';
      }
      return renderTemplate(template, variables);
    } catch {
      return '';
    }
  }

  async declareAgent(input: DeclareAgentInput, output: DeclareAgentOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.name) {
      output.error = 'name 不能为空';
      output.error_code = 'VALIDATION_ERROR';
      return false;
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

  async soAgentDefs(_input: SoAgentDefsInput, output: SoAgentDefsOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(RUNTIME_AGENT_DEF_TABLE, {
      order_by: [{ field: 'created', direction: 'DESC' }],
    });
    output.defs = rows.map((row) => this.toDefRecord(row));
    return true;
  }

  async configAgentDef(input: ConfigAgentDefInput, _output: ConfigAgentDefOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.match_similarity_threshold !== undefined) {
      this.similarityThreshold = input.match_similarity_threshold;
      await this.config.set('match_similarity_threshold', input.match_similarity_threshold, 'DOUBLE');
    }
    return true;
  }

  async killErroredAgent(input: KillErroredAgentInput, _output: KillErroredAgentOutput, _context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const agentRef = input.agent_ref;
    if (!agentRef) {
      return true;
    }

    if (this.components.agentLibrary) {
      await this.recordErroredUsage(agentRef, input, metrics);
    }

    await this.disableDefsByRef(agentRef, metrics);
    this.activeDefsCacheUpdatedAt = 0;

    const owned = await this.soAgentOwner(agentRef);
    if (owned.created_by === 'system' && this.components.agentLibrary) {
      await this.components.agentLibrary.delAgent(
        Object.assign(new DelAgentInput(), { ids: [owned.id] }),
        new DelAgentOutput(),
        new AgentLibraryContext(),
      );
    }
    report?.pushBusinessEvent(BusinessEvent.AgentDisbanded, {
      agent_id: agentRef,
      reason: 'run_error',
      deleted: owned.created_by === 'system',
      trace_id: input.trace_id ?? '',
      error: (input.error ?? '').slice(0, 300),
    });
    return true;
  }

  private async recordErroredUsage(agentRef: string, input: KillErroredAgentInput, metrics?: Metrics): Promise<void> {
    try {
      const agent = await this.soAgentAsset(agentRef);
      if (!agent || !this.components.agentLibrary) {
        return;
      }
      await this.components.agentLibrary.recordAgentUsage(
        Object.assign(new RecordAgentUsageInput(), {
          agent_id: agentRef,
          work_id: input.work_id ?? '',
          run_id: input.run_id ?? '',
          usage_context: JSON.stringify({
            trace_id: input.trace_id,
            task_content: (input.task_content ?? '').slice(0, 500),
            agent_output: '',
            run_error: true,
            error: (input.error ?? '').slice(0, 300),
          }),
        }, input),
        new RecordAgentUsageOutput(),
        new AgentLibraryContext(),
      );
    } catch (err) {

      metrics?.warn('AgentDefService.recordErroredUsage 错误 usage 落账失败（不阻断杀死）', {
        error: err instanceof Error ? err.message : String(err),
        agent_id: agentRef,
      });
    }
  }

  private async disableDefsByRef(agentBizId: string, metrics?: Metrics): Promise<void> {
    try {
      await this.relationDb.update(RUNTIME_AGENT_DEF_TABLE, newPatch({
        status: AgentDefStatus.Disabled,
        updated: IdGenerator.now(),
      }), [{ field: 'agent_ref', operator: Operator.EQ, value: agentBizId }]);
    } catch (err) {

      metrics?.warn('AgentDefService.disableDefsByRef 停用 def 失败（该 agent 可能仍被匹配）', {
        error: err instanceof Error ? err.message : String(err),
        agent_id: agentBizId,
      });
    }
  }

  private async soAgentOwner(agentBizId: string): Promise<{ id: string; created_by: string }> {
    try {
      const rows = await this.relationDb.queryRaw<{ id: string; created_by: string }>(
        `SELECT "id", "created_by" FROM "agent" WHERE "agent_id" = ? LIMIT 1`,
        [agentBizId],
      );
      const row = rows?.[0];
      if (row) {
        return { id: String(row.id), created_by: String(row.created_by ?? 'user') };
      }
    } catch {  }
    return { id: '', created_by: 'user' };
  }
}
