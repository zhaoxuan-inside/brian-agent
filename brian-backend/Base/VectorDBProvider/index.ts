/**
 * @fileoverview VectorDBProvider 模块统一导出。
 */

// 组件（congraphdb 向量数据库封装）
export { VectorDBComponent } from '../components/VectorDB/VectorDBComponent';
export type {
  VectorRecord as ComponentVectorRecord,
  VectorSearchHit,
  VectorFilter as ComponentVectorFilter,
} from '../components/VectorDB/VectorDBComponent';

// access 层
export { VectorDBAccess } from './access/VectorDBAccess';
export type { VectorDBAccessOptions } from './access/VectorDBAccess';

// domain 层类型
export {
  VectorContext,
  AddVectorInput,
  AddVectorOutput,
  DelVectorInput,
  DelVectorOutput,
  DelVectorByFilterInput,
  DelVectorByFilterOutput,
  SoVectorInput,
  SoVectorOutput,
  GetVectorInput,
  GetVectorOutput,
  CountVectorInput,
  CountVectorOutput,
  VisualizedVectorInput,
  VisualizedVectorOutput,
  EnableVectorDBInput,
  EnableVectorDBOutput,
  CloseVectorDBInput,
  CloseVectorDBOutput,
  VECTOR_RECORD_TABLE,
  VECTORDB_CONFIG_TABLE,
  VECTORDB_DEFAULT_CONFIGS,
} from './domain/types';

export type {
  VectorObject,
  VectorRecord,
  VectorFilter,
  VectorQueryParam,
  VectorSearchResult,
} from './domain/types';

// infrastructure 层
export { VectorDBSchemaInitializer } from './infrastructure/VectorDBSchemaInitializer';
