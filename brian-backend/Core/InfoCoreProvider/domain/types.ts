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

export class PinInfoOutput extends Output {}

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

export const DIALOG_TABLE = 'dialog';
export const EXECUTE_TABLE = 'execute';
export const CONTEXT_TABLE = 'context';
export const INFO_RAW_TABLE = 'info_raw';
export const INFO_CONTEXT_SOURCE_TABLE = 'context';

export interface DialogRecord {
  id: string;
  created: number;
  updated: number;
  session_id: string;
  work_id: string;
  type: string;
  dialog: string;
  dialog_length: number;
  dialog_brief: string;
  trace_id: string;
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
}

export interface ContextRecord {
  id: string;
  created: number;
  updated: number;
  session_id: string;
  work_id: string;
  dialog_id: string;
  type: string;
}
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
