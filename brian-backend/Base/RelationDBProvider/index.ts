/**
 * @fileoverview RelationDBProvider 模块统一导出。
 *
 * 对外暴露：
 * - access 层：RelationDBAccess（接入层，方法调用入口）
 * - domain 层：各 Input / Output / Context 类型（供调用方构造参数）
 * - infrastructure 层：SQLiteRelationDBRepository（供高级用法直接使用）
 */

// access 层
export { RelationDBAccess } from './access/RelationDBAccess';

// domain 层类型
export {
  DBContext,
  InsertDBInput,
  InsertDBOutput,
  DeleteDBInput,
  DeleteDBOutput,
  UpdateDBInput,
  UpdateDBOutput,
  SelectDBInput,
  SelectDBOutput,
  SelectOneDBInput,
  SelectOneDBOutput,
  CountDBInput,
  CountDBOutput,
  TransactionDBInput,
  TransactionDBOutput,
  VisualizedDBInput,
  VisualizedDBOutput,
  EnableDBInput,
  EnableDBOutput,
  CloseDBInput,
  CloseDBOutput,
  RELATIONDB_CONFIG_TABLE,
  RELATIONDB_DEFAULT_CONFIGS,
} from './domain/types';

// infrastructure 层（供高级用法）
export { SQLiteRelationDBRepository } from './infrastructure/SQLiteRelationDBRepository';
export type { SQLiteRelationDBOptions } from './infrastructure/SQLiteRelationDBRepository';
export { SqlBuilder } from './infrastructure/SqlBuilder';

// 仓储接口
export type { RelationDBRepository } from './domain/RelationDBRepository';
