import type {
  RelationDBAccess,
  Logger,
  Metrics,
  Report,
  LLMAccess,
} from '@brian-agent/base';
import { PROMPT_TEMPLATE_TABLE, soAgentDisplayName } from '@brian-agent/base';
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
import {
  funnelBm25Ranking,
  funnelSemanticRouterRanking,
  batchGetDualExampleEmbeddings,
  analyzeTaskComplexity,
  runComponentElection,
  standardTierLadder,
  applySignalScores,
  DEFAULT_ELECTION_THRESHOLDS,
  type FunnelRankingEntry,
  type ComponentElectionAdapter,
  type ElectionCandidate,
  type ElectionSignals,
  type ElectionThresholds,
  type ElectionReuseHit,
  AGENT_EXAMPLE_EMBEDDING_TABLE,
} from '@brian-agent/base';
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
  SweepDefHealthInput,
  SweepDefHealthOutput,
  type DefHealthReport,
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
      // ADR-012:agent_record 列规范化(title/brief/type),agent_id 业务键由 id 承接
      const agentRows = await this.relationDb.queryRaw<{ id: string; soul_id: string; skill_ids_json: string; mcp_ids_json: string; prompt_template_id: string; brief: string }>(
        'SELECT "id", "soul_id", "skill_ids_json", "mcp_ids_json", "prompt_template_id", "brief" FROM "agent_record"',
        [],
      );
      this.agentBindingCache.clear();
      for (const row of agentRows ?? []) {
        this.agentBindingCache.set(String(row.id), {
          agent_id: String(row.id ?? ''),
          soul_id: String(row.soul_id ?? ''),
          skill_ids_json: String(row.skill_ids_json ?? '[]'),
          mcp_ids_json: String(row.mcp_ids_json ?? '[]'),
          prompt_template_id: String(row.prompt_template_id ?? ''),
          agent_purpose: String(row.brief ?? ''),
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
      // ADR-012:agent_record 列规范化,id 承接业务键
      const row = (await this.relationDb.selectOne('agent_record', [
        { field: 'id', operator: Operator.EQ, value: agentRef },
      ])) as Record<string, unknown> | null;
      if (!row) {
        return null;
      }
      const binding: AgentBindingRow = {
        agent_id: String(row.id ?? ''),
        soul_id: String(row.soul_id ?? ''),
        skill_ids_json: String(row.skill_ids_json ?? '[]'),
        mcp_ids_json: String(row.mcp_ids_json ?? '[]'),
        prompt_template_id: String(row.prompt_template_id ?? ''),
        agent_purpose: String(row.brief ?? ''),
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
    const healthy: AgentDefRecord[] = [];
    for (const row of rows) {
      const def = this.toDefRecord(row);
      const health = await this.validateDefHealth(def);
      if (health.healthy) {
        healthy.push(def);
        continue;
      }
      // 缓存刷新点守卫：组件失效的 def 停用出池，选举/精准匹配不再命中（孤儿/悬挂绑定自动出清）
      await this.disableDef(def, health.issues.join('；'));
    }
    return healthy;
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

    // ① 复用判定：显式指定 agent_ref 直接命中（会话继承由 RunGateway 上游完成）
    const referred = input.agent_ref ? this.soDefByAgentRef(defs, input.agent_ref) : null;
    if (referred) {
      output.def_id = referred.id;
      output.matched_by = AgentMatchLayer.Exact;
      output.def = referred;
      output.mechanisms = [{ mechanism: 'direct', adopted: true, candidates: [{ id: referred.id, name: referred.name }] }];
      report?.emit(BusinessEvent.AgentSelected, {
        agent_id: referred.id,
        agent_name: soAgentDisplayName(referred.name),
        matched_by: 'ref',
        reason: '请求显式指定 agent_ref，精准直连会话目标 Agent',
        mechanisms: output.mechanisms,
      });
      return true;
    }

    // ②③ 统一选举：信号提取 + 分级候选集阶梯（R8 chg-058）
    if (input.force_new !== true && defs.length > 0) {
      const adapter = this.agentElectionAdapter(input, output, defs, _metrics, report);
      await runComponentElection(adapter, input, output);
      if (output.def_id) return true;
    }

    // ④ 终端：创建新的 AgentDef（规格 3.2.2）
    return this.buildAndAssignNewDef(input, output, _metrics, report);
  }

  /** Agent 选举适配器（单选择优；终端=构建新 AgentDef） */
  private agentElectionAdapter(
    input: MatchAgentDefInput, output: MatchAgentDefOutput, defs: AgentDefRecord[],
    metrics?: Metrics, report?: Report,
  ): ComponentElectionAdapter<AgentDefRecord> {
    return {
      component: 'agent',
      multiSelect: false,
      directAdoptSingle: false,
      findReusable: async () => this.agentFindReusableBySignature(input, defs),
      extractSignals: () => this.agentExtractSignals(input, defs, metrics, report),
      tiers: () => standardTierLadder(),
      select: async (_i, _o, picked, tier) => {
        const def = picked[0].doc;
        output.def_id = def.id;
        output.matched_by = AgentMatchLayer.Vector;
        output.def = def;
        output.mechanisms = [{
          mechanism: 'vector',
          label: `统一选举 ${tier.label}`,
          adopted: true,
          candidates: [{ id: def.id, name: def.name, score: Math.round(picked[0].vectorScore) }],
        }];
        report?.emit(BusinessEvent.AgentSelected, {
          agent_id: def.agent_ref || def.id,
          agent_name: soAgentDisplayName(def.name),
          matched_by: 'election',
          reason: `统一选举 ${tier.label} 命中（综合得分 ${Math.round(picked[0].vectorScore)}）`,
          mechanisms: output.mechanisms,
        });
        return true;
      },
      exhaust: () => this.buildAndAssignNewDef(input, output, metrics, report),
    };
  }

  /** 复用判定（规格①）：任务签名与既有 def 完全一致 → 直接复用（同任务同 def，防定义膨胀） */
  private agentFindReusableBySignature(input: MatchAgentDefInput, defs: AgentDefRecord[]): ElectionReuseHit<AgentDefRecord> | null {
    if (input.force_new === true) return null;
    const signature = this.buildSignature(input.task_content, input.task_domain);
    if (!signature) return null;
    const hit = defs.find((d) => d.task_signature && d.task_signature === signature);
    if (!hit) return null;
    return { label: '任务签名复用（事实源）', items: [{
      id: hit.id, label: hit.name, doc: hit,
      bm25Score: 100, vectorScore: 100, exampleSim: 0, negativeSim: 0, rejectedByNegative: false,
    }] };
  }

  /** 信号提取（并行）：合法集 + BM25/语义路由双通道；结构信号弃权（策略复杂度接线为后续任务卡） */
  private async agentExtractSignals(
    input: MatchAgentDefInput, defs: AgentDefRecord[], metrics?: Metrics, report?: Report,
  ): Promise<ElectionSignals<AgentDefRecord>> {
    const thresholds: ElectionThresholds = {
      ...DEFAULT_ELECTION_THRESHOLDS,
      bm25: await this.soMatchBm25Threshold(),
      vectorOverall: Math.round((await this.soMatchVectorThreshold())),
    };
    const docs = defs.map((d) => ({
      id: d.id,
      name: d.name,
      brief: `${d.agent_purpose || ''} ${d.task_signature || ''}`.trim(),
    }));
    const query = await this.soTaskEmbedding(input, metrics);
    const [bm25Ranking, vectorRanking] = await Promise.all([
      Promise.resolve(funnelBm25Ranking(input.task_content ?? '', docs)),
      this.agentVectorSignal(query, defs, docs, input, metrics, report),
    ]);
    const docOf = new Map(defs.map((d) => [d.id, d]));
    const candidates: ElectionCandidate<AgentDefRecord>[] = docs.map((d) => ({
      id: d.id, label: d.name || d.id, doc: docOf.get(d.id) as AgentDefRecord,
      bm25Score: 0, vectorScore: 0, exampleSim: 0, negativeSim: 0, rejectedByNegative: false,
    }));
    applySignalScores(candidates, bm25Ranking, vectorRanking);
    return { candidates, complexity: analyzeTaskComplexity({ text: input.task_content ?? '' }), structureIds: new Set<string>(), thresholds };
  }

  /** 向量信号（并行支路）：语义路由器（描述向量+正/负范例向量，范例挂 agent_ref）全量排序 */
  private async agentVectorSignal(
    query: number[], defs: AgentDefRecord[], docs: Array<{ id: string; name: string; brief: string }>,
    input: MatchAgentDefInput, metrics?: Metrics, report?: Report,
  ): Promise<FunnelRankingEntry<{ id: string; name: string; brief: string }>[]> {
    if (!query || query.length === 0) return [];
    const targetIds = defs.map((d) => d.agent_ref || d.id).filter(Boolean);
    const [embeddings, dualExamples] = await Promise.all([
      Promise.all(defs.map((def) => this.soDefEmbedding(def, input, metrics))),
      batchGetDualExampleEmbeddings({
        relationDb: this.relationDb,
        table: AGENT_EXAMPLE_EMBEDDING_TABLE,
        targetIdField: 'agent_id',
        targetIds,
      }),
    ]);
    const precomputed = new Map<string, number[]>();
    defs.forEach((def, i) => {
      const emb = embeddings[i];
      if (emb && emb.length > 0) precomputed.set(def.id, emb);
    });
    const embOf = new Map(defs.map((def, i) => [def.id, embeddings[i]]));
    const ranking = await funnelSemanticRouterRanking(
      query, docs,
      async (d) => embOf.get(d.id) ?? [],
      precomputed,
      dualExamples.positiveMap,
      dualExamples.negativeMap,
    );
    report?.emit(BusinessEvent.IntentAnalyzed, {
      score: ranking[0]?.score ?? 0,
      reason: '统一选举向量信号：语义路由器全量排序完成',
      candidates_count: defs.length,
      matched_via: 'vector',
    });
    return ranking;
  }

  private async soActiveDefs(): Promise<AgentDefRecord[]> {
    return this.soActiveDefsCached();
  }

  private toDefRecord(row: Record<string, unknown>): AgentDefRecord {
    return {
      id: String(row.id),
      name: String(row.title ?? row.name ?? ''),
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
    return defs.map((def) => {
      const tools = this.parseDefTools(def);
      return {
        agent_id: def.agent_ref || def.id,
        agent_name: def.name,
        description: def.agent_purpose || def.task_signature || '',
        capabilities: {
          skills: tools.skills,
          mcps: tools.mcps,
          bound_count: tools.skills.length + tools.mcps.length,
        },
      };
    });
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

  private parseAndEvaluateLLMResult(
    result: string, defs: AgentDefRecord[], adoptThreshold: number, report?: Report,
    trail?: NonNullable<MatchAgentDefOutput['mechanisms']>,
  ): AgentDefRecord | null {
    const parsed = parseJsonObject(result);
    if (!parsed) return null;
    const parsedScore = Number(parsed.score ?? 0);
    const score = parsedScore > 0 && parsedScore <= 1 ? Math.round(parsedScore * 100) : Math.round(parsedScore);
    const reason = String(parsed.reason ?? '');
    const agentRef = String(parsed.agent_id ?? '');
    const matchedDef = defs.find((def) => def.agent_ref === agentRef || def.id === agentRef)
      ?? defs.find((def) => def.name && parsed.agent_name && def.name === String(parsed.agent_name))
      ?? null;
    if (score >= adoptThreshold && !matchedDef) {
      report?.emit(BusinessEvent.IntentAnalyzed, {
        score, adopted: false, agent_id: agentRef, agent_name: String(parsed.agent_name ?? ''),
        reason: `LLM 采纳得分 ${score} 但返回的 agent_id 无法解析到运行时 Agent（已尝试 agent_ref/id/name 回退），转构建流程`,
        candidates_count: defs.length, matched_via: 'llm_resolve_failed',
      });
      return null;
    }
    report?.emit(BusinessEvent.IntentAnalyzed, {
      score, reason: reason.slice(0, 1000), agent_id: agentRef, agent_name: matchedDef?.name ?? '',
      adopted: score >= adoptThreshold, candidates_count: defs.length, matched_via: 'llm',
    });
    trail?.push({
      mechanism: 'llm',
      adopted: score >= adoptThreshold && !!matchedDef,
      candidates: [{ id: agentRef, name: matchedDef?.name, score, reason: reason.slice(0, 200) }],
    });
    return score >= adoptThreshold ? matchedDef : null;
  }

  private async soMatchPromptTemplateId(): Promise<string> {
    try {
      const rows = this.relationDb.queryRaw<{ prompt_template_id: string }>(
        'SELECT "prompt_template_id" FROM "agent_library_config_record" LIMIT 1',
        [],
      );
      if (rows?.[0]?.prompt_template_id) return String(rows[0].prompt_template_id);
    } catch {  }

    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'title', operator: Operator.EQ, value: 'Agent 匹配评估' },
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
      report?.emit(BusinessEvent.AgentBuilt, {
        agent_id: buildOutput.agent_id,
        def_id: def.id,
        name: soAgentDisplayName(def.name),
        purpose: String(def.agent_purpose ?? '').slice(0, 500),
        task_signature: def.task_signature,
      });
      report?.emit(BusinessEvent.AgentSelected, {
        agent_id: def.id,
        agent_name: soAgentDisplayName(def.name),
        matched_by: 'built',
        reason: '选举阶梯耗尽，终端构建全新 Agent（按任务动态生成并沉淀）',
        mechanisms: [{ mechanism: 'direct', adopted: true, candidates: [{ id: def.id, name: def.name }] }],
      });
      return def;
    } catch (err) {
      this.logger?.warn?.('buildNewDef 发生异常，已拦截', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  private prepareBuilderContext(input: { run_id?: string }): AgentBuilderContext {
    const ctx = new AgentBuilderContext();
    ctx.session_id = '';
    ctx.work_id = '';
    ctx.run_id = input.run_id ?? '';
    return ctx;
  }

  private async insertDefFromAgent(agentId: string, input: MatchAgentDefInput): Promise<AgentDefRecord | null> {
    const fields = await this.composeDefFieldsFromAgent(agentId, this.buildSignature(input.task_content, input.task_domain));
    const existing = await this.relationDb.selectOne(RUNTIME_AGENT_DEF_TABLE, [
      { field: 'agent_ref', operator: Operator.EQ, value: agentId },
    ]);
    if (existing) {
      await this.relationDb.update(RUNTIME_AGENT_DEF_TABLE, newPatch({
        ...fields,
        status: AgentDefStatus.Active,
        updated: IdGenerator.now(),
      }), [
        { field: 'id', operator: Operator.EQ, value: existing.id },
      ]);
      this.activeDefsCacheUpdatedAt = 0;
      const row = await this.soDefRowById(String(existing.id));
      return row ? this.toDefRecord(row) : null;
    }

    const record = newRecord({
      ...fields,
      mode: AgentMode.Primary,
      agent_ref: agentId,
      task_signature: this.buildSignature(input.task_content, input.task_domain),
      budget_total: DEFAULT_BUDGET_TOTAL,
      status: AgentDefStatus.Active,
    });
    await this.relationDb.insert(RUNTIME_AGENT_DEF_TABLE, record);

    this.activeDefsCacheUpdatedAt = 0;
    const defId = String(record[0].value);
    const row = await this.soDefRowById(defId);
    return row ? this.toDefRecord(row) : null;
  }

  /** 从源 Agent 资产组装 def 组件字段（data）：新建 def 与重建刷新共用，保证口径一致 */
  private async composeDefFieldsFromAgent(agentId: string, fallbackPurpose: string): Promise<Record<string, unknown>> {
    const asset = await this.soAgentAsset(agentId);
    const binding = await this.soAgentBinding(agentId);
    const skillIds = asset?.skill_ids || (binding ? this.soJsonIdArray(binding.skill_ids_json) : []);
    const mcpIds = asset?.mcp_ids || (binding ? this.soJsonIdArray(binding.mcp_ids_json) : []);
    const toolsJson = (skillIds.length > 0 || mcpIds.length > 0) ? JSON.stringify({ skills: skillIds, mcps: mcpIds }) : '';
    return {
      title: asset?.agent_name || '通用问答',
      agent_purpose: String(asset?.agent_purpose ?? '') || fallbackPurpose,
      prompt_template_id: asset?.prompt_template_id || binding?.prompt_template_id || '',
      model_id: asset?.model_id || '',
      soul_id: asset?.soul_id || binding?.soul_id || '',
      tools_json: toolsJson,
    };
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

    report?.emit(BusinessEvent.LlmSelected, {
      llm_id: def.model_id,
      llm_name: this.soComponentName(def.model_id, 'llm_available_record', 'llm_title'),
      stage: 'match',
      reason: def.model_id
        ? '命中既有 Agent，模型选举结果=绑定事实源（Agent 绑定）'
        : 'Agent 未绑定模型，运行时按默认模型解析',
    });
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
    report?.emit(BusinessEvent.PromptSelected, {
      template_id: templateId,
      prompt_name: this.soComponentName(templateId, 'prompt_template_record', 'title'),
      stage: 'match',
      reason: def.prompt_template_id
        ? '命中既有 Agent，Prompt 选举结果=绑定事实源（Agent 绑定）'
        : 'Agent 未绑定 Prompt，回退执行侧内置身份模板（Brian 身份声明）',
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
    return this.soComponentName(id, 'skill_record', 'title') || this.soComponentName(id, 'skill_record', 'brief');
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
      .map((t) => `- mcp_exec（mcp_id: "${t.id}"）：${t.brief || this.soComponentName(t.id, 'mcp_install_record', 'mcp_title')}`)
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
      { field: 'title', operator: Operator.EQ, value: 'Brian 身份声明' },
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
        'SELECT "match_score_threshold" FROM "agent_library_config_record" LIMIT 1',
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
      const template = row ? String(row['content'] ?? '') : '';
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
      { field: 'title', operator: Operator.EQ, value: input.name },
    ]);
    if (existing) {
      await this.relationDb.update(RUNTIME_AGENT_DEF_TABLE, newPatch(this.prepareDefPatch(input)), [
        { field: 'title', operator: Operator.EQ, value: input.name },
      ]);
      output.def_id = String(existing.id);
      return true;
    }
    const record = newRecord({ ...this.prepareDefPatch(input), title: input.name });
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
    report?.emit(BusinessEvent.AgentDisbanded, {
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

  /** 绑定事实源存活校验（data）：存在且未停用；builtin.* 前缀 Prompt 走内置目录视为有效 */
  private async soBindingAlive(table: string, id: string): Promise<boolean> {
    try {
      const row = await this.relationDb.selectOne(table, [{ field: 'id', operator: Operator.EQ, value: id }]);
      return !!row && Number(row.enable ?? 1) !== 0;
    } catch {
      return false;
    }
  }

  /** def 组件健康校验（data）：agent_ref/soul/prompt/llm 绑定逐一核对事实源 */
  async validateDefHealth(def: AgentDefRecord, _metrics?: Metrics): Promise<DefHealthReport> {
    const issues: string[] = [];
    if (def.agent_ref && !(await this.soBindingAlive('agent_record', def.agent_ref))) {
      issues.push(`agent_ref 失效：源 Agent ${def.agent_ref} 不存在或已停用`);
    }
    if (def.soul_id && !(await this.soBindingAlive('soul_record', def.soul_id))) {
      issues.push(`soul_id 失效：${def.soul_id}`);
    }
    if (def.prompt_template_id && !def.prompt_template_id.startsWith('builtin.')
      && !(await this.soBindingAlive(PROMPT_TEMPLATE_TABLE, def.prompt_template_id))) {
      issues.push(`prompt_template_id 失效：${def.prompt_template_id}`);
    }
    if (def.model_id && !(await this.soBindingAlive('llm_available_record', def.model_id))) {
      issues.push(`model_id 失效：${def.model_id}`);
    }
    return { healthy: issues.length === 0, issues };
  }

  /** 定时巡检（orchestration）：失效 def 由系统发起重建并更新组件关联，重建失败才停用出池 */
  async sweepDefHealth(input: SweepDefHealthInput, output: SweepDefHealthOutput, _context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const primaryOnly = input.primary_only !== false;
    const rows = await this.relationDb.select(RUNTIME_AGENT_DEF_TABLE, {
      conditions: [{ field: 'status', operator: Operator.EQ, value: 'active' }],
    });
    for (const row of rows) {
      const def = this.toDefRecord(row);
      if (primaryOnly && def.mode !== AgentMode.Primary) continue;
      output.scanned += 1;
      const health = await this.validateDefHealth(def, metrics);
      if (health.healthy) continue;
      const repaired = await this.repairDef(def, metrics, report);
      if (repaired) output.repaired += 1; else output.disabled += 1;
    }
    this.activeDefsCacheUpdatedAt = 0;
    metrics?.info?.('AgentDefService.sweepDefHealth 巡检完成', {
      scanned: output.scanned, repaired: output.repaired, disabled: output.disabled,
    });
    return true;
  }

  /** 失效 def 修复（orchestration）：源 Agent 存活→清悬挂绑定走运行时回退；源 Agent 失效→重建并原地刷新组件关联 */
  private async repairDef(def: AgentDefRecord, metrics?: Metrics, report?: Report): Promise<boolean> {
    try {
      const agentAlive = !def.agent_ref || await this.soBindingAlive('agent_record', def.agent_ref);
      if (agentAlive) {
        await this.clearInvalidBindings(def);
        this.logger?.warn?.('AgentDefService.repairDef 悬挂绑定已清理（运行时回退默认解析）', {
          def_id: def.id, name: def.name,
        });
        return true;
      }
      return await this.rebuildDefAgent(def, metrics, report);
    } catch (err) {
      metrics?.warn?.('AgentDefService.repairDef 修复失败，停用 def', {
        def_id: def.id, error: err instanceof Error ? err.message : String(err),
      });
      await this.disableDef(def, '巡检修复失败');
      return false;
    }
  }

  /** 悬挂绑定清空（data）：逐项复核后置空失效字段，健康字段保持不动 */
  private async clearInvalidBindings(def: AgentDefRecord): Promise<void> {
    const patch: Record<string, unknown> = { updated: IdGenerator.now() };
    if (def.soul_id && !(await this.soBindingAlive('soul_record', def.soul_id))) patch.soul_id = '';
    if (def.prompt_template_id && !def.prompt_template_id.startsWith('builtin.')
      && !(await this.soBindingAlive(PROMPT_TEMPLATE_TABLE, def.prompt_template_id))) {
      patch.prompt_template_id = '';
    }
    if (def.model_id && !(await this.soBindingAlive('llm_available_record', def.model_id))) patch.model_id = '';
    await this.relationDb.update(RUNTIME_AGENT_DEF_TABLE, newPatch(patch), [{ field: 'id', operator: Operator.EQ, value: def.id }]);
    this.activeDefsCacheUpdatedAt = 0;
  }

  /** 源 Agent 失效的重建（orchestration）：force_new 构建新 Agent，保持 def id 原地刷新组件关联（会话亲和无感） */
  private async rebuildDefAgent(def: AgentDefRecord, metrics?: Metrics, report?: Report): Promise<boolean> {
    const buildInput = new BuildAgentInput();
    buildInput.run_id = `defhealth-${IdGenerator.now()}`;
    buildInput.task_content = def.task_signature || def.agent_purpose || def.name;
    buildInput.task_domain = this.soSignatureDomain(def.task_signature);
    buildInput.force_new = true;
    const buildOutput = new BuildAgentOutput();
    const ok = await this.components.agentBuilder?.buildAgent(
      buildInput, buildOutput, this.prepareBuilderContext(buildInput), metrics, report,
    );
    if (!ok || !buildOutput.agent_id) {
      await this.disableDef(def, '重建失败：buildAgent 未产出新 Agent');
      return false;
    }
    await this.refreshDefFromAgent(def.id, buildOutput.agent_id, def.task_signature);
    report?.emit(BusinessEvent.AgentBuilt, {
      agent_id: buildOutput.agent_id,
      def_id: def.id,
      name: def.name,
      purpose: def.agent_purpose || '',
      reason: `组件失效重建：源 Agent ${def.agent_ref} 已失效，重建并更新 def 组件关联`,
    });
    this.logger?.warn?.('AgentDefService.rebuildDefAgent 重建完成，def 组件关联已更新', {
      def_id: def.id, old_agent_ref: def.agent_ref, new_agent_ref: buildOutput.agent_id,
    });
    return true;
  }

  /** 重建后刷新 def 组件关联（data）：保持 def id，agent_ref 与组件字段整体换新 */
  private async refreshDefFromAgent(defId: string, agentId: string, fallbackSignature: string): Promise<void> {
    const fields = await this.composeDefFieldsFromAgent(agentId, fallbackSignature);
    await this.relationDb.update(RUNTIME_AGENT_DEF_TABLE, newPatch({
      ...fields,
      agent_ref: agentId,
      status: AgentDefStatus.Active,
      updated: IdGenerator.now(),
    }), [{ field: 'id', operator: Operator.EQ, value: defId }]);
    this.activeDefsCacheUpdatedAt = 0;
  }

  /** 停用出池（data）：失效 def 置 disabled 并清缓存，供守卫与巡检共用 */
  private async disableDef(def: AgentDefRecord, reason: string): Promise<void> {
    try {
      await this.relationDb.update(RUNTIME_AGENT_DEF_TABLE, newPatch({
        status: AgentDefStatus.Disabled,
        updated: IdGenerator.now(),
      }), [{ field: 'id', operator: Operator.EQ, value: def.id }]);
    } catch { /* 尽力而为 */ }
    this.activeDefsCacheUpdatedAt = 0;
    this.logger?.warn?.('AgentDefService.disableDef 组件失效，def 已停用出池', {
      def_id: def.id, name: def.name, reason,
    });
  }

  /** 亲和守卫出口：RunGateway 复用会话专职专家前检测到失效时调用，停用后落全量选举重建 */
  async invalidateDefById(defId: string, reason: string, _context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const row = await this.soDefRowById(defId);
    if (!row) return true;
    const def = this.toDefRecord(row);
    await this.disableDef(def, reason);
    report?.emit(BusinessEvent.AgentDisbanded, {
      agent_id: def.agent_ref || def.id,
      reason: `component_invalid：${reason}`,
    });
    metrics?.warn?.('AgentDefService.invalidateDefById 会话专职专家组件失效，已停用待重建', {
      def_id: def.id, name: def.name, reason,
    });
    return true;
  }

  /** 任务签名领域段解析（data）：'[document_reading] xxx' → 'document_reading' */
  private soSignatureDomain(signature: string): string {
    const m = /^\[([^\]]+)\]/.exec(signature || '');
    return m ? m[1] : '';
  }

  private async soAgentOwner(agentBizId: string): Promise<{ id: string; created_by: string }> {
    try {
      const rows = await this.relationDb.queryRaw<{ id: string; created_by: string }>(
        `SELECT "id", "created_by" FROM "agent_record" WHERE "id" = ? LIMIT 1`,
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
