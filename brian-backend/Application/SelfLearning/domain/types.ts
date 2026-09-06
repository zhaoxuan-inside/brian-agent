import { Input, Context, Output } from '@brian-agent/base';

export class SelfLearningContext extends Context {
  session_id?: string;
  library_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// addLibrary
// ─────────────────────────────────────────────────────────────────────────

export class AddLibraryInput extends Input {
  library_path!: string;
  library_name?: string;
  enable_self_learning?: boolean;
  learning_rate?: number;
}

export class AddLibraryOutput extends Output {
  library_id = '';
  file_count = 0;
}

// ─────────────────────────────────────────────────────────────────────────
// deleteLibrary
// ─────────────────────────────────────────────────────────────────────────

export class DeleteLibraryInput extends Input {
  library_id!: string;
}

export class DeleteLibraryOutput extends Output {}

// ─────────────────────────────────────────────────────────────────────────
// soLibrary
// ─────────────────────────────────────────────────────────────────────────

export class SearchLibraryInput extends Input {
  keyword?: string;
  page_current?: number;
  page_size?: number;
}

export class SearchLibraryOutput extends Output {
  libraries: Array<Record<string, unknown>> = [];
  total = 0;
}

// ─────────────────────────────────────────────────────────────────────────
// setLibraryEnabled
// ─────────────────────────────────────────────────────────────────────────

export class SetLibraryEnabledInput extends Input {
  library_id!: string;
  enabled!: boolean;
}

export class SetLibraryEnabledOutput extends Output {
  enabled = false;
  file_count = 0;
  directory_count = 0;
}

// ─────────────────────────────────────────────────────────────────────────
// soLibraryFiles
// ─────────────────────────────────────────────────────────────────────────

export class GetLibraryFilesInput extends Input {
  library_id!: string;
  status?: string;
  /** 当前目录相对路径（空字符串或 undefined 表示根目录） */
  directory?: string;
  /** 按文件名模糊搜索 */
  keyword?: string;
  /** 游标（格式 created:file_id） */
  cursor?: string;
  /** 每页条数 */
  limit?: number;
  page_current?: number;
  page_size?: number;
}

export class GetLibraryFilesOutput extends Output {
  files: Array<Record<string, unknown>> = [];
  total = 0;
  has_more = false;
  next_cursor: string | null = null;
}

// ─────────────────────────────────────────────────────────────────────────
// soLibraryTree
// ─────────────────────────────────────────────────────────────────────────

export class GetLibraryTreeInput extends Input {
  library_id!: string;
}

export interface LibraryTreeNode {
  file_id: string;
  name: string;
  relative_path: string;
  is_directory: boolean;
  children: LibraryTreeNode[];
}

export class GetLibraryTreeOutput extends Output {
  tree: LibraryTreeNode[] = [];
}

// ─────────────────────────────────────────────────────────────────────────
// soFileContent
// ─────────────────────────────────────────────────────────────────────────

export class GetFileContentInput extends Input {
  file_id!: string;
}

export class GetFileContentOutput extends Output {
  file_name = '';
  content = '';
  learned_at?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// queryDocument（文档内容选中解释）
// ─────────────────────────────────────────────────────────────────────────

export class QueryDocumentInput extends Input {
  /** 选中的内容 */
  selection?: string;
  /** 兼容旧字段：内容（selection 为空时回退使用） */
  content?: string;
  /** 选中内容的前文 */
  context_before?: string;
  /** 选中内容的后文 */
  context_after?: string;
  /** 用户输入的问题 */
  question?: string;
}

export class QueryDocumentOutput extends Output {
  result = '';
  llm_id = '';
}

// ─────────────────────────────────────────────────────────────────────────
// saveAnnotation / soFileAnnotations（文档咨询卡片持久化）
// ─────────────────────────────────────────────────────────────────────────

export class SaveAnnotationInput extends Input {
  library_id?: string;
  file_id!: string;
  selection_text!: string;
  selection_start!: number;
  selection_end!: number;
  question!: string;
  result!: string;
  llm_id?: string;
}

export class SaveAnnotationOutput extends Output {
  id = '';
}

export class GetFileAnnotationsInput extends Input {
  file_id!: string;
}

export class GetFileAnnotationsOutput extends Output {
  annotations: Array<Record<string, unknown>> = [];
}

// ─────────────────────────────────────────────────────────────────────────
// startLearning
// ─────────────────────────────────────────────────────────────────────────

export class StartLearningInput extends Input {
  library_id?: string;
  learning_mode?: string;
  learning_rate?: number;
}

export class StartLearningOutput extends Output {}

// ─────────────────────────────────────────────────────────────────────────
// stopLearning
// ─────────────────────────────────────────────────────────────────────────

export class StopLearningInput extends Input {
  library_id?: string;
  learning_mode?: string;
}

export class StopLearningOutput extends Output {}

// ─────────────────────────────────────────────────────────────────────────
// soTagGraph
// ─────────────────────────────────────────────────────────────────────────

export class GetTagGraphInput extends Input {
  only_active?: boolean;
  min_weight?: number;
  limit?: number;
}

export class GetTagGraphOutput extends Output {
  nodes: Array<Record<string, unknown>> = [];
  edges: Array<Record<string, unknown>> = [];
  metadata: Record<string, unknown> = {};
}

// ─────────────────────────────────────────────────────────────────────────
// soTagRelatedInfo
// ─────────────────────────────────────────────────────────────────────────

export class GetTagRelatedInfoInput extends Input {
  tag_id!: string;
  page_current?: number;
  page_size?: number;
}

export class GetTagRelatedInfoOutput extends Output {
  infos: Array<Record<string, unknown>> = [];
  total = 0;
}

// ─────────────────────────────────────────────────────────────────────────
// soLearningProgress
// ─────────────────────────────────────────────────────────────────────────

export class GetLearningProgressInput extends Input {
  /** 学习方式来源（DOCUMENT / CONVERSATION / TAG_MAINTENANCE），不传则返回全部 */
  source?: string;
}

export class GetLearningProgressOutput extends Output {
  current_task: Record<string, unknown> | null = null;
  task_queue: Array<Record<string, unknown>> = [];
  builtin_tasks: Array<Record<string, unknown>> = [];
  /** 学习引擎是否正在运行（任一后台定时器处于活动状态） */
  running = false;
}

// ─────────────────────────────────────────────────────────────────────────
// soLearningResults
// ─────────────────────────────────────────────────────────────────────────

export class GetLearningResultsInput extends Input {
  type?: string;
  source?: string;
  page_current?: number;
  page_size?: number;
}

export class GetLearningResultsOutput extends Output {
  results: Array<Record<string, unknown>> = [];
  total = 0;
}

// ─────────────────────────────────────────────────────────────────────────
// soLearningStats
// ─────────────────────────────────────────────────────────────────────────

export class GetLearningStatsInput extends Input {
  /** 学习方式来源（DOCUMENT / CONVERSATION / TAG_MAINTENANCE），不传则返回全局统计 */
  source?: string;
}

export class GetLearningStatsOutput extends Output {
  stats: Record<string, unknown> = {};
}

// ─────────────────────────────────────────────────────────────────────────
// configSelfLearning (internal)
// ─────────────────────────────────────────────────────────────────────────

export class ConfigSelfLearningInput extends Input {
  learning_mode?: string;
  document_auto_enable?: boolean;
  conversation_auto_enable?: boolean;
  tag_auto_enable?: boolean;
  document_random_factor?: number;
  conversation_random_factor?: number;
  tag_random_factor?: number;
  random_factor?: number;
  document_weight?: number;
  conversation_weight?: number;
  tag_maintenance_weight?: number;
  learning_interval_ms?: number;
  default_learning_rate?: number;
  tag_connection_check_interval_ms?: number;
  tag_aging_cron?: string;
  orphan_tag_check_cron?: string;
  document_split_threshold?: number;
  chunk_overlap_ratio?: number;
  document_query_prompt_template_id?: string;
  document_query_llm_id?: string;
}

export class ConfigSelfLearningOutput extends Output {
  config: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// 学习任务（手动触发的后台任务可视化）
// ---------------------------------------------------------------------------

/** 学习任务状态 */
export enum LearningTaskStatus {
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}

/** 学习任务记录 */
export interface LearningTaskRecord {
  task_id: string;
  mode: 'DOCUMENT' | 'CONVERSATION' | 'TAG_MAINTENANCE' | 'ALL';
  label: string;
  status: LearningTaskStatus;
  started_at: number;
  finished_at?: number;
  error?: string;
}

/** soLearningTasks 入参 */
export class ListLearningTasksInput extends Input {
  /** 最多返回条数（缺省 20） */
  limit?: number;
}

/** soLearningTasks 出参 */
export class ListLearningTasksOutput extends Output {
  tasks: LearningTaskRecord[] = [];
}
