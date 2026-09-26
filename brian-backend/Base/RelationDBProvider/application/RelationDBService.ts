import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBRepository } from '../domain/RelationDBRepository';
import {
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
} from '../domain/types';
import { ComponentDisabledError, DatabaseError } from '../../shared/errors';
import { Operator } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
import { IdGenerator } from '../../ToolProvider/IdGenerator';

export class RelationDBService {
  
  private enabled = true;

  
  private closed = false;

  

  constructor(private readonly repository: RelationDBRepository) {}

  
  
  

  

  async initialize(): Promise<void> {
    
    const existing = this.repository.selectOne({
      table: RELATIONDB_CONFIG_TABLE,
      conditions: [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ],
    });
    if (!existing) {
      this.repository.insert(RELATIONDB_CONFIG_TABLE, [
        { field: 'config_key', value: 'enabled' },
        { field: 'config_value', value: 'true' },
        { field: 'value_type', value: 'BOOLEAN' },
        { field: 'description', value: '关系数据库组件是否启用' },
        { field: 'updated', value: IdGenerator.now() },
      ]);
    }

    
    const row = this.repository.selectOne({
      table: RELATIONDB_CONFIG_TABLE,
      conditions: [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ],
    });
    this.enabled = row ? String(row.config_value) === 'true' : true;
  }

  

  private ensureEnabled(): void {
    if (this.closed) {
      throw new DatabaseError('关系数据库已关闭（closeDB 为终态操作），需重新初始化组件');
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('DB');
    }
  }

  
  
  

  

  async insertDB(input: InsertDBInput, output: InsertDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.affected_rows = this.repository.insert(input.table, input.data);
    return true;
  }

  

  async deleteDB(input: DeleteDBInput, output: DeleteDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.affected_rows = this.repository.delete(input.table, input.conditions);
    return true;
  }

  

  async updateDB(input: UpdateDBInput, output: UpdateDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.affected_rows = this.repository.update(
      input.table,
      input.data,
      input.conditions,
    );
    return true;
  }

  

  async selectDB(input: SelectDBInput, output: SelectDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.rows = this.repository.select(input.query_param);
    
    output.total = this.repository.count(
      input.query_param.table,
      input.query_param.conditions,
    );
    return true;
  }

  

  async selectOneDB(input: SelectOneDBInput, output: SelectOneDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.row = this.repository.selectOne(input.query_param);
    return true;
  }

  

  async countDB(input: CountDBInput, output: CountDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.count = this.repository.count(input.table, input.conditions);
    return true;
  }

  

  async transactionDB(input: TransactionDBInput, output: TransactionDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const ok = this.repository.transaction(input.operations);
    if (!ok) {
      output.error = '事务执行失败，已回滚';
      output.error_code = 'TRANSACTION_FAILED';
    }
    return ok;
  }

  
  
  

  

  async visualizedDB(input: VisualizedDBInput, output: VisualizedDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const scope = String(input.scope);

    if (scope === 'health') {
      
      const start = Date.now();
      this.repository.queryRaw('SELECT 1');
      output.data = {
        connected: true,
        response_time_ms: Date.now() - start,
      };
    } else if (scope === 'volume') {
      
      const tables = this.repository.queryRaw<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      );
      const volume: Record<string, number> = {};
      for (const t of tables) {
        volume[t.name] = this.repository.count(t.name);
      }
      output.data = { tables: volume };
    } else if (scope === 'diskUsage') {
      output.data = { disk_usage_bytes: this.repository.getDiskUsage() };
    } else {
      output.error = `未知的可视化范围: ${scope}`;
      output.error_code = 'INVALID_SCOPE';
      return false;
    }
    return true;
  }

  

  async enableDB(input: EnableDBInput, _output: EnableDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (this.closed) {
      throw new DatabaseError('关系数据库已关闭（closeDB 为终态操作），需重新初始化组件');
    }

    this.enabled = input.enable;
    
    const conditions: Condition[] = [
      { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
    ];
    const data: DataObject[] = [
      { field: 'config_value', value: String(input.enable) },
      { field: 'updated', value: IdGenerator.now() },
    ];
    this.repository.update(RELATIONDB_CONFIG_TABLE, data, conditions);
    return true;
  }

  

  async closeDB(_input: CloseDBInput, _output: CloseDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    this.repository.close();
    return true;
  }
}
