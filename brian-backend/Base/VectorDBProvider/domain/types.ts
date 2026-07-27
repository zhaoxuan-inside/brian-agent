/**
 * @fileoverview VectorDBProvider 领域层类型定义。
 *
 * 依据 `VectorDBProvider-PRD.md` 定义 VectorContext、VectorObject、VectorFilter、
 * VectorQueryParam 及各功能的 Input / Output 类型。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 *
 * 公共查询对象（Condition / OrderBy / Page / DataObject / QueryParam / Operation）
 * 定义于 shared/query，此处不重复定义。
 */

import { Input, Context, Output } from '../../shared/base';
import { VisualScope } from '../../shared/query';

/**
 * 向量上下文（VectorContext）。
 *
 * 继承 Context 基类，向量数据相关操作的执行上下文。
 */
export class VectorContext extends Context {}

/**
 * 向量数据对象（VectorObject）。
 *
 * 用于新增 / 更新操作，描述一条向量记录的完整信息。
 * id 为系统字段，新增时可选传入（不指定则自动生成），更新时作为主键。
 * created / updated 由 Provider 维护，不通过 Data 对象传入。
 */
export interface VectorObject {
  /** 向量 ID，不指定则自动生成 */
  id?: string;
  /** 原始文本内容 */
  content: string;
  /** 向量数据（浮点数组） */
  embedding: number[];
  /** 用户 ID，用于按用户过滤 */
  user_id?: string;
  /** 元数据，用于按条件过滤 */
  metadata?: Record<string, unknown>;
}

/**
 * 向量记录（VectorRecord）。
 *
 * 从向量数据库读取的完整记录（含系统字段）。
 */
export interface VectorRecord {
  /** 向量 ID */
  id: string;
  /** 原始文本内容 */
  content: string;
  /** 向量数据（浮点数组） */
  embedding: number[];
  /** 用户 ID */
  user_id: string | null;
  /** 元数据 */
  metadata: Record<string, unknown> | null;
  /** 创建时间（毫秒时间戳） */
  created: number;
  /** 最后更新时间（毫秒时间戳） */
  updated: number;
}

/**
 * 向量过滤对象（VectorFilter）。
 *
 * 用于搜索、统计、删除操作的元数据条件过滤，多个条件之间通过 logic 字段组合。
 * field 为 'user_id' 时按用户 ID 列过滤，否则按 metadata[field] 过滤。
 *
 * operator 取值与 shared/query 的 Operator 枚举一致：
 * EQ / NE / GT / LT / GE / LE / IN / NOT_IN / IS_NULL / IS_NOT_NULL。
 */
export interface VectorFilter {
  /** 元数据字段名（或 'user_id' 表示按用户 ID 过滤） */
  field: string;
  /** 操作符，取值见 shared/query Operator 枚举 */
  operator: string;
  /** 比较值；IS_NULL / IS_NOT_NULL 时可为空 */
  value?: unknown;
  /** 与前一条件的逻辑关系，AND（默认）/ OR */
  logic?: string;
}

/**
 * 向量查询参数对象（VectorQueryParam）。
 *
 * 用于相似性搜索操作，封装查询向量、过滤条件、返回数量、相似度阈值等参数。
 */
export interface VectorQueryParam {
  /** 查询向量（浮点数组） */
  embedding: number[];
  /** 返回结果数量，未指定时取配置 default_top_k（默认 10） */
  top_k?: number;
  /** 相似度阈值，未指定时取配置 default_similarity_threshold（默认 0.0），低于此值的结果不返回 */
  similarity_threshold?: number;
  /** 元数据过滤条件列表 */
  filters?: VectorFilter[];
  /** 按用户过滤（等价于 filters 中 field=user_id, operator=EQ） */
  user_id?: string;
}

/**
 * 向量搜索结果（VectorSearchResult）。
 *
 * soVector 返回的单条搜索结果，包含向量 id、内容、相似度分数、元数据。
 */
export interface VectorSearchResult {
  /** 向量 ID */
  id: string;
  /** 原始文本内容 */
  content: string;
  /** 相似度分数（余弦相似度，取值范围 [-1, 1]） */
  score: number;
  /** 用户 ID */
  user_id: string | null;
  /** 元数据 */
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// addVector
// ---------------------------------------------------------------------------

/** addVector 入参 */
export class AddVectorInput extends Input {
  /** 向量数据对象列表 */
  vectors!: VectorObject[];
}

/** addVector 出参 */
export class AddVectorOutput extends Output {
  /** 新增/更新的向量 ID 列表 */
  ids: string[] = [];
}

// ---------------------------------------------------------------------------
// delVector
// ---------------------------------------------------------------------------

/** delVector 入参 */
export class DelVectorInput extends Input {
  /** 向量 ID 列表（支持批量） */
  ids!: string[];
}

/** delVector 出参 */
export class DelVectorOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// delVectorByFilter
// ---------------------------------------------------------------------------

/** delVectorByFilter 入参 */
export class DelVectorByFilterInput extends Input {
  /** 向量过滤对象列表 */
  filters!: VectorFilter[];
}

/** delVectorByFilter 出参 */
export class DelVectorByFilterOutput extends Output {
  /** 删除的向量数量 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// soVector
// ---------------------------------------------------------------------------

/** soVector 入参 */
export class SoVectorInput extends Input {
  /** 向量查询参数对象 */
  query_param!: VectorQueryParam;
}

/** soVector 出参 */
export class SoVectorOutput extends Output {
  /** 搜索结果列表（按相似度降序） */
  list: VectorSearchResult[] = [];
}

// ---------------------------------------------------------------------------
// getVector
// ---------------------------------------------------------------------------

/** getVector 入参 */
export class GetVectorInput extends Input {
  /** 向量 ID */
  id!: string;
}

/** getVector 出参 */
export class GetVectorOutput extends Output {
  /** 向量信息，无匹配为 null */
  vector: VectorRecord | null = null;
}

// ---------------------------------------------------------------------------
// countVector
// ---------------------------------------------------------------------------

/** countVector 入参 */
export class CountVectorInput extends Input {
  /** 向量过滤对象列表，不指定则统计全部向量数量 */
  filters?: VectorFilter[];
}

/** countVector 出参 */
export class CountVectorOutput extends Output {
  /** 向量数量 */
  count = 0;
}

// ---------------------------------------------------------------------------
// visualizedVector
// ---------------------------------------------------------------------------

/** visualizedVector 入参 */
export class VisualizedVectorInput extends Input {
  /** 可视化范围：health / volume / diskUsage */
  scope!: VisualScope | string;
}

/** visualizedVector 出参 */
export class VisualizedVectorOutput extends Output {
  /** 可视化数据 */
  data: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// enableVectorDB
// ---------------------------------------------------------------------------

/** enableVectorDB 入参 */
export class EnableVectorDBInput extends Input {
  /** 是否启用 */
  enable!: boolean;
}

/** enableVectorDB 出参 */
export class EnableVectorDBOutput extends Output {}

// ---------------------------------------------------------------------------
// closeVectorDB
// ---------------------------------------------------------------------------

/** closeVectorDB 入参 */
export class CloseVectorDBInput extends Input {}

/** closeVectorDB 出参 */
export class CloseVectorDBOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名与默认配置
// ---------------------------------------------------------------------------

/** 向量数据表名（存储向量记录） */
export const VECTOR_RECORD_TABLE = 'vector_record';

/** VectorDBProvider 配置表名（存储于关系数据库） */
export const VECTORDB_CONFIG_TABLE = 'vectordb_config';

/**
 * VectorDBProvider 配置表默认配置项。
 *
 * PRD 4.2 节。
 */
export const VECTORDB_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: '向量数据库是否启用（enableVectorDB 读写）',
  },
  {
    config_key: 'default_top_k',
    config_value: '10',
    value_type: 'INT',
    description: '默认返回结果数量（soVector 读取）',
  },
  {
    config_key: 'default_similarity_threshold',
    config_value: '0.0',
    value_type: 'DOUBLE',
    description: '默认相似度阈值（soVector 读取）',
  },
  {
    config_key: 'default_distance_metric',
    config_value: 'COSINE',
    value_type: 'STRING',
    description: '默认距离度量方式（COSINE / L2 / IP）',
  },
] as const;
