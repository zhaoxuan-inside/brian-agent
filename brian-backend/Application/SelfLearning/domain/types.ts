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
// searchLibrary
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
// getLibraryFiles
// ─────────────────────────────────────────────────────────────────────────

export class GetLibraryFilesInput extends Input {
  library_id!: string;
  status?: string;
  page_current?: number;
  page_size?: number;
}

export class GetLibraryFilesOutput extends Output {
  files: Array<Record<string, unknown>> = [];
  total = 0;
}

// ─────────────────────────────────────────────────────────────────────────
// getFileContent
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
// getTagGraph
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
// getTagRelatedInfo
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
// getLearningProgress
// ─────────────────────────────────────────────────────────────────────────

export class GetLearningProgressInput extends Input {}

export class GetLearningProgressOutput extends Output {
  current_task: Record<string, unknown> | null = null;
  task_queue: Array<Record<string, unknown>> = [];
  builtin_tasks: Array<Record<string, unknown>> = [];
}

// ─────────────────────────────────────────────────────────────────────────
// getLearningResults
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
// getLearningStats
// ─────────────────────────────────────────────────────────────────────────

export class GetLearningStatsInput extends Input {}

export class GetLearningStatsOutput extends Output {
  stats: Record<string, unknown> = {};
}

// ─────────────────────────────────────────────────────────────────────────
// configSelfLearning (internal)
// ─────────────────────────────────────────────────────────────────────────

export class ConfigSelfLearningInput extends Input {
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
}

export class ConfigSelfLearningOutput extends Output {
  config: Record<string, unknown> = {};
}
