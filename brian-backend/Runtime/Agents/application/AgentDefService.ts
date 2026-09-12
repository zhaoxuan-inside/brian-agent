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
  PROMPT_IDS,
  renderTemplate,
  LLMContext,
  ExecLLMInput,
  ExecLLMOutput,
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
}

/** agent 表绑定事实源（2026-09-11 新增；缓存与 Layer 1 直读共用） */
interface AgentBindingRow {
  agent_id: string;
  soul_id: string;
  skill_ids_json: string;
  mcp_ids_json: string;
  agent_purpose: string;
}

/** queryRaw 原始 agent 行 */
type AgentRowFull = AgentBindingRow;

/** 默认签名相似度阈值 */
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

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
    await this.warmAssetCaches();
    this.logger?.debug?.(`AgentDefService 初始化完成（agent 绑定=${this.agentBindingCache.size}, active def=${this.activeDefsCache.length}）`);
  }

  /** 启动期预热资产缓存（数据处理；幂等） */
  private async warmAssetCaches(): Promise<void> {
    try {
      const agentRows = await this.relationDb.queryRaw<AgentRowFull>(
        'SELECT "agent_id", "soul_id", "skill_ids_json", "mcp_ids_json", "agent_purpose" FROM "agent"',
        [],
      );
      this.agentBindingCache.clear();
      for (const row of agentRows ?? []) {
        this.agentBindingCache.set(String(row.agent_id), {
          agent_id: String(row.agent_id ?? ''),
          soul_id: String(row.soul_id ?? ''),
          skill_ids_json: String(row.skill_ids_json ?? '[]'),
          mcp_ids_json: String(row.mcp_ids_json ?? '[]'),
          agent_purpose: String(row.agent_purpose ?? ''),
        });
      }
      this.agentBindingCacheUpdatedAt = Date.now();
    } catch {
      /* best effort：预热失败回退为按需读库 */
    }
    try {
      this.activeDefsCache = await this.loadActiveDefs();
      this.activeDefsCacheUpdatedAt = Date.now();
    } catch {
      /* best effort */
    }
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
    return this.activeDefsCache;
  }

  // -------------------------------------------------------------------------
  // matchAgentDef（确定性三层）
  // -------------------------------------------------------------------------

  // ===== 原始方法（保留作为参考）=====
  // /** 确定性匹配（逻辑控制）：exact → signature → llm → 构建 */
  // async matchAgentDef(input: MatchAgentDefInput, output: MatchAgentDefOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report,
  // ): Promise<boolean> {
  //   if (!input.task_content) {
  //     throw new ValidationError('task_content 不能为空');
  //   }
  //   const defs = await this.soActiveDefs();
  //   const exact = this.soExactMatch(defs, input.task_content, input.task_domain);
  //   if (exact) {
  //     output.def_id = exact.id;
  //     output.matched_by = AgentMatchLayer.Exact;
  //     output.def = exact;
  //     return true;
  //   }
  //   const signatureHit = this.soSignatureMatch(defs, input.task_content, input.task_domain);
  //   if (signatureHit) {
  //     output.def_id = signatureHit.id;
  //     output.matched_by = AgentMatchLayer.Signature;
  //     output.def = signatureHit;
  //     return true;
  //   }
  //   if (input.force_new !== true && defs.length > 0) {
  //     const llmHit = await this.soLLMRankedDef(defs, input.task_content);
  //     if (llmHit) {
  //       output.def_id = llmHit.id;
  //       output.matched_by = AgentMatchLayer.LLM;
  //       output.def = llmHit;
  //       return true;
  //     }
  //   }
  //   const built = await this.buildNewDef(input);
  //   output.def_id = built.id;
  //   output.matched_by = AgentMatchLayer.Built;
  //   output.def = built;
  //   return true;
  // }

  // ===== 原始方法（保留作为参考，2026-09-11 regen 版）：命中后经 applyRegenDecision 概率重评估 =====
  // async matchAgentDef(input: MatchAgentDefInput, output: MatchAgentDefOutput, _context: AgentDefContext, _metrics?: Metrics, report?: Report,
  // ): Promise<boolean> {
  //   if (!input.task_content) {
  //     throw new ValidationError('task_content 不能为空');
  //   }
  //   const defs = await this.soActiveDefs();
  //   // ===== 2026-09-11：命中后 regen 判决 —— agent_library_config.regen_rate 随机判决通过则
  //   // 跳过 L1/L2 复用走 L3LLM 打分 + L4 构建（即"即使命中 Agent 也有概率重匹配以更新"） =====
  //   await this.applyRegenDecision(input);
  //   const exact = input.regenerate ? null : this.soExactMatch(defs, input.task_content, input.task_domain);
  //   if (exact) {
  //     output.def_id = exact.id;
  //     output.matched_by = AgentMatchLayer.Exact;
  //     output.def = exact;
  //     return true;
  //   }
  //   const signatureHit = input.regenerate && !input.force_new ? null : this.soSignatureMatch(defs, input.task_content, input.task_domain);
  //   if (signatureHit) {
  //     output.def_id = signatureHit.id;
  //     output.matched_by = AgentMatchLayer.Signature;
  //     output.def = signatureHit;
  //     return true;
  //   }
  //   if (input.force_new !== true && defs.length > 0) {
  //     const llmHit = await this.soLLMRankedDef(defs, input.task_content, report);
  //     if (llmHit) {
  //       output.def_id = llmHit.id;
  //       output.matched_by = AgentMatchLayer.LLM;
  //       output.regenerate = input.regenerate === true;
  //       output.def = llmHit;
  //       return true;
  //     }
  //   }
  //   const built = await this.buildNewDef(input, report);
  //   output.def_id = built.id;
  //   output.matched_by = AgentMatchLayer.Built;
  //   output.def = built;
  //   output.regenerate = input.regenerate === true;
  //   return true;
  // }

  // ===== 修改后的方法（2026-09-11 收敛版）："重新生成概率/复用概率"唯一实现收敛于
  // Agent 层 AgentLibraryService.matchAgent（regen_rate 失效判决 → regenerate → AgentBuilder 重构），
  // Runtime 不再重复判决；def 命中（exact/signature/llm）即复用，不做任何概率推翻 =====
  /** 确定性匹配（逻辑控制）：exact → signature → llm → 构建 */
  async matchAgentDef(input: MatchAgentDefInput, output: MatchAgentDefOutput, _context: AgentDefContext, _metrics?: Metrics, report?: Report,
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
      const llmHit = await this.soLLMRankedDef(defs, input.task_content, report);
      if (llmHit) {
        output.def_id = llmHit.id;
        output.matched_by = AgentMatchLayer.LLM;
        output.def = llmHit;
        return true;
      }
    }
    const built = await this.buildNewDef(input, report);
    output.def_id = built.id;
    output.matched_by = AgentMatchLayer.Built;
    output.def = built;
    return true;
  }

  // ===== 原始方法（保留作为参考）=====
  // /** 查询 active 定义（逻辑控制） */
  // private async soActiveDefs(): Promise<AgentDefRecord[]> {
  //   const rows = await this.relationDb.select(RUNTIME_AGENT_DEF_TABLE, {
  //     conditions: [{ field: 'status', operator: Operator.EQ, value: 'active' }],
  //   });
  //   return rows.map((row) => this.toDefRecord(row));
  // }

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
  // ===== 原始代码（保留作为参考）：直接 queryRaw；测试库可能缺 agent_library_config 表且 AOP 代理层丢失私有方法上下文 =====
  /** 命中后重评估判决（数据处理）：regen_rate 读库失败视为不触发 */
  // ===== 原始方法（保留作为参考，2026-09-11 版，已弃用）：Runtime 侧重复实现"重新生成概率"判决；
  // 与 Agent 层 AgentLibraryService.matchAgent 的 regen_rate 失效判决重复（同义概念并存，2026-09-11 收敛版删除） =====
  // private async applyRegenDecision(input: MatchAgentDefInput): Promise<void> {
  //   if (input.force_new === true) {
  //     return;
  //   }
  //   try {
  //     const rows = this.relationDb.queryRaw<{ regen_rate: number }>(
  //       'SELECT "regen_rate" FROM "agent_library_config" LIMIT 1',
  //       [],
  //     );
  //     const regenRate = Number(rows?.[0]?.regen_rate ?? 75);
  //     if (!shouldReuseByRegenRate(regenRate)) {
  //       input.regenerate = true;
  //     }
  //   } catch {
  //     /* best effort：配置表缺失时按不复用判定 */
  //   }
  // }

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

  // ===== 原始方法（保留作为参考）=====
  // /** L3 LLM 打分命中（逻辑控制；经 LLMAccess.execLLM，Prompt 为 builtin.agent_match 渲染） */
  // private async soLLMRankedDef(defs: AgentDefRecord[], taskContent: string): Promise<AgentDefRecord | null> {
  //   const template = getBuiltinTemplate(PROMPT_IDS.agentMatch) ?? '';
  //   const candidates = defs
  //     .map((def, index) => `${index + 1}. agent_id=${def.agent_ref || def.id} 用途: ${def.name} — ${this.defBrief(def)}`)
  //     .join('\n');
  //   const prompt = renderTemplate(template, { task_content: taskContent, candidates });
  //   const execInput = new ExecLLMInput();
  //   execInput.prompt = prompt;
  //   execInput.max_tokens = 300;
  //   const execOutput = new ExecLLMOutput();
  //   const ok = await this.llm.execLLM(execInput, execOutput, new LLMContext());
  //   if (!ok || !execOutput.result) {
  //     return null;
  //   }
  //   const parsed = parseJsonObject(execOutput.result);
  //   if (!parsed) {
  //     return null;
  //   }
  //   const score = Number(parsed.score ?? 0);
  //   if (!(score >= LLM_SCORE_THRESHOLD)) {
  //     return null;
  //   }
  //   const agentRef = String(parsed.agent_id ?? '');
  //   return defs.find((def) => def.agent_ref === agentRef || def.id === agentRef) ?? null;
  // }

  // ===== 修改后的方法（2026-09-09）：LLM 意图/匹配评估完成即上报 intent.analyzed =====
  // ===== 修改后（2026-09-11）：agentMatch 统一百分制（score 0-100，threshold=AgentScoreThreshold.Default 70）；
  // prompt 仅经 prompt_template 表渲染（删除硬编码内存回退，缺失 fail-loud） =====
  /** L3 LLM 打分命中（逻辑控制；经 LLMAccess.execLLM，Prompt 为 builtin.agent_match 渲染） */
  private async soLLMRankedDef(defs: AgentDefRecord[], taskContent: string, report?: Report): Promise<AgentDefRecord | null> {
    // ===== 2026-09-11：采纳阈值读配置（agent_library_config.match_score_threshold，配置中心 Agent 库参数页可调） =====
    const adoptThreshold = await this.soMatchScoreThreshold();
    const candidates = defs
      .map((def, index) => `${index + 1}. agent_id=${def.agent_ref || def.id} 用途: ${def.name} — ${this.defBrief(def)}`)
      .join('\n');
    const prompt = await this.renderMatchPrompt(PROMPT_IDS.agentMatch, { task_content: taskContent, candidates });
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
    const parsedScore = Number(parsed.score ?? 0);
    // 兼容旧 0-1 分制：< 1 的分数按比例放大到百分制
    const score = parsedScore > 0 && parsedScore <= 1 ? Math.round(parsedScore * 100) : Math.round(parsedScore);
    const reason = String(parsed.reason ?? '');
    const agentRef = String(parsed.agent_id ?? '');
    report?.pushBusinessEvent(BusinessEvent.IntentAnalyzed, {
      score,
      reason: reason.slice(0, 1000),
      agent_id: agentRef,
      adopted: score >= adoptThreshold,
      candidates_count: defs.length,
    });
    if (!(score >= adoptThreshold)) {
      return null;
    }
    return defs.find((def) => def.agent_ref === agentRef || def.id === agentRef) ?? null;
  }

  // ===== 原始方法（保留作为参考）=====
  // /** L4 构建（逻辑控制）：复用 AgentBuilder.buildAgent（force_new）→ 写 def */
  // private async buildNewDef(input: MatchAgentDefInput): Promise<AgentDefRecord> {
  //   const buildInput = new BuildAgentInput();
  //   buildInput.interact_id = input.interact_id ?? '';
  //   buildInput.task_content = input.task_content;
  //   buildInput.task_domain = input.task_domain;
  //   buildInput.force_new = true;
  //   const buildOutput = new BuildAgentOutput();
  //   const ctx = this.prepareBuilderContext(input);
  //   const ok = await this.components.agentBuilder.buildAgent(buildInput, buildOutput, ctx);
  //   if (!ok || !buildOutput.agent_id) {
  //     throw new ValidationError('Agent 构建失败（AgentBuilder 无返回）');
  //   }
  //   return this.insertDefFromAgent(buildOutput.agent_id, input);
  // }

  // ===== 修改后的方法（2026-09-09）：Agent 构建完成即上报 agent.built =====
  /** L4 构建（逻辑控制）：复用 AgentBuilder.buildAgent（force_new）→ 写 def */
  private async buildNewDef(input: MatchAgentDefInput, report?: Report): Promise<AgentDefRecord> {
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

  // ===== 原始方法（保留作为参考）=====
  // /** 组装会话级快照（逻辑控制） */
  // async soAgentSnapshot(input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report,
  // ): Promise<boolean> {
  //   const def = await this.soDefRow(input.def_id);
  //   const soulContent = await this.soSoulContent(def, input);
  //   const tools = await this.soSnapshotTools(def, input);
  //   const system = this.prepareSystemPrompt(def, soulContent, tools, input.user_message ?? input.task_content);
  //   output.snapshot = {
  //     def_id: def.id,
  //     name: def.name,
  //     system,
  //     llm_id: def.model_id,
  //     temperature: def.temperature,
  //     budget_total: def.budget_total,
  //     tools,
  //     meta: { soul_id: def.soul_id || undefined, llm_id: def.model_id || undefined, matched_by: 'snapshot' },
  //   };
  //   return true;
  // }

  // ===== 原始方法（保留作为参考，2026-09-11 版）：def 无显式绑定时仍走 Core 动态
  // matchSoul/matchSkill/matchMCP（"命中已有 Agent 也重新匹配组件"，已收敛删除） =====
  // async soAgentSnapshot(input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, _context: AgentDefContext, _metrics?: Metrics, report?: Report,
  // ): Promise<boolean> {
  //   const def = await this.soDefRow(input.def_id);
  //   report?.pushBusinessEvent(BusinessEvent.LlmSelected, { llm_id: def.model_id });
  //   input.regenerate = input.regenerate === true;
  //   const soulContent = await this.soSoulContent(def, input);
  //   const tools = await this.soSnapshotTools(def, input, report);
  //   const system = await this.prepareSystemPrompt(def, soulContent, tools, input.user_message ?? input.task_content);
  //   output.snapshot = { ...同下 };
  //   report?.pushBusinessEvent(BusinessEvent.PromptSelected, { template_id: def.prompt_template_id || PROMPT_IDS.identity, system: system.slice(0, 4000), soul_selected: Boolean(def.soul_id || soulContent), tools_count: tools.length });
  //   return true;
  // }

  // ===== 修改后的方法（2026-09-11 收敛版）：def 命中即复用绑定 —— soul 只读
  // def.soul_id（无绑定即空），tools 只读 def.tools_json（无绑定即无工具），
  // 不再走 Core matchSoul/matchSkill/matchMCP 动态匹配 =====
  /** 组装会话级快照（逻辑控制） */
  async soAgentSnapshot(input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, _context: AgentDefContext, _metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const def = await this.soDefRow(input.def_id);
    // LLM 选定（快照解析出模型）完成即上报
    report?.pushBusinessEvent(BusinessEvent.LlmSelected, { llm_id: def.model_id });
    const soulContent = await this.soSoulContent(def);
    const tools = await this.soSnapshotTools(def, report);
    const system = await this.prepareSystemPrompt(def, soulContent, tools, input.user_message ?? input.task_content);
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
    // Prompt 选定（模板渲染出 system prompt）完成即上报
    report?.pushBusinessEvent(BusinessEvent.PromptSelected, {
      template_id: def.prompt_template_id || PROMPT_IDS.identity,
      system: system.slice(0, 4000),
      soul_selected: Boolean(def.soul_id || soulContent),
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

  // ===== 原始方法（保留作为参考，2026-09-11 版）：def.soul_id 缺失时经 core.matchSoul
  // 动态匹配（已按 2026-09-11 收敛原则删除：命中即绑定，无绑定即空） =====
  // private async soSoulContent(def: AgentDefRecord, input: SoAgentSnapshotInput): Promise<string> {
  //   if (def.soul_id) {
  //     return this.soSoulContentById(def.soul_id);
  //   }
  //   if (!this.components.soulCore) {
  //     return '';
  //   }
  //   const matchInput = new MatchSoulInput();
  //   matchInput.agent_id = def.agent_ref;
  //   matchInput.context_id = input.context_id ?? '';
  //   matchInput.interact_id = input.interact_id ?? '';
  //   matchInput.task_content = input.task_content;
  //   matchInput.bypass_cache = input.regenerate === true;
  //   matchInput.task_domain = input.task_domain;
  //   const matchOutput = new MatchSoulOutput();
  //   const ok = await this.components.soulCore.matchSoul(matchInput, matchOutput, new SoulCoreContext());
  //   if (!ok) {
  //     return '';
  //   }
  //   return String(matchOutput.soul?.soul_content ?? '');
  // }

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
    if (!this.components.soulCore) {
      return '';
    }
    const input = new SoSoulContentInput();
    input.soul_id = soulId;
    const output = new SoSoulContentOutput();
    await this.components.soulCore.soSoulContent(input, output, new SoulCoreContext());
    return output.content;
  }

  // ===== 原始方法（保留作为参考）=====
  // /** 工具清单解析（数据处理；显式 tools_json 优先，否则动态 matchSkill/matchMCP） */
  // private async soSnapshotTools(def: AgentDefRecord, input: SoAgentSnapshotInput): Promise<SnapshotToolEntry[]> {
  //   if (def.tools_json) {
  //     const explicit = parseJsonObject(def.tools_json);
  //     return this.entriesFromExplicit(explicit);
  //   }
  //   const entries: SnapshotToolEntry[] = [];
  //   if (this.components.skillCore) {
  //     const matchInput = new MatchSkillInput();
  //     matchInput.agent_id = def.agent_ref;
  //     matchInput.context_id = input.context_id ?? '';
  //     matchInput.interact_id = input.interact_id ?? '';
  //     const matchOutput = new MatchSkillOutput();
  //     const ok = await this.components.skillCore.matchSkill(matchInput, matchOutput, new SkillCoreContext());
  //     if (ok) {
  //       for (const entry of matchOutput.skills) {
  //         entries.push({ kind: 'skill', id: entry.skill_id, brief: entry.skill_brief });
  //       }
  //     }
  //   }
  //   return this.appendMcpEntries(def, input, entries);
  // }

  // ===== 原始方法（保留作为参考，2026-09-11 版）：曾把 agent 表绑定传入 matchSkill/matchMCP 走 Layer 1 水合 =====
  // /** 工具清单解析 */
  // private async soSnapshotTools(def: AgentDefRecord, input: SoAgentSnapshotInput, report?: Report): Promise<SnapshotToolEntry[]> {
  //   if (def.tools_json) {
  //     const explicit = parseJsonObject(def.tools_json);
  //     const entries = this.entriesFromExplicit(explicit);
  //     report?.pushBusinessEvent(BusinessEvent.SkillSelected, {
  //       source: 'explicit',
  //       skills: entries.filter((e) => e.kind === 'skill').map((e) => ({ id: e.id, brief: e.brief })),
  //     });
  //     return entries;
  //   }
  //   const binding = await this.soAgentBinding(def.agent_ref);
  //   const boundSkillIds = binding ? this.soJsonIdArray(binding.skill_ids_json) : [];
  //   const boundMcpIds = binding ? this.soJsonIdArray(binding.mcp_ids_json) : [];
  //   ...
  // }

  // ===== 原始方法（保留作为参考，2026-09-11 版）：tools_json 缺失时经 core.matchSkill/matchMCP
  // 动态匹配（已按 2026-09-11 收敛原则删除：命中即绑定，无绑定即无工具） =====
  // private async soSnapshotTools(def: AgentDefRecord, input: SoAgentSnapshotInput, report?: Report): Promise<SnapshotToolEntry[]> {
  //   if (def.tools_json) { ...explicit 展开... }
  //   ... matchSkill / appendMcpEntries（match 输入含 task_content/bypass_cache）
  // }

  // ===== 修改后的方法（2026-09-11 收敛版）：只读 def.tools_json 显式绑定，无绑定即无工具 =====
  /** 工具清单解析（数据处理；显式 tools_json 唯一来源，无绑定即空） */
  private async soSnapshotTools(def: AgentDefRecord, report?: Report): Promise<SnapshotToolEntry[]> {
    if (!def.tools_json) {
      return [];
    }
    const explicit = parseJsonObject(def.tools_json);
    const entries = this.entriesFromExplicit(explicit);
    const skills = entries.filter((e) => e.kind === 'skill');
    const mcps = entries.filter((e) => e.kind === 'mcp');
    report?.pushBusinessEvent(BusinessEvent.SkillSelected, {
      source: 'explicit',
      skills: skills.map((e) => ({ id: e.id, brief: e.brief })),
    });
    if (mcps.length) {
      report?.pushBusinessEvent(BusinessEvent.McpSelected, {
        mcps: mcps.map((e) => ({ id: e.id, brief: e.brief })),
      });
    }
    return entries;
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

  // ===== 原始方法（保留作为参考）=====
  // /** 追加 MCP 条目（数据处理） */
  // private async appendMcpEntries(def: AgentDefRecord, input: SoAgentSnapshotInput, entries: SnapshotToolEntry[]): Promise<SnapshotToolEntry[]> {
  //   if (!this.components.mcpCore) {
  //     return entries;
  //   }
  //   const matchInput = new MatchMcpInput();
  //   matchInput.agent_id = def.agent_ref;
  //   matchInput.context_id = input.context_id ?? '';
  //   matchInput.interact_id = input.interact_id ?? '';
  //   const matchOutput = new MatchMcpOutput();
  //   const ok = await this.components.mcpCore.matchMCP(matchInput, matchOutput, new McpCoreContext());
  //   if (ok) {
  //     for (const detail of matchOutput.mcp_details) {
  //       entries.push({ kind: 'mcp', id: String(detail.id ?? ''), brief: String(detail.mcp_brief ?? detail.mcp_title ?? '') });
  //     }
  //   }
  //   return entries;
  // }

  // ===== 修改后的方法（2026-09-09）：MCP 选定完成即上报 mcp.selected =====
  // ===== 原始方法（保留作为参考，2026-09-11 版，已随动态 Tool 匹配收敛一并弃用）=====
  // private async appendMcpEntries(def: AgentDefRecord, input: SoAgentSnapshotInput, entries: SnapshotToolEntry[], report?: Report): Promise<SnapshotToolEntry[]> {
  //   if (!this.components.mcpCore) return entries;
  //   const matchInput = new MatchMcpInput();
  //   matchInput.agent_id = def.agent_ref;
  //   matchInput.context_id = input.context_id ?? '';
  //   matchInput.interact_id = input.interact_id ?? '';
  //   matchInput.task_content = input.task_content;
  //   matchInput.bypass_cache = input.regenerate === true;
  //   const matchOutput = new MatchMcpOutput();
  //   const ok = await this.components.mcpCore.matchMCP(matchInput, matchOutput, new McpCoreContext());
  //   if (ok) {
  //     for (const detail of matchOutput.mcp_details) {
  //       entries.push({ kind: 'mcp', id: String(detail.id ?? ''), brief: String(detail.mcp_brief ?? detail.mcp_title ?? '') });
  //     }
  //     report?.pushBusinessEvent(BusinessEvent.McpSelected, {
  //       mcps: matchOutput.mcp_details.map((d) => ({ id: String(d.id ?? ''), brief: String(d.mcp_brief ?? d.mcp_title ?? '') })),
  //     });
  //   }
  //   return entries;
  // }

  /** 系统提示组装（数据处理→逻辑控制）：prompt_template 表渲染 identity 模板（2026-09-11 删除硬编码回退） */
  private async prepareSystemPrompt(def: AgentDefRecord, soulContent: string, tools: SnapshotToolEntry[], userMessage: string): Promise<string> {
    const toolLines = tools
      .map((t) => `- ${t.kind === 'skill' ? 'skill_exec(skill_id' : 'mcp_exec(mcp_id'}: "${t.id}") ${t.brief}`.replace('))', ')'))
      .join('\n');
    const directive = [
      `当前任务：${(userMessage ?? '').slice(0, 500)}`,
      tools.length ? `\n可用工具（经 skill_exec / mcp_exec 调用，按 id 传入）：\n${toolLines}` : '',
    ].join('\n');
    const system = await this.renderMatchPrompt(def.prompt_template_id || PROMPT_IDS.identity, { soul: soulContent, task_directive: directive });
    this.logger?.debug?.('soAgentSnapshot.system', { head: system.slice(0, 400), template_id: def.prompt_template_id || 'builtin.identity' });
    return system;
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
  async killErroredAgent(input: KillErroredAgentInput, _output: KillErroredAgentOutput, _context: AgentDefContext, _metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const agentRef = input.agent_ref;
    if (!agentRef) {
      return true;
    }
    // 错误 usage 落账（best-effort；评估闭环的回溯依据）
    if (this.components.agentLibrary) {
      await this.recordErroredUsage(agentRef, input);
    }
    // def 层立即停用（并失效 active def 缓存 → 下一轮匹配不再命中）
    await this.disableDefsByRef(agentRef);
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
  private async recordErroredUsage(agentRef: string, input: KillErroredAgentInput): Promise<void> {
    try {
      const agent = await this.soAgentAsset(agentRef);
      if (!agent || !this.components.agentLibrary) {
        return;
      }
      await this.components.agentLibrary.recordAgentUsage(
        Object.assign(new RecordAgentUsageInput(), {
          agent_id: agentRef,
          work_id: input.work_id ?? '',
          interact_id: input.interact_id ?? '',
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
    } catch { /* best effort：usage 失败不阻断杀死 */ }
  }

  /** disable agent_ref 全部 def（数据处理；best-effort） */
  private async disableDefsByRef(agentBizId: string): Promise<void> {
    try {
      await this.relationDb.update(RUNTIME_AGENT_DEF_TABLE, newPatch({
        status: AgentDefStatus.Disabled,
        updated: IdGenerator.now(),
      }), [{ field: 'agent_ref', operator: Operator.EQ, value: agentBizId }]);
    } catch { /* best effort */ }
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
