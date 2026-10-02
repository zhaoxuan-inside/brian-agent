/**
 * 统一选举引擎契约（R8 · chg-058）
 * 六组件（Agent/LLM/Prompt/Soul/Skill/MCP）复用同一套选举流程：
 * ① 复用判定（续写请求直命中已有组件/绑定与缓存事实源）
 * ② 并行信号提取：合法候选集、BM25 候选集、向量正例候选集（含正反范例）、结构候选集（复杂度）
 * ③ 分级候选集阶梯（数据驱动表达式，逐级放宽，逐级择优/整集采纳）
 * ④ 阶梯耗尽终端动作：创建新组件（Agent/Prompt/Soul/Skill）或使用默认（LLM）
 * 组件只实现 ComponentElectionAdapter 钩子；阈值可经 election_config_record 配置。
 */
import type { ComponentFunnelTrace, FunnelComponentKind } from '../match/ComponentFunnelTrace';
import type { TaskComplexityResult } from '../nlp/TaskComplexityAnalyzer';

/** 信号集合键（扩展点：未来新增信号提取器只需扩键） */
export type ElectionSignalKey = 'structure' | 'vectorOverall' | 'vectorExample' | 'bm25' | 'all';

/** 阶梯表达式：并集若干信号候选集，可选剔除向量反例候选集 */
export interface ElectionTierExpr {
  id: string;
  label: string;
  union: ElectionSignalKey[];
  subtractNegative: boolean;
}

/** 参与选举的候选包装：组件原始记录 + 各信号得分与集合归属标记 */
export interface ElectionCandidate<T> {
  id: string;
  label: string;
  doc: T;
  /** BM25 绝对置信度分（0-100） */
  bm25Score: number;
  /** 综合向量分（0-100）= max(描述向量, 正范例 Max-Sim)，软惩罚后 */
  vectorScore: number;
  /** 正范例 Max-Sim 原始值（0-100，未与描述向量取 max、未软惩罚） */
  exampleSim: number;
  /** 负范例 Max-Sim（0-100） */
  negativeSim: number;
  /** 是否落入向量反例候选集（negativeSim ≥ vectorNegative 阈值） */
  rejectedByNegative: boolean;
}

/** 阈值（可配置：election_config_record.thresholds_json 覆盖默认值） */
export interface ElectionThresholds {
  /** BM25 候选集阈值（0-100） */
  bm25: number;
  /** 向量正例候选集阈值（0-100，综合向量分口径） */
  vectorOverall: number;
  /** 正范例命中集阈值（0-100，范例 Max-Sim 原始口径） */
  vectorExample: number;
  /** 向量反例候选集阈值（0-100） */
  vectorNegative: number;
  /** 综合得分权重：向量 */
  vectorWeight: number;
  /** 综合得分权重：BM25 */
  bm25Weight: number;
}

export const DEFAULT_ELECTION_THRESHOLDS: ElectionThresholds = {
  bm25: 90, vectorOverall: 80, vectorExample: 80, vectorNegative: 85, vectorWeight: 0.7, bm25Weight: 0.3,
};

/** 并行信号提取结果（引擎在阶梯游走阶段的唯一事实源） */
export interface ElectionSignals<T> {
  /** 合法候选集（全量，含各信号得分与集合标记） */
  candidates: ElectionCandidate<T>[];
  /** 任务结构分析结果（复杂/中等/简单） */
  complexity: TaskComplexityResult;
  /** 结构候选集（复杂度匹配的候选 id；无复杂度元数据的组件=全量合法） */
  structureIds: Set<string>;
  thresholds: ElectionThresholds;
}

/** 复用判定命中 */
export interface ElectionReuseHit<T> {
  label: string;
  items: ElectionCandidate<T>[];
}

/**
 * 组件选举适配器：六组件各自实现，引擎按模板方法调度。
 * extractSignals 内部必须以 Promise.all 并行提取 BM25/向量/结构三路信号。
 */
export interface ComponentElectionAdapter<T> {
  component: FunnelComponentKind;
  /** true=命中阶梯整集采纳（Skill/MCP），false=按综合得分择优单选 */
  multiSelect: boolean;
  /** true=合法候选集唯一时直接采纳（规格 3.1.1，LLM 专属）；false 仍走阶梯阈值裁决 */
  directAdoptSingle: boolean;
  funnel?: ComponentFunnelTrace;
  findReusable(input: unknown): Promise<ElectionReuseHit<T> | null>;
  extractSignals(input: unknown): Promise<ElectionSignals<T>>;
  tiers(): ElectionTierExpr[];
  select(input: unknown, output: unknown, picked: ElectionCandidate<T>[], tier: ElectionTierExpr): Promise<boolean>;
  exhaust(input: unknown, output: unknown): Promise<boolean>;
}

/** 复用判定与单候选直采使用的阶梯标记（Trace 展示用） */
export const REUSE_TIER: ElectionTierExpr = { id: 'reuse', label: '复用命中', union: ['all'], subtractNegative: false };
export const SINGLE_TIER: ElectionTierExpr = { id: 'single', label: '唯一合法候选', union: ['all'], subtractNegative: false };
