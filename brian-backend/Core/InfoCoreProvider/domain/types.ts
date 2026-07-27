/**
 * @fileoverview InfoCoreProvider 领域层类型定义。
 *
 * 定义 InfoCoreContext、各功能的 Input / Output 类型、
 * 信息记录类型、表名常量与默认配置。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output } from '@brian-agent/base';
import type { Page } from '@brian-agent/base';

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
  interact_id: string;
  info_id: string;
  info_creator_id: string;
  info_creator_role: string;
  info: string;
  info_length: number;
  pin: number;
}

/** info_graph 表记录 */
export interface InfoGraphRecord {
  id: string;
  created: number;
  updated: number;
  session_id: string;
  info_id: string;
  citing_info_id: string;
  cited_info_id: string;
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
  total: number;
}

// ---------------------------------------------------------------------------
// saveInfo
// ---------------------------------------------------------------------------

/** saveInfo 入参 */
export class SaveInfoInput extends Input {
  session_id!: string;
  work_id!: string;
  interact_id!: string;
  info_creator_id!: string;
  info_creator_role!: string;
  info!: string;
  parent_info_ids?: string[];
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
// lastNInfo
// ---------------------------------------------------------------------------

/** lastNInfo 入参 */
export class LastNInfoInput extends Input {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
  info_creator_id?: string;
  info_creator_role?: string;
  info_id?: string;
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
}

/** similarKInfo 出参 */
export class SimilarKInfoOutput extends Output {
  list: Array<InfoRawRecord & { score?: number }> = [];
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
  list: Array<InfoRawRecord & { keyword_match_count?: number }> = [];
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
}

/** graphInfo 出参 */
export class GraphInfoOutput extends Output {
  graph: {
    nodes: Array<{ id: string; label: string; info_id: string }>;
    edges: Array<{ id: string; from: string; to: string; citing_info_id: string; cited_info_id: string }>;
  } = { nodes: [], edges: [] };
}

// ---------------------------------------------------------------------------
// context
// ---------------------------------------------------------------------------

/** context 入参 */
export class ContextInfoInput extends Input {
  session_id!: string;
  info_id?: string;
}

/** context 出参 */
export class ContextInfoOutput extends Output {
  list: InfoRawRecord[] = [];
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
  total?: number;
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
export const INFO_GRAPH_TABLE = 'info_graph';
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
export const DEFAULT_VECTOR_DIMENSION = 1024;
export const DEFAULT_BASE_TIMELINE_COUNT = 500;
export const DEFAULT_BASE_TAG_RELATIVE_COUNT = 200;
export const DEFAULT_BASE_SIMILARITY_COUNT = 150;
export const DEFAULT_BASE_KEYWORD_COUNT = 100;
export const DEFAULT_BASE_RANDOM_COUNT = 50;
export const DEFAULT_CONTEXT_TOTAL = 1000;
