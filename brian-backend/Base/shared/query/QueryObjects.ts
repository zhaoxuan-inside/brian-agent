export enum Operator {
  
  EQ = 'EQ',
  
  NE = 'NE',
  
  GT = 'GT',
  
  LT = 'LT',
  
  GE = 'GE',
  
  LE = 'LE',
  
  LIKE = 'LIKE',
  
  IN = 'IN',
  
  NOT_IN = 'NOT_IN',
  
  IS_NULL = 'IS_NULL',
  
  IS_NOT_NULL = 'IS_NOT_NULL',
  
  BETWEEN = 'BETWEEN',
}

export enum Logic {
  
  AND = 'AND',
  
  OR = 'OR',
}

export interface Condition {
  
  field: string;
  
  operator: Operator | string;
  
  value?: unknown;
  
  logic?: Logic | string;
}

export enum Direction {
  
  ASC = 'ASC',
  
  DESC = 'DESC',
}

export interface OrderBy {
  
  field: string;
  
  direction?: Direction | string;
}

export interface Page {
  
  current: number;
  
  size: number;
}

export interface DataObject {
  
  field: string;
  
  value: unknown;
}

export interface QueryParam {
  
  table: string;
  
  fields?: string[];
  
  conditions?: Condition[];
  
  order_by?: OrderBy[];
  
  page?: Page;
  
  group_by?: string[];
}

export enum OperationType {
  
  INSERT = 'INSERT',
  
  DELETE = 'DELETE',
  
  UPDATE = 'UPDATE',
}

export interface Operation {
  
  type: OperationType | string;
  
  table: string;
  
  data?: DataObject[];
  
  conditions?: Condition[];
}

export enum VisualScope {
  
  HEALTH = 'health',
  
  VOLUME = 'volume',
  
  DISK_USAGE = 'diskUsage',
}
