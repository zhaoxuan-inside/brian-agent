/**
 * @fileoverview InfoCoreProvider 领域层类型定义。
 *
 * 定义 InfoCoreContext、各功能的 Input / Output 类型、
 * 信息记录类型、表名常量与默认配置。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output, InfoType, CollectionSource } from '@brian-agent/base';
// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** InfoCore 上下文（InfoCoreContext）。 */
export class InfoCoreContext extends Context {}

// ---------------------------------------------------------------------------
// 记录类型
// ---------------------------------------------------------------------------

/** info_raw 表记录 */
export interface InfoRawRecord {
  id: string;
  created: number;
  updated: number;
  session_id: string;
  work_id: string;
  run_id: string;
  info_id: string;
  info_type: InfoType | string;
  info_creator_role: string;
  info_creator_id: string;
  info: string;
  info_length: number;
  pin: number;
  trace_id: string;
  handle_result_type: string;
}

/** info_vector 表记录 */
export interface InfoVectorRecord {
  id: string;
  created: number;
  updated: number;
  info_id: string;
  embedding: string;
}

/** info_tag 表记录 */
export interface InfoTagRecord {
  id: string;
  created: number;
  updated: number;
  info_id: string;
  tag: string;
}

/** info_tag_vector 表记录 */
export interface InfoTagVectorRecord {
  id: string;
  created: number;
  updated: number;
  tag_id: string;
  embedding: string;
}

/** info_summary 表记录 */
export interface InfoSummaryRecord {
  id: string;
  created: number;
  updated: number;
  info_id: string;
  summary: string;
}

/** info_keyword 表记录 */
export interface InfoKeywordRecord {
  id: string;
  created: number;
  info_id: string;
  word: string;
}

/** info_tag_config 表记录 */
export interface InfoTagConfigRecord {
  id: string;
  created: number;
  updated: number;
  llm_id: string;
  prompt_template_id: string;
  tag_top_k: number;
  enable: number;
}

/** info_summary_config 表记录 */
export interface InfoSummaryConfigRecord {
  id: string;
  created: number;
  updated: number;
  llm_id: string;
  prompt_template_id: string;
  enable: number;
  /** 摘要生成阈值：内容字符数不超过该值时直接以原文作为摘要，超过则调用摘要生成 */
  threshold: number;
  /** 需要生成摘要的信息类型白名单（逗号分隔） */
  info_types: string;
}

/** info_config 表记录 */
export interface InfoConfigRecord {
  id: string;
  created: number;
  updated: number;
  alive_max_days: number;
}

/** info_vector_config 表记录 */
export interface InfoVectorConfigRecord {
  id: string;
  created: number;
  updated: number;
  llm_id: string;
  dimension: number;
  enable: number;
  /** 分块大小（字符/码点数），超过该长度的 info 会被拆分为多个 chunk 向量化 */
  chunk_size: number;
  /** 相邻 chunk 之间的重叠长度（字符/码点数），保证边界上下文覆盖率 */
  chunk_overlap: number;
}

/** info_context_config 表记录 */
export interface InfoContextConfigRecord {
  id: string;
  created: number;
  updated: number;
  base_timeline_count: number;
  base_tag_relative_count: number;
  base_similarity_count: number;
  base_keyword_count: number;
  base_random_count: number;
  random_max_percent: number;
  tag_relative_max_percent: number;
  similarity_max_percent: number;
  keyword_max_percent: number;
  keyword_score_threshold: number;
  total: number;
  enable_snapshot_persistence: number;
  priority_order: string;
}

// ---------------------------------------------------------------------------
// saveInfo
// ---------------------------------------------------------------------------

/** saveInfo 入参 */
export class SaveInfoInput extends Input {
  session_id!: string;
  work_id!: string;
  run_id!: string;
  /**
   * 源头 trace 治理（2026-09-14）：唯一链路标识，与 work_id / run_id 独立。
   * 显式传入（含 ''，表示该行无已知源头 trace）时按传入值落库；
   * 未传入（undefined）才回落 metrics.trace_id（调用方链路 trace）。
   */
  trace_id?: string;
  info_type!: string;
  info_creator_role?: string;
  info_creator_id?: string;
  info!: string;
  /**
   * 消息真实创建时间（毫秒时间戳；可选，缺省取保存时刻）。
   * 会话同步等场景传入原始消息时间（如 runtime_message.created），
   * 保证 user 消息先于 assistant 回复的时间先后次序（否则消息在对话区顺序错乱）。
   */
  created?: number;
  parent_info_ids?: string[];
  /** 预生成的摘要（由上层编排调用 SummaryAgent 生成后传入；为空则不为该 info 生成摘要） */
  summary?: string;
  /** 处理结果类型：correct / call_error / internal_error（默认 correct） */
  handle_result_type?: string;
}

/** saveInfo 出参 */
export class SaveInfoOutput extends Output {
  info_id = '';
}

// ---------------------------------------------------------------------------
// pinInfo
// ---------------------------------------------------------------------------

/** pinInfo 入参 */
export class PinInfoInput extends Input {
  info_id!: string;
}

/** pinInfo 出参 */
export class PinInfoOutput extends Output {}

// ---------------------------------------------------------------------------
// vectorInfo / tagInfo / summaryInfo / keywordInfo
// ---------------------------------------------------------------------------

/** Process info 入参（共享） */
export class ProcessInfoInput extends Input {
  info_id!: string;
}

/** vectorInfo 出参 */
export class VectorInfoOutput extends Output {
  vector_id = '';
}

/** tagInfo 出参 */
export class TagInfoOutput extends Output {
  tags: string[] = [];
}

/** summaryInfo 出参 */
export class SummaryInfoOutput extends Output {
  summary_id = '';
}

/** keywordInfo 出参 */
export class KeywordInfoOutput extends Output {
  keywords: string[] = [];
}

// ---------------------------------------------------------------------------
// graphTag
// ---------------------------------------------------------------------------

/** graphTag 入参 */
export class GraphTagInput extends Input {
  tag_id!: string;
}

/** graphTag 出参 */
export class GraphTagOutput extends Output {
  node_id = '';
}

// ---------------------------------------------------------------------------
// rebuildCooccurGraph
// ---------------------------------------------------------------------------

/** rebuildCooccurGraph 入参（无业务字段，用于触发共现边重建） */
export class RebuildCooccurGraphInput extends Input {}

/** rebuildCooccurGraph 出参 */
export class RebuildCooccurGraphOutput extends Output {
  /** 重建前删除的旧 cooccur 边数 */
  deleted_edges = 0;
  /** 重建的共现边数 */
  rebuilt_edges = 0;
}

// ---------------------------------------------------------------------------
// lastNInfo
// ---------------------------------------------------------------------------

/** lastNInfo 入参 */
export class LastNInfoInput extends Input {
  session_id?: string;
  work_id?: string;
  run_id?: string;
  info_type?: string;
  info_creator_role?: string;
  info_creator_id?: string;
  info_id?: string;
  /** 按处理结果类型过滤（correct / call_error / internal_error）；缺省返回全部 */
  handle_result_type?: string;
  lastN!: number;
}

/** lastNInfo 出参 */
export class LastNInfoOutput extends Output {
  list: InfoRawRecord[] = [];
}

// ---------------------------------------------------------------------------
// graphNInfo
// ---------------------------------------------------------------------------

/** graphNInfo 入参 */
export class GraphNInfoInput extends Input {
  info_id!: string;
  lastN!: number;
  /** 按处理结果类型过滤；缺省返回全部 */
  handle_result_type?: string;
}

/** graphNInfo 出参 */
export class GraphNInfoOutput extends Output {
  list: InfoRawRecord[] = [];
}

// ---------------------------------------------------------------------------
// similarKInfo
// ---------------------------------------------------------------------------

/** similarKInfo 入参 */
export class SimilarKInfoInput extends Input {
  info!: string;
  topK!: number;
  /** 归一化相似度阈值 0-100（0=返回全部，100=仅完全匹配），低于此值结果不返回 */
  similarity_threshold?: number;
}

/** similarKInfo 出参 */
export class SimilarKInfoOutput extends Output {
  list: Array<InfoRawRecord & { score?: number; matched_chunks?: string[] }> = [];
}

// ---------------------------------------------------------------------------
// keywordKInfo
// ---------------------------------------------------------------------------

/** keywordKInfo 入参 */
export class KeywordKInfoInput extends Input {
  info!: string;
}

/** keywordKInfo 出参 */
export class KeywordKInfoOutput extends Output {
  list: Array<InfoRawRecord & { keyword_match_count?: number; keyword_score?: number }> = [];
}

// ---------------------------------------------------------------------------
// relationKInfo
// ---------------------------------------------------------------------------

/** relationKInfo 入参 */
export class RelationKInfoInput extends Input {
  info_id!: string;
  topN!: number;
}

/** relationKInfo 出参 */
export class RelationKInfoOutput extends Output {
  list: Array<InfoRawRecord & { relevance_score?: number }> = [];
}

// ---------------------------------------------------------------------------
// graphInfo
// ---------------------------------------------------------------------------

/** graphInfo 入参 */
export class GraphInfoInput extends Input {
  session_id!: string;
  /** 按处理结果类型过滤；缺省返回全部 */
  handle_result_type?: string;
}

/** graphInfo 出参 */
export class GraphInfoOutput extends Output {
  graph: {
    nodes: Array<{ id: string; label: string; info_id: string; info_type?: string; info_creator_role?: string; handle_result_type?: string }>;
    edges: Array<{ id: string; from: string; to: string; citing_info_id: string; cited_info_id: string; edge_type?: string }>;
  } = { nodes: [], edges: [] };
}

// ---------------------------------------------------------------------------
// soCitationEdges（GraphDB 引用边查询，替代旧 info_graph 表）
// ---------------------------------------------------------------------------

/** soCitationEdges 入参（可选过滤条件） */
export class SoCitationEdgesInput extends Input {
  session_id?: string;
  citing_info_id?: string;
  cited_info_id?: string;
}

/** soCitationEdges 出参 */
export class SoCitationEdgesOutput extends Output {
  edges: Array<{ id: string; citing_info_id: string; cited_info_id: string; session_id: string }> = [];
}

// ---------------------------------------------------------------------------
// delInfoGraph（级联删除 GraphDB info 节点与引用边）
// ---------------------------------------------------------------------------

/** delInfoGraph 入参 */
export class DelInfoGraphInput extends Input {
  info_ids!: string[];
}

/** delInfoGraph 出参 */
export class DelInfoGraphOutput extends Output {
  deleted_nodes = 0;
}

// ---------------------------------------------------------------------------
// clearGraph（一键清理某类文本图的节点与边）
// ---------------------------------------------------------------------------

/** clearGraph 入参（node_type 指定要清理的节点类型，如 Tag / keyword） */
export class ClearGraphInput extends Input {
  node_type!: string;
}

/** clearGraph 出参 */
export class ClearGraphOutput extends Output {
  deleted_nodes = 0;
}

// ---------------------------------------------------------------------------
// rebuildCitationGraph（迁移旧 info_graph 表到 GraphDB）
// ---------------------------------------------------------------------------

/** rebuildCitationGraph 入参（无业务字段，用于触发旧表迁移） */
export class RebuildCitationGraphInput extends Input {}

/** rebuildCitationGraph 出参 */
export class RebuildCitationGraphOutput extends Output {
  migrated_edges = 0;
  dropped_table = false;
}

// ---------------------------------------------------------------------------
// context
// ---------------------------------------------------------------------------

export type ContextCollectionSource = CollectionSource;

// ---------------------------------------------------------------------------
// 三对象结构（上下文加载结果，无 work_id 层，一次只取一个 work 的上下文）
// ---------------------------------------------------------------------------

/** 对象1：采集来源 → info_id 列表 */
export type ContextSourceIdMap = Partial<Record<CollectionSource, string[]>>;

/** 对象2：info_id → 消息内容 */
export type ContextContentMap = Record<string, string>;

/** 对象3 的单个值：消息属性（不含内容，内容在对象2） */
export interface ContextInfoAttribute {
  info_id: string;
  session_id: string;
  work_id: string;
  run_id: string;
  info_type: InfoType | string;
  info_creator_role: string;
  info_creator_id: string;
  pin: number;
  created: number;
  updated: number;
  handle_result_type: string;
}

/** 对象3：info_id → 消息属性 */
export type ContextAttributeMap = Record<string, ContextInfoAttribute>;

export interface ContextInfoItem {
  id: string;
  info_id: string;
  session_id: string;
  work_id: string;
  run_id: string;
  info_type: InfoType | string;
  info_creator_role?: string;
  info_creator_id?: string;
  info: string;
  content: string;
  summary: string;
  summary_length: number;
  info_length: number;
  content_length: number;
  collection_source: CollectionSource;
  source: CollectionSource | string;
  pin: number;
  created: number;
  updated: number;
  handle_result_type?: string;
}

/** 上下文分类结构 */
export interface ContextInfoCategories {
  selected: ContextInfoItem[];
  pinned: ContextInfoItem[];
  timeline: ContextInfoItem[];
  citing: ContextInfoItem[];
  tag_relative: ContextInfoItem[];
  similarity: ContextInfoItem[];
  keyword: ContextInfoItem[];
  random: ContextInfoItem[];
  /** 当前消息（本次问答输入）：从时间线中单独拆出，不参与时间线/上下文拼接 */
  current: ContextInfoItem[];
}

/** context 入参 */
export class ContextInfoInput extends Input {
  session_id!: string;
  /** 本次问答的 work_id（上下文区分维度，落盘 info_context_source 表），必填 */
  work_id!: string;
  info_id?: string;
  /** 参考信息文本内容，用于检索语义相似/关键词/标签关联消息 */
  info?: string;
  /**
   * 构建模式：已废弃，保留字段以兼容旧调用。上下文构建不再区分 DEFAULT/CUSTOM 两种模式，
   * 复选消息（selected_msg_ids / custom_info_ids）在提供时自动替换时间线，其余维度逻辑不变。
   * @deprecated
   */
  mode?: 'DEFAULT' | 'CUSTOM' | string;
  /** 复选消息 ID 列表（勾选后复选消息替换时间线，其余维度逻辑不变） */
  selected_msg_ids?: string[];
  /** 自定义指定消息 ID 列表（等同 selected_msg_ids） */
  custom_info_ids?: string[];
  /**
   * 是否允许跨会话召回（TAG_RELATIVE / SIMILARITY / KEYWORD / RANDOM 全局兜底）。
   * 默认 true。跨会话召回是 Agent 长程记忆的核心维度，一般保持开启；
   * 仅在确有需要隔离历史会话的极特殊场景才显式传 false。
   */
  enable_cross_session?: boolean;
  /**
   * 是否将采集来源快照（source → info_id，仅 ID 不含内容）落盘到 info_context_source 表。
   * 默认 true。内部 Agent（execAgent / Planner / Writer / IntentAgent）复用 context() 仅需查询结果，
   * 不应覆盖本次问答在「问答请求处理时」生成的权威快照，须显式传 false，避免快照混入问答之后的信息
   * 或非确定性（随机采样 / 语义相似 / 关键词 / 标签）召回结果，导致展示与执行不一致。
   */
  persist_snapshot?: boolean;
}

/** context 出参 */
export class ContextInfoOutput extends Output {
  list: ContextInfoItem[] = [];
  categories?: ContextInfoCategories;
  category_ids?: {
    selected: string[];
    pinned: string[];
    timeline: string[];
    citing: string[];
    tag_relative: string[];
    similarity: string[];
    keyword: string[];
    random: string[];
    current: string[];
  };
  sources_summary?: Record<string, number>;
  /** 对象1：采集来源 → info_id 列表（无 work_id 层） */
  source_ids_map?: ContextSourceIdMap;
  /** 对象2：info_id → 消息内容 */
  content_map?: ContextContentMap;
  /** 对象3：info_id → 消息属性 */
  attribute_map?: ContextAttributeMap;
}

// ---------------------------------------------------------------------------
// soContextByWork
// ---------------------------------------------------------------------------

/** soContextByWork 入参：按 work_id 查询该次问答的上下文 */
export class SoContextByWorkInput extends Input {
  work_id!: string;
}

/** soContextByWork 出参：返回三对象结构（来源→ID、ID→内容、ID→属性） */
export class SoContextByWorkOutput extends Output {
  source_ids_map: ContextSourceIdMap = {};
  content_map: ContextContentMap = {};
  attribute_map: ContextAttributeMap = {};
}

// ---------------------------------------------------------------------------
// 配置 CRUD
// ---------------------------------------------------------------------------

/** soInfoTagConfig 入参 */
export class SoInfoTagConfigInput extends Input {}
/** soInfoTagConfig 出参 */
export class SoInfoTagConfigOutput extends Output {
  config: InfoTagConfigRecord | null = null;
}

/** updateInfoTagConfig 入参 */
export class UpdateInfoTagConfigInput extends Input {
  llm_id?: string;
  prompt_template_id?: string;
  tag_top_k?: number;
  enable?: number;
}
/** updateInfoTagConfig 出参 */
export class UpdateInfoTagConfigOutput extends Output {}

/** soInfoSummaryConfig 入参 */
export class SoInfoSummaryConfigInput extends Input {}
/** soInfoSummaryConfig 出参 */
export class SoInfoSummaryConfigOutput extends Output {
  config: InfoSummaryConfigRecord | null = null;
}

/** updateInfoSummaryConfig 入参 */
export class UpdateInfoSummaryConfigInput extends Input {
  llm_id?: string;
  prompt_template_id?: string;
  enable?: number;
  threshold?: number;
  info_types?: string;
}
/** updateInfoSummaryConfig 出参 */
export class UpdateInfoSummaryConfigOutput extends Output {}

/** soInfoConfig 入参 */
export class SoInfoConfigInput extends Input {}
/** soInfoConfig 出参 */
export class SoInfoConfigOutput extends Output {
  config: InfoConfigRecord | null = null;
}

/** updateInfoConfig 入参 */
export class UpdateInfoConfigInput extends Input {
  alive_max_days?: number;
}
/** updateInfoConfig 出参 */
export class UpdateInfoConfigOutput extends Output {}

/** soInfoVectorConfig 入参 */
export class SoInfoVectorConfigInput extends Input {}
/** soInfoVectorConfig 出参 */
export class SoInfoVectorConfigOutput extends Output {
  config: InfoVectorConfigRecord | null = null;
}

/** updateInfoVectorConfig 入参 */
export class UpdateInfoVectorConfigInput extends Input {
  llm_id?: string;
  dimension?: number;
  enable?: number;
  chunk_size?: number;
  chunk_overlap?: number;
}
/** updateInfoVectorConfig 出参 */
export class UpdateInfoVectorConfigOutput extends Output {}

/** soInfoContextConfig 入参 */
export class SoInfoContextConfigInput extends Input {}
/** soInfoContextConfig 出参 */
export class SoInfoContextConfigOutput extends Output {
  config: InfoContextConfigRecord | null = null;
}

/** updateInfoContextConfig 入参 */
export class UpdateInfoContextConfigInput extends Input {
  base_timeline_count?: number;
  base_tag_relative_count?: number;
  base_similarity_count?: number;
  base_keyword_count?: number;
  base_random_count?: number;
  random_max_percent?: number;
  tag_relative_max_percent?: number;
  similarity_max_percent?: number;
  keyword_max_percent?: number;
  keyword_score_threshold?: number;
  total?: number;
  enable_snapshot_persistence?: number | boolean;
  priority_order?: string;
}
/** updateInfoContextConfig 出参 */
export class UpdateInfoContextConfigOutput extends Output {}

// ---------------------------------------------------------------------------
// delInfo (age cleanup)
// ---------------------------------------------------------------------------

/** delInfo 入参 */
export class DelInfoInput extends Input {}

/** delInfo 出参 */
export class DelInfoOutput extends Output {
  deleted_count = 0;
}

// ---------------------------------------------------------------------------
// updateInfo (rewrite info content, e.g. intent confirmation APPROVE)
// ---------------------------------------------------------------------------

/** updateInfo 入参：按 work_id + info_type 定位并改写 info 内容 */
export class UpdateInfoInput extends Input {
  work_id!: string;
  info_type!: string;
  info!: string;
}

/** updateInfo 出参 */
export class UpdateInfoOutput extends Output {
  updated_count = 0;
}

// ---------------------------------------------------------------------------
// delInfoByWork (delete all info of a work, e.g. intent confirmation CANCEL)
// ---------------------------------------------------------------------------

/** delInfoByWork 入参：按 work_id 删除该工作落库的全部信息及派生数据 */
export class DelInfoByWorkInput extends Input {
  work_id!: string;
}

/** delInfoByWork 出参 */
export class DelInfoByWorkOutput extends Output {
  deleted_count = 0;
}

// ===== 新增（2026-09-15 记忆集中）：会话级信息管理 =====
/** delInfoBySession 入参：sessions_info 表 session_id 维度删除 */
export class DelInfoBySessionInput extends Input {
  session_id!: string;
}

/** delInfoBySession 出参 */
export class DelInfoBySessionOutput extends Output {
  deleted_count = 0;
  deleted_work_ids: string[] = [];
}

// ---------------------------------------------------------------------------
// Assist — exist checks
// ---------------------------------------------------------------------------

/** exist check 入参 */
export class ExistInfoInput extends Input {
  info_id!: string;
}
/** exist check 出参 */
export class ExistInfoOutput extends Output {
  exists = false;
}

// ---------------------------------------------------------------------------
// 表名常量
// ---------------------------------------------------------------------------

export const INFO_RAW_TABLE = 'info_raw';
export const INFO_CONTEXT_SOURCE_TABLE = 'info_context_source';
export const INFO_VECTOR_TABLE = 'info_vector';
export const INFO_TAG_TABLE = 'info_tag';
export const INFO_TAG_VECTOR_TABLE = 'info_tag_vector';
export const INFO_SUMMARY_TABLE = 'info_summary';
export const INFO_KEYWORD_TABLE = 'info_keyword';
export const INFO_TAG_CONFIG_TABLE = 'info_tag_config';
export const INFO_SUMMARY_CONFIG_TABLE = 'info_summary_config';
export const INFO_CONFIG_TABLE = 'info_config';
export const INFO_VECTOR_CONFIG_TABLE = 'info_vector_config';
export const INFO_CONTEXT_CONFIG_TABLE = 'info_context_config';

// ---------------------------------------------------------------------------
// 默认配置
// ---------------------------------------------------------------------------

export const DEFAULT_TAG_TOP_K = 5;
export const DEFAULT_ALIVE_MAX_DAYS = 30;
export const DEFAULT_VECTOR_DIMENSION = 1536;
export const DEFAULT_SUMMARY_THRESHOLD = 100;
export const DEFAULT_SUMMARY_INFO_TYPES = 'RESPONSE';
export const DEFAULT_BASE_TIMELINE_COUNT = 500;
export const DEFAULT_BASE_TAG_RELATIVE_COUNT = 200;
export const DEFAULT_BASE_SIMILARITY_COUNT = 150;
export const DEFAULT_BASE_KEYWORD_COUNT = 100;
export const DEFAULT_BASE_RANDOM_COUNT = 50;
export const DEFAULT_CONTEXT_TOTAL = 1000;
