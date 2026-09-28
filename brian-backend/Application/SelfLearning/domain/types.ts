import { Input, Context, Output } from '@brian-agent/base';

export class SelfLearningContext extends Context {
  library_id?: string;
}

export class AddLibraryInput extends Input {
  library_path!: string;
  library_name?: string;
  category?: string;
  description?: string;
  enable_self_learning?: boolean;
  learning_rate?: number;
}

export class AddLibraryOutput extends Output {
  library_id = '';
  file_count = 0;
}

export class DeleteLibraryInput extends Input {
  library_id!: string;
}

export class DeleteLibraryOutput extends Output {}

export class SearchLibraryInput extends Input {
  keyword?: string;
  page_current?: number;
  page_size?: number;
}

export class SearchLibraryOutput extends Output {
  libraries: Array<Record<string, unknown>> = [];
  total = 0;
}

export class SetLibraryEnabledInput extends Input {
  library_id!: string;
  enabled!: boolean;
}

export class SetLibraryEnabledOutput extends Output {
  enabled = false;
  file_count = 0;
  directory_count = 0;
}

export class GetLibraryFilesInput extends Input {
  library_id!: string;
  status?: string;
  
  directory?: string;
  
  keyword?: string;
  
  cursor?: string;
  
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

export class GetFileContentInput extends Input {
  file_id!: string;
}

export class GetFileContentOutput extends Output {
  file_name = '';
  content = '';
  learned_at?: number;
}

export class QueryDocumentInput extends Input {
  
  selection?: string;
  
  content?: string;
  
  context_before?: string;
  
  context_after?: string;
  
  question?: string;
  
  document_title?: string;
}

export class QueryDocumentOutput extends Output {
  result = '';
  llm_id = '';
}

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

export class UpdateFileContentInput extends Input {
  file_id!: string;
  
  content!: string;
}

export class UpdateFileContentOutput extends Output {
  file_name = '';
  content = '';
  
  size = 0;
}

export class DeleteFileInput extends Input {
  file_id!: string;
}

export class DeleteFileOutput extends Output {
  
  deleted_annotations = 0;
}

export const DOCUMENT_READING_AGENT_NAME = 'document_reading';

export const DOCUMENT_READING_SOUL_BRIEF = '文档伴读导师';

export const DOCUMENT_READING_SOUL_CONTENT = [
  '你是一位「文档伴读导师」，擅长把复杂的文档讲清楚，帮助读者真正读懂，而不是匆匆翻过。',
  '',
  '你的风格：',
  '- 耐心、亲切、有条理，先给结论，再用最少的必要细节把结论讲透；',
  '- 善于把抽象概念翻译成读者熟悉的语言，善用类比与最小示例；',
  '- 会主动点明概念之间的关系、前置知识与常见误区；',
  '- 回答只依据文档上下文与可靠常识，绝不编造；信息不足时坦率说明，并指出需要补充哪部分；',
  '- 语言简洁，沿用文档中的专业术语，默认使用中文（用户使用其他语言时跟随用户）。',
].join('\n');

export const DOCUMENT_READING_SOUL_USAGE = '资料库文档阅读：解释选中内容、举例与延伸讲解，帮助用户理解与学习文档';

export class StartLearningInput extends Input {
  library_id?: string;
  learning_mode?: string;
  learning_rate?: number;
}

export class StartLearningOutput extends Output {}

export class StopLearningInput extends Input {
  library_id?: string;
  learning_mode?: string;
}

export class StopLearningOutput extends Output {}

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

export class GetTagRelatedInfoInput extends Input {
  tag_id!: string;
  page_current?: number;
  page_size?: number;
}

export class GetTagRelatedInfoOutput extends Output {
  infos: Array<Record<string, unknown>> = [];
  total = 0;
}

export class GetLearningProgressInput extends Input {
  
  source?: string;
}

export class GetLearningProgressOutput extends Output {
  current_task: Record<string, unknown> | null = null;
  task_queue: Array<Record<string, unknown>> = [];
  builtin_tasks: Array<Record<string, unknown>> = [];
  
  running = false;
}

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

export class GetLearningStatsInput extends Input {
  
  source?: string;
}

export class GetLearningStatsOutput extends Output {
  stats: Record<string, unknown> = {};
}

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

export enum LearningTaskStatus {
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  
  Skipped = 'skipped',
}

export interface LearningPassResult {
  skipped?: boolean;
  error?: string;
  
  detail?: string;
}

export interface LearningTaskRecord {
  task_id: string;
  mode: 'DOCUMENT' | 'CONVERSATION' | 'TAG_MAINTENANCE' | 'ALL';
  label: string;
  status: LearningTaskStatus;
  started_at: number;
  finished_at?: number;
  error?: string;
  
  detail?: string;
}

export class ListLearningTasksInput extends Input {
  
  limit?: number;
}

export class ListLearningTasksOutput extends Output {
  tasks: LearningTaskRecord[] = [];
}
