/**
 * @fileoverview RelationDBProvider 领域层类型定义。
 *
 * 依据 `RelationDBProvider-PRD.md` 定义 DBContext 及各功能的 Input / Output 类型。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 *
 * 公共查询对象（Condition / OrderBy / Page / DataObject / QueryParam / Operation）
 * 定义于 shared/query，此处不重复定义。
 */

import { Input, Context, Output } from '../../shared/base';
import type {
  Condition,
  DataObject,
  Operation,
  QueryParam,
} from '../../shared/query';
import { VisualScope } from '../../shared/query';

/**
 * 数据库上下文（DBContext）。
 *
 * 继承 Context 基类，关系数据库相关操作的执行上下文。
 */
export class DBContext extends Context {}

// ---------------------------------------------------------------------------
// insertDB
// ---------------------------------------------------------------------------

/**
 * insertDB 入参。
 */
export class InsertDBInput extends Input {
  /** 表名 */
  table!: string;
  /** 数据对象列表（每项为字段名与字段值的键值对） */
  data!: DataObject[];
}

/**
 * insertDB 出参。
 */
export class InsertDBOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// deleteDB
// ---------------------------------------------------------------------------

/**
 * deleteDB 入参。
 */
export class DeleteDBInput extends Input {
  /** 表名 */
  table!: string;
  /** 条件对象列表，不指定则删除全表记录 */
  conditions?: Condition[];
}

/**
 * deleteDB 出参。
 */
export class DeleteDBOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// updateDB
// ---------------------------------------------------------------------------

/**
 * updateDB 入参。
 */
export class UpdateDBInput extends Input {
  /** 表名 */
  table!: string;
  /** 待更新的字段名与字段值 */
  data!: DataObject[];
  /** 条件对象列表，不指定则更新全表记录 */
  conditions?: Condition[];
}

/**
 * updateDB 出参。
 */
export class UpdateDBOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// selectDB
// ---------------------------------------------------------------------------

/**
 * selectDB 入参。
 */
export class SelectDBInput extends Input {
  /** 查询参数对象 */
  query_param!: QueryParam;
}

/**
 * selectDB 出参。
 */
export class SelectDBOutput extends Output {
  /** 查询结果列表 */
  rows: Array<Record<string, unknown>> = [];
  /** 总记录数（分页场景下为符合条件的不分页总数） */
  total = 0;
}

// ---------------------------------------------------------------------------
// selectOneDB
// ---------------------------------------------------------------------------

/**
 * selectOneDB 入参。
 */
export class SelectOneDBInput extends Input {
  /** 查询参数对象 */
  query_param!: QueryParam;
}

/**
 * selectOneDB 出参。
 */
export class SelectOneDBOutput extends Output {
  /** 第一条匹配记录，无匹配为 null */
  row: Record<string, unknown> | null = null;
}

// ---------------------------------------------------------------------------
// countDB
// ---------------------------------------------------------------------------

/**
 * countDB 入参。
 */
export class CountDBInput extends Input {
  /** 表名 */
  table!: string;
  /** 条件对象列表，不指定则统计全表记录数 */
  conditions?: Condition[];
}

/**
 * countDB 出参。
 */
export class CountDBOutput extends Output {
  /** 记录总数 */
  count = 0;
}

// ---------------------------------------------------------------------------
// transactionDB
// ---------------------------------------------------------------------------

/**
 * transactionDB 入参。
 */
export class TransactionDBInput extends Input {
  /** 事务操作对象列表 */
  operations!: Operation[];
}

/**
 * transactionDB 出参。
 */
export class TransactionDBOutput extends Output {}

// ---------------------------------------------------------------------------
// visualizedDB
// ---------------------------------------------------------------------------

/**
 * visualizedDB 入参。
 */
export class VisualizedDBInput extends Input {
  /** 可视化范围：health / volume / diskUsage */
  scope!: VisualScope | string;
}

/**
 * visualizedDB 出参。
 */
export class VisualizedDBOutput extends Output {
  /** 可视化数据 */
  data: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// enableDB / closeDB
// ---------------------------------------------------------------------------

/**
 * enableDB 入参。
 */
export class EnableDBInput extends Input {
  /** 是否启用 */
  enable!: boolean;
}

/**
 * enableDB 出参。
 */
export class EnableDBOutput extends Output {}

/**
 * closeDB 入参。
 */
export class CloseDBInput extends Input {}

/**
 * closeDB 出参。
 */
export class CloseDBOutput extends Output {}

/**
 * RelationDBProvider 配置表默认配置项。
 *
 * 遵循 PRD 4.1 节：relationdb_config 表默认配置。
 */
export const RELATIONDB_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: '关系数据库是否启用（enableDB 读写）',
  },
] as const;

/**
 * RelationDBProvider 配置表名。
 */
export const RELATIONDB_CONFIG_TABLE = 'relationdb_config';
