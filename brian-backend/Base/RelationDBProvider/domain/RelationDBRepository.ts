import type {
  Condition,
  DataObject,
  Operation,
  QueryParam,
} from '../../shared/query';

export interface RelationDBRepository {
  

  insert(table: string, data: DataObject[]): number;

  

  delete(table: string, conditions?: Condition[]): number;

  

  update(table: string, data: DataObject[], conditions?: Condition[]): number;

  

  select(queryParam: QueryParam): Array<Record<string, unknown>>;

  

  selectOne(queryParam: QueryParam): Record<string, unknown> | null;

  

  count(table: string, conditions?: Condition[]): number;

  

  transaction(operations: Operation[]): boolean;

  

  executeRaw(sql: string, params?: unknown[]): number;

  

  queryRaw<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): T[];

  

  getDiskUsage(): number;

  

  close(): void;
}
