/**
 * @fileoverview 项目公共查询对象定义。
 *
 * 根据 `RelationDBProvider-PRD.md` 第 2 节定义，这些查询对象为项目公共定义，
 * 被 LLMProvider、MCPProvider、SkillProvider、SoulProvider、PromptsProvider 等
 * 所有 Provider 直接引用。
 *
 * 包含：Condition（条件）、OrderBy（排序）、Page（分页）、DataObject（数据对象）、
 * QueryParam（查询参数）、Operation（事务操作）。
 */

/**
 * 条件操作符枚举。
 *
 * 定义 Condition.operator 的合法取值，覆盖常见 SQL WHERE 条件。
 */
export enum Operator {
  /** 等于（=） */
  EQ = 'EQ',
  /** 不等于（!=） */
  NE = 'NE',
  /** 大于（>） */
  GT = 'GT',
  /** 小于（<） */
  LT = 'LT',
  /** 大于等于（>=） */
  GE = 'GE',
  /** 小于等于（<=） */
  LE = 'LE',
  /** 模糊匹配 LIKE */
  LIKE = 'LIKE',
  /** 包含于列表 IN */
  IN = 'IN',
  /** 不包含于列表 NOT IN */
  NOT_IN = 'NOT_IN',
  /** 为空 IS NULL */
  IS_NULL = 'IS_NULL',
  /** 不为空 IS NOT NULL */
  IS_NOT_NULL = 'IS_NOT_NULL',
  /** 在区间内 BETWEEN */
  BETWEEN = 'BETWEEN',
}

/**
 * 条件间的逻辑关系枚举。
 */
export enum Logic {
  /** 与前一条件做 AND 组合（默认） */
  AND = 'AND',
  /** 与前一条件做 OR 组合 */
  OR = 'OR',
}

/**
 * 条件对象（Condition）。
 *
 * 用于删除、更新、查询的 WHERE 条件构造，多个条件之间通过 logic 字段组合。
 */
export interface Condition {
  /** 字段名 */
  field: string;
  /** 操作符，取值见 {@link Operator} */
  operator: Operator | string;
  /** 比较值；IS_NULL / IS_NOT_NULL 时可为空 */
  value?: unknown;
  /** 与前一条件的逻辑关系，AND（默认）/ OR */
  logic?: Logic | string;
}

/**
 * 排序方向枚举。
 */
export enum Direction {
  /** 升序（默认） */
  ASC = 'ASC',
  /** 降序 */
  DESC = 'DESC',
}

/**
 * 排序对象（OrderBy）。
 */
export interface OrderBy {
  /** 字段名 */
  field: string;
  /** 排序方向，ASC（默认）/ DESC */
  direction?: Direction | string;
}

/**
 * 分页对象（Page）。
 */
export interface Page {
  /** 当前页码，从 1 开始 */
  current: number;
  /** 每页记录数 */
  size: number;
}

/**
 * 数据对象（DataObject）。
 *
 * 用于新增、更新操作，以键值对形式描述字段名与字段值。
 */
export interface DataObject {
  /** 字段名 */
  field: string;
  /** 字段值 */
  value: unknown;
}

/**
 * 查询参数对象（QueryParam）。
 *
 * 封装表名、查询字段、条件、排序、分页等参数，供 selectDB / selectOneDB 使用。
 */
export interface QueryParam {
  /** 表名 */
  table: string;
  /** 查询字段列表，不指定则查询全部字段 */
  fields?: string[];
  /** 查询条件列表 */
  conditions?: Condition[];
  /** 排序字段列表 */
  order_by?: OrderBy[];
  /** 分页参数，不指定则不分页 */
  page?: Page;
  /** 分组字段列表 */
  group_by?: string[];
}

/**
 * 事务操作类型枚举。
 */
export enum OperationType {
  /** 新增 */
  INSERT = 'INSERT',
  /** 删除 */
  DELETE = 'DELETE',
  /** 更新 */
  UPDATE = 'UPDATE',
}

/**
 * 事务操作对象（Operation）。
 *
 * 用于 transactionDB，每项描述一个原子操作。
 */
export interface Operation {
  /** 操作类型，取值见 {@link OperationType} */
  type: OperationType | string;
  /** 表名 */
  table: string;
  /** 数据对象列表（INSERT / UPDATE 必填） */
  data?: DataObject[];
  /** 条件对象列表（DELETE / UPDATE 必填） */
  conditions?: Condition[];
}

/**
 * 可视化范围枚举。
 *
 * 各 Provider 的 visualized* 方法通用入参。
 */
export enum VisualScope {
  /** 健康状态（连接状态、响应时间） */
  HEALTH = 'health',
  /** 数据量统计 */
  VOLUME = 'volume',
  /** 磁盘占用 */
  DISK_USAGE = 'diskUsage',
}
