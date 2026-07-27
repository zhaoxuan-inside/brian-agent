import { Input, Context, Output } from '../../shared/base';

export class VectorContext extends Context {
  constructor(data?: Partial<VectorContext>) {
    super(data);
  }
}

export interface VectorObject {
  id?: string;
  content: string;
  embedding: number[];
  user_id?: string;
  metadata?: Record<string, unknown>;
}

export interface VectorFilter {
  field: string;
  operator: 'EQ' | 'NE' | 'GT' | 'LT' | 'GE' | 'LE' | 'IN' | 'NOT_IN' | 'IS_NULL' | 'IS_NOT_NULL';
  value?: unknown;
  logic?: 'AND' | 'OR';
}

export interface VectorQueryParam {
  embedding: number[];
  top_k?: number;
  similarity_threshold?: number;
  filters?: VectorFilter[];
  user_id?: string;
}

export interface VectorDBSearchResult {
  id: string;
  content: string;
  user_id?: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface VectorRecord {
  id: string;
  content: string;
  embedding: number[];
  user_id?: string;
  metadata?: Record<string, unknown>;
  created: number;
  updated: number;
}

export class AddVectorInput extends Input {
  vectors: VectorObject[];
  constructor(data: { vectors: VectorObject[]; traceId?: string }) {
    super(data);
    this.vectors = data.vectors;
  }
}

export class AddVectorOutput extends Output {
  ids: string[] = [];
  constructor(data?: Partial<AddVectorOutput>) {
    super(data);
    if (data?.ids) this.ids = data.ids;
  }
}

export class DelVectorInput extends Input {
  ids: string[];
  constructor(data: { ids: string[]; traceId?: string }) {
    super(data);
    this.ids = data.ids;
  }
}

export class DelVectorOutput extends Output {
  affectedCount: number = 0;
  constructor(data?: Partial<DelVectorOutput>) {
    super(data);
    if (data?.affectedCount !== undefined) this.affectedCount = data.affectedCount;
  }
}

export class DelVectorByFilterInput extends Input {
  filters: VectorFilter[];
  constructor(data: { filters: VectorFilter[]; traceId?: string }) {
    super(data);
    this.filters = data.filters;
  }
}

export class DelVectorByFilterOutput extends Output {
  affectedCount: number = 0;
  constructor(data?: Partial<DelVectorByFilterOutput>) {
    super(data);
    if (data?.affectedCount !== undefined) this.affectedCount = data.affectedCount;
  }
}

export class SoVectorInput extends Input {
  query_param: VectorQueryParam;
  constructor(data: { query_param: VectorQueryParam; traceId?: string }) {
    super(data);
    this.query_param = data.query_param;
  }
}

export class SoVectorOutput extends Output {
  results: VectorDBSearchResult[] = [];
  constructor(data?: Partial<SoVectorOutput>) {
    super(data);
    if (data?.results) this.results = data.results;
  }
}

export class GetVectorInput extends Input {
  id: string;
  constructor(data: { id: string; traceId?: string }) {
    super(data);
    this.id = data.id;
  }
}

export class GetVectorOutput extends Output {
  vector?: VectorRecord;
  constructor(data?: Partial<GetVectorOutput>) {
    super(data);
    if (data?.vector !== undefined) this.vector = data.vector;
  }
}

export class CountVectorInput extends Input {
  filters?: VectorFilter[];
  constructor(data: { filters?: VectorFilter[]; traceId?: string }) {
    super(data);
    this.filters = data.filters;
  }
}

export class CountVectorOutput extends Output {
  count: number = 0;
  constructor(data?: Partial<CountVectorOutput>) {
    super(data);
    if (data?.count !== undefined) this.count = data.count;
  }
}

export class VisualizedVectorInput extends Input {
  scope: 'health' | 'volume' | 'diskUsage';
  constructor(data: { scope: 'health' | 'volume' | 'diskUsage'; traceId?: string }) {
    super(data);
    this.scope = data.scope;
  }
}

export class VisualizedVectorOutput extends Output {
  data?: Record<string, unknown>;
  constructor(data?: Partial<VisualizedVectorOutput>) {
    super(data);
    if (data?.data !== undefined) this.data = data.data;
  }
}

export class EnableVectorDBInput extends Input {
  enable: boolean;
  constructor(data: { enable: boolean; traceId?: string }) {
    super(data);
    this.enable = data.enable;
  }
}

export class EnableVectorDBOutput extends Output {
  constructor(data?: Partial<EnableVectorDBOutput>) {
    super(data);
  }
}

export class CloseVectorDBInput extends Input {
  constructor(data?: { traceId?: string }) {
    super(data || {});
  }
}

export class CloseVectorDBOutput extends Output {
  constructor(data?: Partial<CloseVectorDBOutput>) {
    super(data);
  }
}
