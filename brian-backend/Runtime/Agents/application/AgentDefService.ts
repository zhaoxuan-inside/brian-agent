/**
 * @fileoverview AgentDefService —— 声明式 Agent 定义与确定性匹配（Runtime v2 · 阶段3 前置）。
 *
 * 依据 `Agents/Agents-PRD.md` §5/§6：
 * - matchAgentDef 三层确定性匹配（exact → signature 相似度 → LLM 打分 → 构建），
 *   **无随机重建**（"重新生成概率/复用概率"唯一实现收敛于 Agent 层
 *   AgentLibraryService.matchAgent 的 regen_rate 失效判决，Runtime 不重复承载）；
 * - soAgentSnapshot **只读 def 显式绑定**：soul 读 def.soul_id（无绑定即空）、
 *   tools 读 def.tools_json（无绑定即无工具），def 命中即复用，
 *   不再经 Core matchSoul/matchSkill/matchMCP 动态重解析（2026-09-11 收敛）；
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
  ValidationError,
  NotFoundError,
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
import { DEFAULT_BUDGET_TOTAL } from '../../shared/types';
import {
  SoulCoreContext,
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

/** 旧 agent 资产字段子集（构建落账取名/用途用） */
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

/** agent 表绑定事实源（2026-09-11 新增；缓存与 Layer 1 直读共用） */
interface AgentBindingRow {
  agent_id: string;
  soul_id: string;
  skill_ids_json: string;
  mcp_ids_json: string;
  prompt_template_id?: string;
  agent_purpose: string;
}

/** queryRaw 原始 agent 行 */
type AgentRowFull = AgentBindingRow;

/** 默认签名相似度阈值 */
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

// ===== 2026-09-14 新增：向量召回置信度默认阈值（余弦相似度 0.85 达标 → 直接采纳向量层，
// 不再进入 LLM 语义裁判，省一次 5-20s 的意图打分 LLM）=====
const DEFAULT_VECTOR_THRESHOLD = 0.85;

/** LLM 打分采纳阈值（百分制；2026-09-11 从 0-1 改为 0-100 并以枚举承载） */
// ===== 2026-09-11：LLM 打分采纳阈值改为可配置（agent_library_config.match_score_threshold，默认 70） =====
const LLM_SCORE_DEFAULT = AgentScoreThreshold.Default;

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

  // ===== 新增（2026-09-11）：旧 agent 资产绑定与 active def 的启动期缓存 =====
  // 每轮 run 的 matchAgentDef/soAgentSnapshot 都要查 agent 表（绑定事实源）与 def 全表，
  // 原实现每轮都全量 select。启动时预热到内存，写侧（insertDefFromAgent）主动失效，
  // 外部改写按 TTL 自动过期重读，保证正确性同时消除每轮重复查询。
  /** agent_ref(agent.agent_id) → 绑定行（soul/skill/mcp 绑定事实源） */
  private readonly agentBindingCache = new Map<string, AgentBindingRow>();
  private agentBindingCacheUpdatedAt = 0;
  /** active def 全表缓存 */
  private activeDefsCache: AgentDefRecord[] = [];
  private activeDefsCacheUpdatedAt = 0;
  // ===== 2026-09-14 新增（向量召回）：def 代理文本向量惰性缓存（def.id → embedding），
  // 随 active def 缓存刷新一并清空重算 =====
  private readonly defEmbeddingCache = new Map<string, number[]>();
  /** 向量召回采纳阈值（余弦；runtime_agents_config.match_vector_threshold 可调） */
  private vectorThreshold = DEFAULT_VECTOR_THRESHOLD;
  /** 缓存 TTL（外部写（如 AgentLibrary 重绑）不可主动通知，靠 TTL 过期收敛） */
  private static readonly ASSET_CACHE_TTL_MS = 30_000;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llm: LLMAccess,
    private readonly components: AgentDefComponents,
    private readonly logger?: Logger,
  ) {
    this.config = new ConfigService(relationDb, RUNTIME_AGENTS_CONFIG_TABLE);
  }

  /** 初始化组件：恢复配置 + 启动期预热资产缓存 */
  async initialize(): Promise<void> {
    const threshold = await this.config.getString('match_similarity_threshold', '');
    if (threshold) {
      this.similarityThreshold = Number(threshold) || DEFAULT_SIMILARITY_THRESHOLD;
    }
    // ===== 2026-09-14 新增：向量召回阈值读配置（match_vector_threshold，缺省 0.85）=====
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

  /** 启动期预热资产缓存（数据处理；幂等） */
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
      /* best effort：预热失败回退为按需读库 */
      this.logger?.warn?.('AgentDefService.warmAssetCaches agent 绑定缓存预热失败，回退按需读库', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      this.activeDefsCache = await this.loadActiveDefs();
      this.activeDefsCacheUpdatedAt = Date.now();
    } catch (err) {
      /* best effort */
      this.logger?.warn?.('AgentDefService.warmAssetCaches active def 缓存预热失败，回退 TTL 按需重读', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** 绑定缓存失效（逻辑控制；AgentLibrary 绑定落库后调用 —— 候选能力档案以库中最新事实为准） */
  invalidateAgentBindingCache(): void {
    this.agentBindingCache.clear();
    this.agentBindingCacheUpdatedAt = 0;
  }

  /** agent 绑定行查询（数据处理；缓存优先，TTL 过期按需重读；best-effort 不因缺表报错） */
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
      /* best effort：agent 表不可用时按无绑定处理 */
      return null;
    }
  }

  /** 查询 active 定义全表（逻辑控制；启动缓存 + TTL 过期重读） */
  private async loadActiveDefs(): Promise<AgentDefRecord[]> {
    const rows = await this.relationDb.select(RUNTIME_AGENT_DEF_TABLE, {
      conditions: [{ field: 'status', operator: Operator.EQ, value: 'active' }],
    });
    return rows.map((row) => this.toDefRecord(row));
  }

  /** active def 缓存入口（逻辑控制；buildNewDef 落账后失效重读） */
  private async soActiveDefsCached(): Promise<AgentDefRecord[]> {
    if (
      this.activeDefsCache.length
      && this.activeDefsCacheUpdatedAt > Date.now() - AgentDefService.ASSET_CACHE_TTL_MS
    ) {
      return this.activeDefsCache;
    }
    this.activeDefsCache = await this.loadActiveDefs();
    this.activeDefsCacheUpdatedAt = Date.now();
    // ===== 2026-09-14 新增：def 全表重读后清空向量缓存（def 用途/签名可能已变更）=====
    this.defEmbeddingCache.clear();
    return this.activeDefsCache;
  }

  // -------------------------------------------------------------------------
  // matchAgentDef（确定性三层）
  // -------------------------------------------------------------------------

  // ===== 修改后的方法（2026-09-11 收敛版）："重新生成概率/复用概率"唯一实现收敛于
  // Agent 层 AgentLibraryService.matchAgent（regen_rate 失效判决 → regenerate → AgentBuilder 重构），
  // Runtime 不再重复判决；def 命中（exact/signature/llm）即复用，不做任何概率推翻 =====
  // ===== 修改后的方法（2026-09-14）：向量 + LLM 两级匹配 —— exact 命中后又加一层向量召回
  // （query 与 def 用途/签名的余弦相似度 ≥ match_vector_threshold 即直接采纳，跳过 LLM 打分）；
  // 向量置信度不足 or embedding 不可用时回退 LLM 语义裁判，二者均未达标才构建 =====
  /** 确定性匹配（逻辑控制）：exact (100分) → 向量召回 (余弦≥阈值) → LLM 语义裁判 (百分制) → 构建 */
  async matchAgentDef(input: MatchAgentDefInput, output: MatchAgentDefOutput, _context: AgentDefContext, _metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    if (!input.task_content) {
      throw new ValidationError('task_content 不能为空');
    }
    const defs = await this.soActiveDefs();
    // ===== 新增（2026-09-23）：agent_ref 直选层 —— delegate 委派指定既有 Agent 时不经任何
    // 语义匹配直接命中（委派任务的执行者由委派方显式指定，误路由零容忍）=====
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
    if (input.force_new !== true && defs.length > 0) {
      const vectorHit = await this.soVectorRankedDef(input, defs, _metrics, report);
      if (vectorHit) {
        output.def_id = vectorHit.def.id;
        output.matched_by = AgentMatchLayer.Vector;
        output.def = vectorHit.def;
        return true;
      }
      const llmHit = await this.soLLMRankedDef(input, defs, _metrics, report);
      if (llmHit) {
        output.def_id = llmHit.id;
        output.matched_by = AgentMatchLayer.LLM;
        output.def = llmHit;
        return true;
      }
    }
    const built = await this.buildNewDef(input, _metrics, report);
    output.def_id = built.id;
    output.matched_by = AgentMatchLayer.Built;
    output.def = built;
    return true;
  }

  // ===== 修改后的方法（2026-09-11）：改为启动缓存入口（匹配每轮只读内存，TTL 过期重读） =====
  /** 查询 active 定义（逻辑控制） */
  private async soActiveDefs(): Promise<AgentDefRecord[]> {
    return this.soActiveDefsCached();
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

  // ===== 新增方法（2026-09-11）：命中后 regen 判决（逻辑控制） =====
  /**
   * 命中后重评估判决（逻辑控制）：
   * 读 agent_library_config.regen_rate，shouldReuseByRegenRate=false 意味着概率触发重评估。
   */
  //   }
  // }

  /** 按 agent_ref 直选定义（数据处理：agent_ref 匹配 def.agent_ref 或 def.id） */
  private soDefByAgentRef(defs: AgentDefRecord[], agentRef: string): AgentDefRecord | null {
    return defs.find((def) => def.agent_ref === agentRef || def.id === agentRef) ?? null;
  }

  // ===== 2026-09-24 新增（事故 e77f0bb4 根因修复配套）：路由候选能力档案 =====
  /** 候选能力档案（数据处理；soAgentBinding 复用启动预热缓存）：
   *  agent_id / agent_name / purpose / task_signature / agent_type /
   *  capabilities = { skills: [skill 简述], mcps: [mcp 简述], bound_count }
   *  判据语义（模板承载硬规则）：bound_count=0 的候选对"需命令执行/外部数据"的任务不得高分。
   *  名称回退：skill 表 name/skill_brief、mcp_install 表 mcp_title（查无则留空 id） */
  private async soCandidateProfiles(defs: AgentDefRecord[]): Promise<Array<Record<string, unknown>>> {
    const profiles: Array<Record<string, unknown>> = [];
    for (const def of defs) {
      const binding = def.agent_ref ? await this.soAgentBinding(def.agent_ref) : null;
      const skillIds = binding ? this.soJsonIdArray(binding.skill_ids_json) : [];
      const mcpIds = binding ? this.soJsonIdArray(binding.mcp_ids_json) : [];
      const defTools = this.parseDefTools(def);
      const mergedSkills = this.uniqueJoin(skillIds, defTools.skills);
      const mergedMcps = this.uniqueJoin(mcpIds, defTools.mcps);
      profiles.push({
        agent_id: def.agent_ref || def.id,
        agent_name: def.name,
        purpose: def.agent_purpose || def.task_signature,
        task_signature: def.task_signature,
        agent_type: def.mode,
        capabilities: {
          skills: this.soNamesByIds(mergedSkills, 'skill', 'name', 'skill_brief'),
          mcps: this.soNamesByIds(mergedMcps, 'mcp_install', 'mcp_title', 'mcp_brief'),
          bound_count: this.uniqueJoin(skillIds, defTools.skills).length + this.uniqueJoin(mcpIds, defTools.mcps).length,
        },
      });
    }
    return profiles;
  }

  /** def.tools_json 解析（数据处理；无则空数组） */
  private parseDefTools(def: AgentDefRecord): { skills: string[]; mcps: string[] } {
    if (!def.tools_json) {
      return { skills: [], mcps: [] };
    }
    const parsed = parseJsonObject(def.tools_json);
    const skills = Array.isArray(parsed?.skills) ? (parsed!.skills as unknown[]).map(String) : [];
    const mcps = Array.isArray(parsed?.mcps) ? (parsed!.mcps as unknown[]).map(String) : [];
    return { skills, mcps };
  }

  /** 维度去重（数据处理） */
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

  /** 按 id 查询展示名（数据处理；table 一次性 IN 查询拼接） */
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

  /** L1 精确命中（数据处理：签名完全一致） */
  private soExactMatch(defs: AgentDefRecord[], taskContent: string, domain?: string): AgentDefRecord | null {
    const signature = this.buildSignature(taskContent, domain);
    return defs.find((def) => def.task_signature && def.task_signature === signature) ?? null;
  }

  // ===========================================================================
  // 2026-09-14 新增：向量召回层（向量置信度高直接采纳，低置信回退 LLM 裁判）
  // ===========================================================================

  /** L1.5 向量召回命中（逻辑控制）：
   * 1. 对任务内容生成 query 向量（embedLLM，embedding 不可用即返回 null 回退 LLM 裁判）；
   * 2. 对每个 def 的「用途+签名」代理文本取/算向量（惰性缓存）；
   * 3. 余弦相似度最优且 ≥ match_vector_threshold → 上报 intent.analyzed（matched_via=vector）并采纳；
   * 4. 置信度不足 → 返回 null（调用方回退 soLLMRankedDef，intent.analyzed 由 LLM 层上报）。
   */
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

  /** 任务向量（数据处理；embedLLM 失败/空返回零数组，调用方据此回退） */
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
    } catch { /* best effort：embedding 不可用回退 LLM 裁判 */ }
    return [];
  }

  /** def 代理文本向量（数据处理；惰性缓存，随 active def 缓存失效清空） */
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
    } catch { /* best effort */ }
    return [];
  }

  /** def 向量代理文本（数据处理：用途优先，签名兜底，附专名） */
  private defEmbedText(def: AgentDefRecord): string {
    return `${def.name} ${def.agent_purpose || def.task_signature || ''}`.trim();
  }

  /** 余弦相似度（数据处理；零向量按 0 处理） */
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

  // ===== 修改后的方法（2026-09-09）：LLM 意图/匹配评估完成即上报 intent.analyzed =====
  // ===== 修改后（2026-09-11）：agentMatch 统一百分制（score 0-100，threshold=AgentScoreThreshold.Default 70）；
  // prompt 仅经 prompt_template 表渲染（删除硬编码内存回退，缺失 fail-loud） =====
  /** L3 LLM 打分命中（逻辑控制；经 LLMAccess.execLLM，Prompt 为 Agent 匹配模板渲染；透传 metrics；
   * 2026-09-14：Token 归因维度经 match 入参透传——work_id 为 Agent 选择执行标识，run_id = 一次问答） */
  /** L3 LLM 打分命中（原始方法，保留作为参考）：候选只给"用途/签名"字面文本，判据无能力感知 ——
   *  字面相似（"系统状态"/"CPU" 字面同族）即可拿高分，空壳 Agent（覆盖通用领域）成为路由吞口
   *  （事故 trace e77f0bb4：CPU 统计再次误匹配运行状态确认官）。完整原文见 git 历史 8523bfc。 */
  // private async soLLMRankedDef(input: MatchAgentDefInput, defs: AgentDefRecord[], metrics?: Metrics, report?: Report): Promise<AgentDefRecord | null> {
  //   const adoptThreshold = await this.soMatchScoreThreshold();
  //   const taskContent = input.task_content;
  //   const candidates = defs
  //     .map((def, index) => `${index + 1}. agent_id=${def.agent_ref || def.id} 用途: ${def.name} — ${this.defBrief(def)}`)
  //     .join('\n');
  //   const matchPromptId = await this.soMatchPromptTemplateId();
  //   const prompt = await this.renderMatchPrompt(matchPromptId, { task_content: taskContent, candidates });
  //   ...（LLM 调用 / parse / intent.analyzed 上报逻辑与本修改后版本一致）
  // }

  /** L3 LLM 打分命中（逻辑控制）：能力感知判据 —— 2026-09-24 事故 e77f0bb4 根因修复（原实现见上方注释保留）。
   *  核心变更：候选注入能力面（绑定 Skill/MCP 摘要），匹配模板按"任务所需能力 vs 候选可执行能力"
   *  判定，字面相似不再决定命运；能力错位（任务需命令执行/外部数据而候选无任何能力）→ score 封顶 0.4。 */
  private async soLLMRankedDef(input: MatchAgentDefInput, defs: AgentDefRecord[], metrics?: Metrics, report?: Report): Promise<AgentDefRecord | null> {
    const adoptThreshold = await this.soMatchScoreThreshold();
    const taskContent = input.task_content;
    const candidates = JSON.stringify(await this.soCandidateProfiles(defs));
    const matchPromptId = await this.soMatchPromptTemplateId();
    const prompt = await this.renderMatchPrompt(matchPromptId, { task_content: taskContent, candidates });
    // ===== 修改后（2026-09-14）：LLM 打分调用前上报 intent.started —— 意图打分 LLM 单次实测 19s+
    // （llm_call_log：trace 012aa85a），此前 run.accepted 之后无任何事件，时间线长时间静止在
    // 「开始受理请求」，LLM 完成后同秒爆发一批节点；开始事件让时间线立刻推进到「意图分析中」 =====
    report?.pushBusinessEvent(BusinessEvent.IntentStarted, { candidates_count: defs.length });
    const execInput = new ExecLLMInput();
    execInput.prompt = prompt;
    execInput.max_tokens = 300;
    execInput.session_id = input.session_id ?? '';
    execInput.run_id = input.run_id ?? '';
    execInput.work_id = input.work_id ?? '';
    execInput.caller = 'AgentDefService.matchAgentDef';
    const execOutput = new ExecLLMOutput();
    // ===== 修改后（2026-09-14 Span 框架）：意图分析 LLM 打分经切面自动成为
    // matchAgentDef 的子 span，intent.analyzed 事件 payload 由框架自动携带其 self 耗时 =====
    const ok = await this.llm.execLLM(execInput, execOutput, new LLMContext(), metrics, report);
    if (!ok || !execOutput.result) {
      return null;
    }
    const parsed = parseJsonObject(execOutput.result);
    if (!parsed) {
      return null;
    }
    const parsedScore = Number(parsed.score ?? 0);
    // 兼容旧 0-1 分制：< 1 的分数按比例放大到百分制
    const score = parsedScore > 0 && parsedScore <= 1 ? Math.round(parsedScore * 100) : Math.round(parsedScore);
    const reason = String(parsed.reason ?? '');
    const agentRef = String(parsed.agent_id ?? '');
    // ===== 修改后（2026-09-13）：命中 Agent 上报补充名称（agent_name），供「思考过程」展示名称、悬浮可见 ID =====
    const matchedDef = defs.find((def) => def.agent_ref === agentRef || def.id === agentRef) ?? null;
    report?.pushBusinessEvent(BusinessEvent.IntentAnalyzed, {
      score,
      reason: reason.slice(0, 1000),
      agent_id: agentRef,
      agent_name: matchedDef?.name ?? '',
      adopted: score >= adoptThreshold,
      candidates_count: defs.length,
      // ===== 2026-09-14 新增：匹配路径标记（llm = LLM 语义裁判；vector 召回层在其上） =====
      matched_via: 'llm',
    });
    if (!(score >= adoptThreshold)) {
      return null;
    }
    return matchedDef;
  }

  /** Agent 匹配提示词模板 ID 读取（逻辑控制） */
  private async soMatchPromptTemplateId(): Promise<string> {
    try {
      const rows = this.relationDb.queryRaw<{ prompt_template_id: string }>(
        'SELECT "prompt_template_id" FROM "agent_library_config" LIMIT 1',
        [],
      );
      if (rows?.[0]?.prompt_template_id) return String(rows[0].prompt_template_id);
    } catch { /* best effort */ }
    // ===== 修改后（2026-09-24）：LIKE '%Agent 匹配%' 同族漂移（第三处实证：库中"Agent 匹配"
    // 与"Agent 匹配评估"同命中且无排序确定性）→ 精确标题 + is_system 双条件，见上注释保留：
    //   selectOne(PROMPT_TEMPLATE_TABLE, [{ field: 'prompt_template_title', operator: Operator.LIKE, value: '%Agent 匹配%' }]);
    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.EQ, value: 'Agent 匹配评估' },
    ]);
    if (row && row.id) return String(row.id);
    throw new ValidationError('未找到 Agent 匹配提示词模板');
  }

  // ===== 修改后的方法（2026-09-09）：Agent 构建完成即上报 agent.built =====
  /** L4 构建（逻辑控制）：复用 AgentBuilder.buildAgent（force_new）→ 写 def；透传 metrics */
  private async buildNewDef(input: MatchAgentDefInput, metrics?: Metrics, report?: Report): Promise<AgentDefRecord> {
    const buildInput = new BuildAgentInput();
    buildInput.run_id = input.run_id ?? '';
    buildInput.task_content = input.task_content;
    buildInput.task_domain = input.task_domain;
    buildInput.force_new = true;
    const buildOutput = new BuildAgentOutput();
    const ctx = this.prepareBuilderContext(input);
    const ok = await this.components.agentBuilder.buildAgent(buildInput, buildOutput, ctx, metrics, report);
    if (!ok || !buildOutput.agent_id) {
      throw new ValidationError('Agent 构建失败（AgentBuilder 无返回）');
    }
    const def = await this.insertDefFromAgent(buildOutput.agent_id, input);
    report?.pushBusinessEvent(BusinessEvent.AgentBuilt, {
      agent_id: buildOutput.agent_id,
      def_id: def.id,
      name: def.name,
      purpose: String(def.agent_purpose ?? '').slice(0, 500),
      task_signature: def.task_signature,
    });
    return def;
  }

  /** 构建上下文组装（数据处理） */
  private prepareBuilderContext(input: MatchAgentDefInput): AgentBuilderContext {
    const ctx = new AgentBuilderContext();
    ctx.session_id = '';
    ctx.work_id = '';
    ctx.run_id = input.run_id ?? '';
    return ctx;
  }

  // ===== 修改后的方法（全汉字功能名称，不含助手后缀与技术前缀，属性独立存储，支持根据 agent_ref 幂等更新） =====
  /** 从旧 agent 资产写声明定义（逻辑控制；取名/用途/组件绑定经 AgentLibraryAccess，落账 id 取自插入记录） */
  private async insertDefFromAgent(agentId: string, input: MatchAgentDefInput): Promise<AgentDefRecord> {
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
      return this.toDefRecord(row!);
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
    // ===== 新增（2026-09-11）：写侧失效 active def 缓存（启动缓存假设被本写打破）=====
    this.activeDefsCacheUpdatedAt = 0;
    const defId = String(record[0].value);
    const row = await this.soDefRowById(defId);

    if (!row) {
      throw new NotFoundError(RUNTIME_AGENT_DEF_TABLE, defId);
    }
    return this.toDefRecord(row);
  }

  /** 查询旧 agent 资产（逻辑控制；经 AgentLibraryAccess；未注入/未命中时回退启动缓存绑定行） */
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
    // ===== 新增（2026-09-11）：回退启动缓存（agent 绑定事实源；purpose 用于构建落账）=====
    return this.soAgentBinding(agentId);
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

  // ===== 修改后的方法（支持从 def 及 agent 绑定双重解析 soul/tools，上报真实 template_id UUID） =====
  /** 组装会话级快照（逻辑控制；2026-09-14 Span 框架：system prompt 组装为显式子段 span） */
  async soAgentSnapshot(input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, _context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const def = await this.soDefRow(input.def_id);
    // ===== 修改后（2026-09-13）：LLM 选定上报补充模型名称（llm_name），供前端展示名称、悬浮可见 ID =====
    report?.pushBusinessEvent(BusinessEvent.LlmSelected, { llm_id: def.model_id, llm_name: this.soComponentName(def.model_id, 'llm_available', 'llm_title') });
    const soulId = def.soul_id || (def.agent_ref ? (await this.soAgentBinding(def.agent_ref))?.soul_id : '') || '';
    const soulContent = soulId ? await this.soSoulContentById(soulId) : '';
    const tools = await this.soSnapshotTools(def, report);
    // ===== 修改后（2026-09-14 Span 框架）：system prompt 组装为显式子段 span
    // （prepareSystemPrompt 为私有方法不经切面），prompt.selected 事件由框架自动携带其 self 耗时 =====
    const systemSpan = metrics ? metrics.beginSpan('Runtime.Agents.AgentDefService.soAgentSnapshot.system') : undefined;
    const system = await this.prepareSystemPrompt(def, soulContent, tools, input.user_message ?? input.task_content);
    if (metrics && systemSpan) metrics.endSpan(systemSpan);
    const templateId = def.prompt_template_id || await this.soDefaultIdentityTemplateId();
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
    // ===== 修改后（2026-09-13）：Prompt 选定上报补充模板名称（prompt_name） =====
    report?.pushBusinessEvent(BusinessEvent.PromptSelected, {
      template_id: templateId,
      prompt_name: this.soComponentName(templateId, 'prompt_template', 'prompt_template_title'),
      system: system.slice(0, 4000),
      soul_selected: Boolean(soulId && soulContent),
      tools_count: tools.length,
    });
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

  // ===== 新增（2026-09-13）：组件 ID → 展示名称解析（LLM/Prompt 事件载荷补充名称，
  // 前端实时时间线/思考块展示名称、ID 随悬浮可见） =====
  /** 组件名称解析（数据处理）：按 id 查表取展示名，查无回退空串（由调用方兜底回退 ID） */
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

  /** Skill 展示名称解析（数据处理）：优先 name 列（技能名称），回退 skill_brief 简述 */
  private soSkillName(id: string): string {
    return this.soComponentName(id, 'skill', 'name') || this.soComponentName(id, 'skill', 'skill_brief');
  }

  // ===== 修改后的方法（2026-09-11 收敛版）：只读 def.soul_id 显式绑定，无绑定即空 =====
  /** Soul 内容解析（数据处理；def 显式绑定优先，无绑定即空） */
  private async soSoulContent(def: AgentDefRecord): Promise<string> {
    if (!def.soul_id) {
      return '';
    }
    return this.soSoulContentById(def.soul_id);
  }

  /** 按 id 读取 Soul 内容（逻辑控制；经 SoulCoreAccess.soSoulContent，禁止直查 soul 表） */
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

  // ===== 修改后的方法（2026-09-11 收敛版）：只读 def.tools_json 显式绑定，缺失回退 agent 绑定 =====
  /** 工具清单解析（数据处理；显式 tools_json 唯一来源，缺失从 agent 绑定回退） */
  private async soSnapshotTools(def: AgentDefRecord, report?: Report): Promise<SnapshotToolEntry[]> {
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
      return [];
    }
    const explicit = parseJsonObject(toolsJson);
    const entries = this.entriesFromExplicit(explicit);
    const skills = entries.filter((e) => e.kind === 'skill');
    const mcps = entries.filter((e) => e.kind === 'mcp');
    if (skills.length) {
      report?.pushBusinessEvent(BusinessEvent.SkillSelected, {
        source: 'explicit',
        skills: skills.map((e) => ({ id: e.id, brief: e.brief || this.soSkillName(e.id) })),
      });
    }
    if (mcps.length) {
      report?.pushBusinessEvent(BusinessEvent.McpSelected, {
        mcps: mcps.map((e) => ({ id: e.id, brief: e.brief })),
      });
    }
    return entries;
  }

  /** 解析 JSON 字符串为 ID 列表（数据处理） */
  private soJsonIdArray(raw?: string): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((x) => String(x)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  /** 定义简述（数据处理：agent_purpose 优先，签名兜底） */
  private defBrief(def: AgentDefRecord): string {
    return def.agent_purpose || def.task_signature || def.name;
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

  // ===== 修改后的方法（2026-09-09）：MCP 选定完成即上报 mcp.selected =====
  /** 系统提示组装（数据处理→逻辑控制）：prompt_template 表渲染 identity 模板 */
  private async prepareSystemPrompt(def: AgentDefRecord, soulContent: string, tools: SnapshotToolEntry[], userMessage: string): Promise<string> {
    const toolLines = tools
      .map((t) => `- ${t.kind === 'skill' ? 'skill_exec(skill_id' : 'mcp_exec(mcp_id'}: "${t.id}") ${t.brief}`.replace('))', ')'))
      .join('\n');
    const directive = [
      `当前任务：${(userMessage ?? '').slice(0, 500)}`,
      tools.length ? `\n可用工具（经 skill_exec / mcp_exec 调用，按 id 传入）：\n${toolLines}` : '',
    ].join('\n');
    const templateId = def.prompt_template_id || await this.soDefaultIdentityTemplateId();
    const system = await this.renderMatchPrompt(templateId, { soul: soulContent, task_directive: directive });
    this.logger?.debug?.('soAgentSnapshot.system', { head: system.slice(0, 400), template_id: templateId });
    return system;
  }

  /** 默认身份提示词模板 ID 读取（逻辑控制；DB 查询标题含 '身份' 的模板，缺失回退首个启用模板） */
  // ===== 修改后（2026-09-24 事故 trace 95b8e237 复盘配套）：原实现 LIKE '%身份%' 不区分
  // is_system，新增"文档伴读身份"等同类标题模板后命中顺序不确定 —— 生产 Agent 身份被
  // 随机劫持为"文档伴读"人格（失败用例"组件绑定收敛/Soul 注入"实证）。改为 source 声明式
  // 精确标题 + is_system 双条件兜底，身份来源不可漂移 =====
  // 原方法注释保留（见上方注释块）：
  // private async soDefaultIdentityTemplateId(): Promise<string> {
  //   const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
  //     { field: 'prompt_template_title', operator: Operator.LIKE, value: '%身份%' },
  //   ]);
  //   if (row && row.id) return String(row.id);
  //   const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
  //     { field: 'enable', operator: Operator.EQ, value: 1 },
  //   ]);
  //   if (anyRow && anyRow.id) return String(anyRow.id);
  //   throw new ValidationError('未找到可用的身份提示词模板');
  // }
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
    throw new ValidationError('未找到可用的身份提示词模板');
  }

  /** Agent 匹配采纳阈值读取（逻辑控制；agent_library_config 行缺失回退默认 70） */
  private async soMatchScoreThreshold(): Promise<number> {
    try {
      const rows = this.relationDb.queryRaw<{ match_score_threshold: number }>(
        'SELECT "match_score_threshold" FROM "agent_library_config" LIMIT 1',
        [],
      );
      const value = Number(rows?.[0]?.match_score_threshold);
      return Number.isFinite(value) && value > 0 ? value : LLM_SCORE_DEFAULT;
    } catch {
      return LLM_SCORE_DEFAULT;
    }
  }

  /** 匹配/快照 Prompt 渲染（逻辑控制）：prompt_template 表 DB 渲染；缺失 fail-loud */
  private async renderMatchPrompt(templateId: string, variables: Record<string, unknown>): Promise<string> {
    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: templateId },
    ]);
    const template = row ? String(row['prompt_template'] ?? '') : '';
    if (!template) {
      throw new ValidationError(`Prompt 模板不可用: ${templateId}`);
    }
    return renderTemplate(template, variables);
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

  // ===========================================================================
  // 错误 Agent 立即杀死（2026-09-11；与正确 Agent 自然凋亡（ageAgent/评估衰减）分离）
  // ===========================================================================

  /** 错误 Agent 立即杀死（原始方法，保留作为参考）——此前错误 run 无任何处置通道 */
  // killErroredAgent(_input, ...): 未实现（错误 run 只在 settleRun 记 error 状态）

  /**
   * 错误 Agent 立即杀死（逻辑控制；RunGateway settleRun 在 stop_reason=error 时调用）：
   * 1. 记录错误 usage（usage_context 带错误标记，评估闭环可回溯）；
   * 2. disable 全部 runtime_agent_def（agent_ref 对齐）——立即停匹配，防止后续调用继续报错；
   * 3. system 归属 → delAgent 硬删除；user 归属 → 仅软禁用（delAgent 守卫拒绝越权）。
   */
  async killErroredAgent(input: KillErroredAgentInput, _output: KillErroredAgentOutput, _context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const agentRef = input.agent_ref;
    if (!agentRef) {
      return true;
    }
    // 错误 usage 落账（best-effort；评估闭环的回溯依据）
    if (this.components.agentLibrary) {
      await this.recordErroredUsage(agentRef, input, metrics);
    }
    // def 层立即停用（并失效 active def 缓存 → 下一轮匹配不再命中）
    await this.disableDefsByRef(agentRef, metrics);
    this.activeDefsCacheUpdatedAt = 0;
    // 资产权属判定：system 硬删除，user 软禁用（守卫由 delAgent 内部保证）
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

  /** 错误 usage 落账（数据处理；agentLibrary 未注入时静默跳过） */
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
      /* best effort：usage 失败不阻断杀死 */
      metrics?.warn('AgentDefService.recordErroredUsage 错误 usage 落账失败（不阻断杀死）', {
        error: err instanceof Error ? err.message : String(err),
        agent_id: agentRef,
      });
    }
  }

  /** disable agent_ref 全部 def（数据处理；best-effort） */
  private async disableDefsByRef(agentBizId: string, metrics?: Metrics): Promise<void> {
    try {
      await this.relationDb.update(RUNTIME_AGENT_DEF_TABLE, newPatch({
        status: AgentDefStatus.Disabled,
        updated: IdGenerator.now(),
      }), [{ field: 'agent_ref', operator: Operator.EQ, value: agentBizId }]);
    } catch (err) {
      /* best effort */
      metrics?.warn('AgentDefService.disableDefsByRef 停用 def 失败（该 agent 可能仍被匹配）', {
        error: err instanceof Error ? err.message : String(err),
        agent_id: agentBizId,
      });
    }
  }

  /** agent 归属查询（数据处理；launch 缓存未命中回退 DB） */
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
    } catch { /* fallthrough */ }
    return { id: '', created_by: 'user' };
  }
}
