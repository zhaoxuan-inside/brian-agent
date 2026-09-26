import { Operator, Logic, Direction } from '../../shared/query';
import type {
  Condition,
  DataObject,
  OrderBy,
  Page,
} from '../../shared/query';

interface WhereClause {
  
  sql: string;
  
  params: unknown[];
}

export class SqlBuilder {
  

  static buildWhere(conditions?: Condition[]): WhereClause {
    if (!conditions || conditions.length === 0) {
      return { sql: '', params: [] };
    }

    const parts: string[] = [];
    const params: unknown[] = [];

    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      
      const upperLogic = String(cond.logic ?? '').toUpperCase();
    const logic = i === 0 ? '' : ` ${upperLogic === Logic.OR ? 'OR' : 'AND'} `;
      const fragment = this.buildConditionFragment(cond);
      parts.push(`${logic}${fragment.sql}`);
      params.push(...fragment.params);
    }

    return { sql: parts.join(''), params };
  }

  

  private static buildConditionFragment(cond: Condition): WhereClause {
    const field = this.quoteIdentifier(cond.field);
    const upperOp = String(cond.operator).toUpperCase();
    const op = (Object.values(Operator) as string[]).includes(upperOp)
      ? (upperOp as Operator)
      : Operator.EQ;

    switch (op) {
      case Operator.IS_NULL:
        return { sql: `${field} IS NULL`, params: [] };
      case Operator.IS_NOT_NULL:
        return { sql: `${field} IS NOT NULL`, params: [] };
      case Operator.IN: {
        const values = Array.isArray(cond.value) ? cond.value : [cond.value];
        if (values.length === 0) {
          
          return { sql: '0', params: [] };
        }
        const placeholders = values.map(() => '?').join(', ');
        return { sql: `${field} IN (${placeholders})`, params: values };
      }
      case Operator.NOT_IN: {
        const values = Array.isArray(cond.value) ? cond.value : [cond.value];
        if (values.length === 0) {
          
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
        
        return { sql: `${field} = ?`, params: [cond.value] };
    }
  }

  

  static buildOrderBy(order_by?: OrderBy[]): string {
    if (!order_by || order_by.length === 0) {
      return '';
    }
    return order_by
      .map((o) => {
        const field = this.quoteIdentifier(o.field);
        const upperDir = String(o.direction ?? '').toUpperCase();
        const dir = upperDir === Direction.DESC ? 'DESC' : 'ASC';
        return `${field} ${dir}`;
      })
      .join(', ');
  }

  

  static buildLimit(page?: Page): { sql: string; params: number[] } {
    if (!page) {
      return { sql: '', params: [] };
    }
    const offset = (page.current - 1) * page.size;
    return { sql: 'LIMIT ? OFFSET ?', params: [page.size, offset] };
  }

  

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

  

  static buildSet(data: DataObject[]): { sql: string; params: unknown[] } {
    const parts = data.map((d) => `${this.quoteIdentifier(d.field)} = ?`);
    const params = data.map((d) => d.value);
    return { sql: parts.join(', '), params };
  }

  

  static buildFields(fields?: string[]): string {
    if (!fields || fields.length === 0) {
      return '*';
    }
    return fields.map((f) => this.quoteIdentifier(f)).join(', ');
  }

  

  static buildGroupBy(group_by?: string[]): string {
    if (!group_by || group_by.length === 0) {
      return '';
    }
    return group_by.map((g) => this.quoteIdentifier(g)).join(', ');
  }

  

  private static quoteIdentifier(name: string): string {
    if (!name || typeof name !== 'string') {
      throw new Error(`非法标识符: ${String(name)}`);
    }
    
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`标识符包含非法字符: ${name}`);
    }
    return `"${name}"`;
  }

}
