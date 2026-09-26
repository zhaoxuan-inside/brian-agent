export { VectorDBComponent } from '../components/VectorDB/VectorDBComponent';
export type {
  VectorRecord as ComponentVectorRecord,
  VectorSearchHit,
  VectorFilter as ComponentVectorFilter,
} from '../components/VectorDB/VectorDBComponent';

export { VectorDBAccess } from './access/VectorDBAccess';
export type { VectorDBAccessOptions } from './access/VectorDBAccess';

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
} from './domain/types';

export type {
  VectorObject,
  VectorRecord,
  VectorFilter,
  VectorQueryParam,
  VectorSearchResult,
} from './domain/types';

export { VectorDBSchemaInitializer } from './infrastructure/VectorDBSchemaInitializer';
