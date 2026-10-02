import { Input, Context, Output, InfoType, CollectionSource } from '@brian-agent/base';

export class InfoCoreContext extends Context {}

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

export interface InfoVectorRecord {
  id: string;
  created: number;
  updated: number;
  info_id: string;
  embedding: string;
}

export interface InfoTagRecord {
  id: string;
  created: number;
  updated: number;
  info_id: string;
  tag: string;
}

export interface InfoTagVectorRecord {
  id: string;
  created: number;
  updated: number;
  tag_id: string;
  embedding: string;
}

export interface InfoSummaryRecord {
  id: string;
  created: number;
  updated: number;
  info_id: string;
  summary: string;
}

export interface InfoKeywordRecord {
  id: string;
  created: number;
  info_id: string;
  word: string;
}

export interface InfoTagConfigRecord {
  id: string;
  created: number;
  updated: number;
  llm_id: string;
  prompt_template_id: string;
  tag_top_k: number;
  enable: number;
}

export interface InfoSummaryConfigRecord {
  id: string;
  created: number;
  updated: number;
  llm_id: string;
  prompt_template_id: string;
  enable: number;
  
  threshold: number;
  
  info_types: string;
}

export interface InfoConfigRecord {
  id: string;
  created: number;
  updated: number;
  alive_max_days: number;
}

export interface InfoVectorConfigRecord {
  id: string;
  created: number;
  updated: number;
  llm_id: string;
  dimension: number;
  enable: number;
  
  chunk_size: number;
  
  chunk_overlap: number;
}

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

export interface ContextPriorityStrategy {
  id: string;
  name: string;
  description: string;
  order: string;
  sources: CollectionSource[];
}

export const CONTEXT_PRIORITY_STRATEGIES: Record<string, ContextPriorityStrategy> = {
  DEFAULT: {
    id: 'DEFAULT',
    name: '默认策略',
    description: '标准平衡模式：优先保留强上下文（钉住/引用/时间线），均衡兼顾标签聚类与语义相似度',
    order: 'PINNED,CITING,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM',
    sources: [
      CollectionSource.PINNED,
      CollectionSource.CITING,
      CollectionSource.TIMELINE,
      CollectionSource.TAG_RELATIVE,
      CollectionSource.SIMILARITY,
      CollectionSource.KEYWORD,
      CollectionSource.RANDOM,
    ],
  },
  TIMELINE_FIRST: {
    id: 'TIMELINE_FIRST',
    name: '时序优先策略',
    description: '对话连续模式：突出本会话近期连续对话记录，防止时序消息被弱维度稀释',
    order: 'PINNED,CITING,TIMELINE,SIMILARITY,TAG_RELATIVE,KEYWORD,RANDOM',
    sources: [
      CollectionSource.PINNED,
      CollectionSource.CITING,
      CollectionSource.TIMELINE,
      CollectionSource.SIMILARITY,
      CollectionSource.TAG_RELATIVE,
      CollectionSource.KEYWORD,
      CollectionSource.RANDOM,
    ],
  },
  SEMANTIC_FIRST: {
    id: 'SEMANTIC_FIRST',
    name: '语义优先策略',
    description: '知识检索模式：跨会话深度问答场景，优先保留语义向量高度相似的历史记忆',
    order: 'PINNED,CITING,SIMILARITY,TAG_RELATIVE,KEYWORD,TIMELINE,RANDOM',
    sources: [
      CollectionSource.PINNED,
      CollectionSource.CITING,
      CollectionSource.SIMILARITY,
      CollectionSource.TAG_RELATIVE,
      CollectionSource.KEYWORD,
      CollectionSource.TIMELINE,
      CollectionSource.RANDOM,
    ],
  },
  TAG_FIRST: {
    id: 'TAG_FIRST',
    name: '主题标签优先策略',
    description: '主题聚焦模式：围绕同主题标签与知识图谱共现关系优先聚类历史消息',
    order: 'PINNED,CITING,TAG_RELATIVE,SIMILARITY,KEYWORD,TIMELINE,RANDOM',
    sources: [
      CollectionSource.PINNED,
      CollectionSource.CITING,
      CollectionSource.TAG_RELATIVE,
      CollectionSource.SIMILARITY,
      CollectionSource.KEYWORD,
      CollectionSource.TIMELINE,
      CollectionSource.RANDOM,
    ],
  },
  STRICT_FOCUS: {
    id: 'STRICT_FOCUS',
    name: '强约束聚焦策略',
    description: '精准聚焦模式：仅保留用户明确钉住、选定引用与本会话时序记录，不引入弱维度发散',
    order: 'PINNED,CITING,TIMELINE',
    sources: [
      CollectionSource.PINNED,
      CollectionSource.CITING,
      CollectionSource.TIMELINE,
    ],
  },
};

export const DEFAULT_CONTEXT_PRIORITY_STRATEGY = CONTEXT_PRIORITY_STRATEGIES.DEFAULT;

export class SaveInfoInput extends Input {
  session_id!: string;
  work_id!: string;
  run_id!: string;
  

  trace_id?: string;
  info_type!: string;
  info_creator_role?: string;
  info_creator_id?: string;
  info!: string;
  

  created?: number;
  parent_info_ids?: string[];
  
  summary?: string;
  
  handle_result_type?: string;
}

export class SaveInfoOutput extends Output {
  info_id = '';
}

export class PinInfoInput extends Input {
  info_id!: string;
}

export class PinInfoOutput extends Output {
  pin: number = 0;
}

export class ProcessInfoInput extends Input {
  info_id!: string;
}

export class VectorInfoOutput extends Output {
  vector_id = '';
}

export class TagInfoOutput extends Output {
  tags: string[] = [];
}

export class SummaryInfoOutput extends Output {
  summary_id = '';
}

export class KeywordInfoOutput extends Output {
  keywords: string[] = [];
}

export class BackfillMissingSummariesInput extends Input {}

export class BackfillMissingSummariesOutput extends Output {
  backfilled_count = 0;
}

export class GraphTagInput extends Input {
  tag_id!: string;
}

export class GraphTagOutput extends Output {
  node_id = '';
}

export class RebuildCooccurGraphInput extends Input {}

export class RebuildCooccurGraphOutput extends Output {
  
  deleted_edges = 0;
  
  rebuilt_edges = 0;
  
  purged_rows = 0;
}

export class LastNInfoInput extends Input {
  session_id?: string;
  work_id?: string;
  run_id?: string;
  info_type?: string;
  info_creator_role?: string;
  info_creator_id?: string;
  info_id?: string;
  
  handle_result_type?: string;
  lastN!: number;
}

export class LastNInfoOutput extends Output {
  list: InfoRawRecord[] = [];
}

export class GraphNInfoInput extends Input {
  info_id!: string;
  lastN!: number;
  
  handle_result_type?: string;
}

export class GraphNInfoOutput extends Output {
  list: InfoRawRecord[] = [];
}

export class SimilarKInfoInput extends Input {
  info!: string;
  topK!: number;
  
  similarity_threshold?: number;
}

export class SimilarKInfoOutput extends Output {
  list: Array<InfoRawRecord & { score?: number; matched_chunks?: string[] }> = [];
}

export class KeywordKInfoInput extends Input {
  info!: string;
}

export class KeywordKInfoOutput extends Output {
  list: Array<InfoRawRecord & { keyword_match_count?: number; keyword_score?: number }> = [];
}

export class RelationKInfoInput extends Input {
  info_id!: string;
  topN!: number;
}

export class RelationKInfoOutput extends Output {
  list: Array<InfoRawRecord & { relevance_score?: number }> = [];
}

export class GraphInfoInput extends Input {
  session_id!: string;
  
  handle_result_type?: string;
}

export class GraphInfoOutput extends Output {
  graph: {
    nodes: Array<{ id: string; label: string; info_id: string; info_type?: string; info_creator_role?: string; handle_result_type?: string }>;
    edges: Array<{ id: string; from: string; to: string; citing_info_id: string; cited_info_id: string; edge_type?: string }>;
  } = { nodes: [], edges: [] };
}

export class SoCitationEdgesInput extends Input {
  session_id?: string;
  citing_info_id?: string;
  cited_info_id?: string;
}

export class SoCitationEdgesOutput extends Output {
  edges: Array<{ id: string; citing_info_id: string; cited_info_id: string; session_id: string }> = [];
}

export class DelInfoGraphInput extends Input {
  info_ids!: string[];
}

export class DelInfoGraphOutput extends Output {
  deleted_nodes = 0;
}

export class ClearGraphInput extends Input {
  node_type!: string;
}

export class ClearGraphOutput extends Output {
  deleted_nodes = 0;
}

export class RebuildCitationGraphInput extends Input {}

export class RebuildCitationGraphOutput extends Output {
  migrated_edges = 0;
  dropped_table = false;
}

export type ContextCollectionSource = CollectionSource;

export type ContextSourceIdMap = Partial<Record<CollectionSource, string[]>>;

export type ContextContentMap = Record<string, string>;

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

export interface ContextInfoCategories {
  selected: ContextInfoItem[];
  pinned: ContextInfoItem[];
  timeline: ContextInfoItem[];
  citing: ContextInfoItem[];
  tag_relative: ContextInfoItem[];
  similarity: ContextInfoItem[];
  keyword: ContextInfoItem[];
  random: ContextInfoItem[];
  
  current: ContextInfoItem[];
}

export class ContextInfoInput extends Input {
  session_id!: string;
  
  work_id!: string;
  info_id?: string;
  
  info?: string;
  

  mode?: 'DEFAULT' | 'CUSTOM' | string;
  
  selected_msg_ids?: string[];
  
  custom_info_ids?: string[];
  
  pinned_msg_ids?: string[];
  

  enable_cross_session?: boolean;
  

  persist_snapshot?: boolean;

  round?: number;
}

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
  
  source_ids_map?: ContextSourceIdMap;
  
  content_map?: ContextContentMap;
  
  attribute_map?: ContextAttributeMap;
}

export class SoContextByWorkInput extends Input {
  work_id!: string;
}

export class SoContextByWorkOutput extends Output {
  source_ids_map: ContextSourceIdMap = {};
  content_map: ContextContentMap = {};
  attribute_map: ContextAttributeMap = {};
}

export class SoInfoTagConfigInput extends Input {}

export class SoInfoTagConfigOutput extends Output {
  config: InfoTagConfigRecord | null = null;
}

export class UpdateInfoTagConfigInput extends Input {
  llm_id?: string;
  prompt_template_id?: string;
  tag_top_k?: number;
  enable?: number;
}

export class UpdateInfoTagConfigOutput extends Output {}

export class SoInfoSummaryConfigInput extends Input {}

export class SoInfoSummaryConfigOutput extends Output {
  config: InfoSummaryConfigRecord | null = null;
}

export class UpdateInfoSummaryConfigInput extends Input {
  llm_id?: string;
  prompt_template_id?: string;
  enable?: number;
  threshold?: number;
  info_types?: string;
}

export class UpdateInfoSummaryConfigOutput extends Output {}

export class SoInfoConfigInput extends Input {}

export class SoInfoConfigOutput extends Output {
  config: InfoConfigRecord | null = null;
}

export class UpdateInfoConfigInput extends Input {
  alive_max_days?: number;
}

export class UpdateInfoConfigOutput extends Output {}

export class SoInfoVectorConfigInput extends Input {}

export class SoInfoVectorConfigOutput extends Output {
  config: InfoVectorConfigRecord | null = null;
}

export class UpdateInfoVectorConfigInput extends Input {
  llm_id?: string;
  dimension?: number;
  enable?: number;
  chunk_size?: number;
  chunk_overlap?: number;
}

export class UpdateInfoVectorConfigOutput extends Output {}

export class SoInfoContextConfigInput extends Input {}

export class SoInfoContextConfigOutput extends Output {
  config: InfoContextConfigRecord | null = null;
}

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

export class UpdateInfoContextConfigOutput extends Output {}

export class DelInfoInput extends Input {}

export class DelInfoOutput extends Output {
  deleted_count = 0;
  deleted_vectors = 0;
}

export class UpdateInfoInput extends Input {
  work_id!: string;
  info_type!: string;
  info!: string;
}

export class UpdateInfoOutput extends Output {
  updated_count = 0;
}

export class DelInfoByWorkInput extends Input {
  work_id!: string;
}

export class DelInfoByWorkOutput extends Output {
  deleted_count = 0;
}

export class DelInfoBySessionInput extends Input {
  session_id!: string;
}

export class DelInfoBySessionOutput extends Output {
  deleted_count = 0;
  deleted_work_ids: string[] = [];
}

export class ExistInfoInput extends Input {
  info_id!: string;
}

export class ExistInfoOutput extends Output {
  exists = false;
}

export class CleanOrphanGraphNodesInput extends Input {
  node_types?: string[];
}

export class CleanOrphanGraphNodesOutput extends Output {
  deleted_node_count = 0;
  deleted_nodes: string[] = [];
}

export const DIALOG_TABLE = 'dialog_record';

export const DIALOG_EMBEDDING_TABLE = 'dialog_embedding_record';

/** 每轮话题匹配参与裁决的最近轮次向量上限 */
export const DIALOG_TOPIC_RECENT_ROUNDS = 20;

/** 话题连续性判定阈值(cosine×100):会话内轮次向量最大相似度≥该值视为同一话题 */
export const DIALOG_TOPIC_MATCH_SIMILARITY = 70;

export class SaveDialogEmbeddingInput extends Input {
  session_id!: string;
  work_id!: string;
  /** 参与向量化的拼接文本(用户请求+系统回复) */
  text!: string;
}

export class SaveDialogEmbeddingOutput extends Output {
  saved = false;
  dimension = 0;
  /** saved=false 时的原因:no_vector_model(未配置向量模型)/empty_vector(生成失败) */
  reason = '';
}

export class MatchDialogTopicInput extends Input {
  session_id!: string;
  query_text!: string;
}

export class MatchDialogTopicOutput extends Output {
  /** false=未评估(无向量模型/无可比轮次),调用方应回退既有亲和逻辑 */
  evaluated = false;
  /** 0-100,会话内最近轮次向量的最大 cosine 相似度 */
  best_similarity = 0;
  matched_work_id = '';
  compared_rounds = 0;
}

export { EXECUTE_TABLE } from '@brian-agent/base';
export const CONTEXT_TABLE = 'context_org';

export interface DialogRecord {
  id: string;
  created: number;
  updated: number;
  session_id: string;
  work_id: string;
  type: string;
  dialog: string;
  trace_id: string;
}

export interface DialogEmbeddingRecord {
  id: string;
  created: number;
  updated: number;
  session_id: string;
  work_id: string;
  embedding: string;
  dimension: number;
}

export interface ExecuteRecord {
  id: string;
  created: number;
  updated: number;
  session_id: string;
  work_id: string;
  run_id: string;
  trace_id: string;
  agent_id: string;
  exec_no: number;
  component_id: string;
  component_type: string;
  input: string;
  input_length: number;
  output: string;
  output_length: number;
  gap: number;
  status: string;
}

export interface ContextRecord {
  id: string;
  created: number;
  updated: number;
  session_id: string;
  work_id: string;
  round: number;
  dialog_id: string;
  type: string;
}
export const INFO_VECTOR_TABLE = 'info_vector_record';
export const INFO_TAG_TABLE = 'info_tag_record';
export const INFO_TAG_VECTOR_TABLE = 'info_tag_vector_record';
export const INFO_SUMMARY_TABLE = 'info_summary_record';
export const INFO_KEYWORD_TABLE = 'info_keyword_org';
export const INFO_TAG_CONFIG_TABLE = 'info_tag_config_record';
export const INFO_SUMMARY_CONFIG_TABLE = 'info_summary_config_record';
export const INFO_CONFIG_TABLE = 'info_config_record';
export const INFO_VECTOR_CONFIG_TABLE = 'info_vector_config_record';
export const INFO_CONTEXT_CONFIG_TABLE = 'info_context_config_record';

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
