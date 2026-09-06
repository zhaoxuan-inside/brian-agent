import { Input, Context, Output } from '@brian-agent/base';

export class MemoryContext extends Context {}

export interface MemoryItemDto {
  id: string;
  type: string;
  content: string;
  tags: string[];
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export class ListMemoryInput extends Input {
  limit = 50;
  cursor = '';
}

export class ListMemoryOutput extends Output {
  memories: MemoryItemDto[] = [];
  has_more = false;
  next_cursor: string | null = null;
}

export class SearchMemoryInput extends Input {
  keyword = '';
  type = '';
  tag = '';
  start_time?: number;
  end_time?: number;
  cursor = '';
  limit = 50;
}

export class SearchMemoryOutput extends ListMemoryOutput {}

export class GetMemoryByTagInput extends Input {
  tag = '';
}

export class GetMemoryByTagOutput extends Output {
  memories: MemoryItemDto[] = [];
}

export class DeleteMemoryInput extends Input {
  info_ids: string[] = [];
}

export class DeleteMemoryOutput extends Output {
  deleted_count = 0;
}

export class ListMemoryTagsInput extends Input {}
export class ListMemoryTagsOutput extends Output {
  tags: string[] = [];
}

export class GetCooccurGraphInput extends Input {
  limit = 100;
}

export class GetCooccurGraphOutput extends Output {
  nodes: Array<{ id: string; name: string; weight: number; degree: number }> = [];
  edges: Array<{ source: string; target: string; weight: number }> = [];
  error = '';
}

export class ClearTagGraphInput extends Input {}
export class ClearTagGraphOutput extends Output {
  deleted_nodes = 0;
}

export class ClearKeywordGraphInput extends Input {}
export class ClearKeywordGraphOutput extends Output {
  deleted_nodes = 0;
}

export class GraphSearchMemoryInput extends Input {
  query = '';
  max_depth = 2;
  only_active = true;
}

export class GraphSearchMemoryOutput extends Output {
  root_tags: Array<{ tag: string; info_ids: string[] }> = [];
  paths: Array<{
    root_tag: string;
    root_id: string;
    nodes: Array<{ id: string; tag: string; info_ids: string[]; depth: number }>;
    edges: Array<{ from_id: string; to_id: string; weight: number; active: boolean; compositeWeight: number }>;
  }> = [];
  error = '';
}

export class GetMemoryStatsInput extends Input {}
export class GetMemoryStatsOutput extends Output {
  totalMemories = 0;
  byType: Record<string, number> = {};
}

export class GetMemoryHeatmapInput extends Input {
  year = 0;
  month = 0;
}

export class GetMemoryHeatmapOutput extends Output {
  year = 0;
  month = 0;
  days: Record<string, number> = {};
}

export class GetMemoryDateCountsInput extends Input {
  tz = 0;
}

export class GetMemoryDateCountsOutput extends Output {
  dates: Record<string, number> = {};
}
