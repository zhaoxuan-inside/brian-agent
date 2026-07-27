/**
 * @fileoverview SQL 构建器。
 *
 * 将公共查询对象（Condition / OrderBy / Page / DataObject）转换为 SQLite 兼容的
 * SQL 片段与参数化绑定值。上层不接触 SQL，由本工具完成对象到 SQL 的映射，
 * 实现 PRD 第 1.3 条「由 Provider 内部完成对象到 SQL 的映射」。
 *
 * 安全性：所有值均通过参数化绑定（?占位符）传递，杜绝 SQL 注入。
 */

import { Operator, Logic, Direction } from '../../shared/query';
import type {
  Condition,
  DataObject,
  OrderBy,
  Page,
} from '../../shared/query';

/**
 * WHERE 子句构建结果。
 */
interface WhereClause {
  /** SQL 片段（不含 "WHERE" 关键字），为空字符串表示无条件 */
  sql: string;
  /** 绑定参数值列表 */
  params: unknown[];
}

/**
 * SQL 构建器。
 *
 * 提供静态方法，将查询对象转换为 SQL 片段。无状态、线程安全。
 */
export class SqlBuilder {
  /**
   * 构建 WHERE 子句。
   *
   * 多个条件之间通过 Condition.logic 字段组合（AND 默认 / OR）。
   *
   * @param conditions 条件列表
   * @returns WHERE 子句（sql 不含 "WHERE" 关键字）与参数
   */
  static buildWhere(conditions?: Condition[]): WhereClause {
    if (!conditions || conditions.length === 0) {
      return { sql: '', params: [] };
    }

    const parts: string[] = [];
    const params: unknown[] = [];

    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      // 第一个条件不需要逻辑连接词
      const logic = i === 0 ? '' : ` ${this.normalizeLogic(cond.logic)} `;
      const fragment = this.buildConditionFragment(cond);
      parts.push(`${logic}${fragment.sql}`);
      params.push(...fragment.params);
    }

    return { sql: parts.join(''), params };
  }

  /**
   * 构建单个条件的 SQL 片段。
   */
  private static buildConditionFragment(cond: Condition): WhereClause {
    const field = this.quoteIdentifier(cond.field);
    const op = this.normalizeOperator(cond.operator);

    switch (op) {
      case Operator.IS_NULL:
        return { sql: `${field} IS NULL`, params: [] };
      case Operator.IS_NOT_NULL:
        return { sql: `${field} IS NOT NULL`, params: [] };
      case Operator.IN: {
        const values = Array.isArray(cond.value) ? cond.value : [cond.value];
        if (values.length === 0) {
          // IN () 在 SQL 中非法，返回永假条件
          return { sql: '0', params: [] };
        }
        const placeholders = values.map(() => '?').join(', ');
        return { sql: `${field} IN (${placeholders})`, params: values };
      }
      case Operator.NOT_IN: {
        const values = Array.isArray(cond.value) ? cond.value : [cond.value];
        if (values.length === 0) {
          // NOT IN () 恒真，返回永真条件
          return { sql: '1', params: [] };
        }
        const placeholders = values.map(() => '?').join(', ');
        return { sql: `${field} NOT IN (${placeholders})`, params: values };
      }
      case Operator.BETWEEN: {
        const range = Array.isArray(cond.value) ? cond.value : [cond.value];
        const low = range[0];
        const high = range[1] ?? range[0];
        return { sql: `${field} BETWEEN ? AND ?`, params: [low, high] };
      }
      case Operator.LIKE:
        return { sql: `${field} LIKE ?`, params: [cond.value] };
      case Operator.EQ:
        return { sql: `${field} = ?`, params: [cond.value] };
      case Operator.NE:
        return { sql: `${field} != ?`, params: [cond.value] };
      case Operator.GT:
        return { sql: `${field} > ?`, params: [cond.value] };
      case Operator.LT:
        return { sql: `${field} < ?`, params: [cond.value] };
      case Operator.GE:
        return { sql: `${field} >= ?`, params: [cond.value] };
      case Operator.LE:
        return { sql: `${field} <= ?`, params: [cond.value] };
      default:
        // 未知操作符退化为等于
        return { sql: `${field} = ?`, params: [cond.value] };
    }
  }

  /**
   * 构建 ORDER BY 子句。
   *
   * @param order_by 排序字段列表
   * @returns ORDER BY 子句（不含 "ORDER BY" 关键字），为空表示不排序
   */
  static buildOrderBy(order_by?: OrderBy[]): string {
    if (!order_by || order_by.length === 0) {
      return '';
    }
    return order_by
      .map((o) => {
        const field = this.quoteIdentifier(o.field);
        const dir = this.normalizeDirection(o.direction);
        return `${field} ${dir}`;
      })
      .join(', ');
  }

  /**
   * 构建 LIMIT / OFFSET 子句。
   *
   * @param page 分页参数
   * @returns LIMIT / OFFSET 子句及参数
   */
  static buildLimit(page?: Page): { sql: string; params: number[] } {
    if (!page) {
      return { sql: '', params: [] };
    }
    const offset = (page.current - 1) * page.size;
    return { sql: 'LIMIT ? OFFSET ?', params: [page.size, offset] };
  }

  /**
   * 构建 INSERT 语句。
   *
   * @param table 表名
   * @param data 数据对象列表
   * @returns 完整 INSERT SQL 与参数
   */
  static buildInsert(
    table: string,
    data: DataObject[],
  ): { sql: string; params: unknown[] } {
    const tableName = this.quoteIdentifier(table);
    const fields = data.map((d) => this.quoteIdentifier(d.field));
    const placeholders = data.map(() => '?');
    const params = data.map((d) => d.value);
    const sql = `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;
    return { sql, params };
  }

  /**
   * 构建 UPDATE 语句的 SET 子句。
   *
   * @param data 待更新字段
   * @returns SET 子句（不含 "SET" 关键字）与参数
   */
  static buildSet(data: DataObject[]): { sql: string; params: unknown[] } {
    const parts = data.map((d) => `${this.quoteIdentifier(d.field)} = ?`);
    const params = data.map((d) => d.value);
    return { sql: parts.join(', '), params };
  }

  /**
   * 构建字段列表（SELECT 字段过滤）。
   *
   * @param fields 字段列表，不指定则返回 *
   */
  static buildFields(fields?: string[]): string {
    if (!fields || fields.length === 0) {
      return '*';
    }
    return fields.map((f) => this.quoteIdentifier(f)).join(', ');
  }

  /**
   * 构建 GROUP BY 子句。
   */
  static buildGroupBy(group_by?: string[]): string {
    if (!group_by || group_by.length === 0) {
      return '';
    }
    return group_by.map((g) => this.quoteIdentifier(g)).join(', ');
  }

  /**
   * 标识符转义（防 SQL 注入）。
   *
   * SQLite 使用双引号包裹标识符，内部双引号通过重复转义。
   */
  private static quoteIdentifier(name: string): string {
    if (!name || typeof name !== 'string') {
      throw new Error(`非法标识符: ${String(name)}`);
    }
    // 仅允许字母、数字、下划线；拒绝其他字符防止注入
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`标识符包含非法字符: ${name}`);
    }
    return `"${name}"`;
  }

  /**
   * 规范化操作符。
   */
  private static normalizeOperator(op: string): Operator {
    const upper = String(op).toUpperCase();
    return (Object.values(Operator) as string[]).includes(upper)
      ? (upper as Operator)
      : Operator.EQ;
  }

  /**
   * 规范化逻辑关系。
   */
  private static normalizeLogic(logic?: string): string {
    const upper = String(logic ?? '').toUpperCase();
    return upper === Logic.OR ? 'OR' : 'AND';
  }

  /**
   * 规范化排序方向。
   */
  private static normalizeDirection(dir?: string): string {
    const upper = String(dir ?? '').toUpperCase();
    return upper === Direction.DESC ? 'DESC' : 'ASC';
  }
}
