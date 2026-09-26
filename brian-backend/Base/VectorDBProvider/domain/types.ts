import { Input, Context, Output } from '../../shared/base';
import { VisualScope } from '../../shared/query';

export class VectorContext extends Context {}

export interface VectorObject {
  
  id?: string;
  
  content: string;
  
  embedding: number[];
  
  user_id?: string;
  
  metadata?: Record<string, unknown>;
}

export interface VectorRecord {
  
  id: string;
  
  content: string;
  
  embedding: number[];
  
  user_id: string | null;
  
  metadata: Record<string, unknown> | null;
  
  created: number;
  
  updated: number;
}

export interface VectorFilter {
  
  field: string;
  
  operator: string;
  
  value?: unknown;
  
  logic?: string;
}

export interface VectorQueryParam {
  
  embedding: number[];
  
  top_k?: number;
  
  similarity_threshold?: number;
  
  filters?: VectorFilter[];
  
  user_id?: string;
}

export interface VectorSearchResult {
  
  id: string;
  
  content: string;
  
  score: number;
  
  user_id: string | null;
  
  metadata: Record<string, unknown> | null;
}

export class AddVectorInput extends Input {
  
  vectors!: VectorObject[];
}

export class AddVectorOutput extends Output {
  
  ids: string[] = [];
}

export class DelVectorInput extends Input {
  
  ids!: string[];
}

export class DelVectorOutput extends Output {
  
  affected_rows = 0;
}

export class DelVectorByFilterInput extends Input {
  
  filters!: VectorFilter[];
}

export class DelVectorByFilterOutput extends Output {
  
  affected_rows = 0;
}

export class SoVectorInput extends Input {
  
  query_param!: VectorQueryParam;
}

export class SoVectorOutput extends Output {
  
  list: VectorSearchResult[] = [];
}

export class GetVectorInput extends Input {
  
  id!: string;
}

export class GetVectorOutput extends Output {
  
  vector: VectorRecord | null = null;
}

export class CountVectorInput extends Input {
  
  filters?: VectorFilter[];
}

export class CountVectorOutput extends Output {
  
  count = 0;
}

export class VisualizedVectorInput extends Input {
  
  scope!: VisualScope | string;
}

export class VisualizedVectorOutput extends Output {
  
  data: Record<string, unknown> = {};
}

export class EnableVectorDBInput extends Input {
  
  enable!: boolean;
}

export class EnableVectorDBOutput extends Output {}

export class CloseVectorDBInput extends Input {}

export class CloseVectorDBOutput extends Output {}

export const VECTOR_RECORD_TABLE = 'vector_record';

export const VECTORDB_CONFIG_TABLE = 'vectordb_config';
