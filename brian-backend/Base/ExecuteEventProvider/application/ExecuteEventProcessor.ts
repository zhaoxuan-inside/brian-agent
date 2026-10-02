import type { Logger } from '../../shared/aop/AopProxy';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { DataObject } from '../../shared/query/QueryObjects';
import { Operator } from '../../shared/query/QueryObjects';
import { Metrics } from '../../shared/base/Metrics';
import type { ExecuteEvent, ExecuteEventSink } from '../../shared/base/ExecuteEvent';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { EXECUTE_TABLE, EXECUTE_FIELD_MAX_CHARS, EXECUTE_COUNTER_MAX_KEYS, EXECUTE_PENDING_PERMISSION_MAX } from '../domain/types';

interface PendingPermissionRow {
  rowId: string;
  askedAt: number;
}

interface SerializedField {
  text: string;
  length: number;
}

export class ExecuteEventProcessor implements ExecuteEventSink {
  private readonly pendingPermissions = new Map<string, PendingPermissionRow>();

  private readonly execNoCounters = new Map<string, number>();

  private schemaEnsured = false;

  private writeChain: Promise<void> = Promise.resolve();

  /** 幂等建表:生产由 InfoCore 迁移器建表,此处兜底保证独立使用(测试等)时表存在 */
  private ensureSchema(): void {
    if (this.schemaEnsured) return;
    try {
      this.relationDb.executeRaw(`
        CREATE TABLE IF NOT EXISTS "${EXECUTE_TABLE}" (
          "id"             TEXT    NOT NULL PRIMARY KEY,
          "created"        INTEGER NOT NULL,
          "updated"        INTEGER NOT NULL,
          "session_id"     TEXT    NOT NULL DEFAULT '',
          "work_id"        TEXT    NOT NULL DEFAULT '',
          "run_id"         TEXT    NOT NULL DEFAULT '',
          "trace_id"       TEXT    NOT NULL DEFAULT '',
          "agent_id"       TEXT    NOT NULL DEFAULT '',
          "exec_no"        INTEGER NOT NULL DEFAULT 0,
          "component_id"   TEXT    NOT NULL DEFAULT '',
          "component_type" TEXT    NOT NULL DEFAULT '',
          "input"          TEXT    NOT NULL DEFAULT '',
          "input_length"   INTEGER NOT NULL DEFAULT 0,
          "output"         TEXT    NOT NULL DEFAULT '',
          "output_length"  INTEGER NOT NULL DEFAULT 0,
          "gap"            INTEGER NOT NULL DEFAULT 0,
          "status"         TEXT    NOT NULL DEFAULT 'ok'
        )
      `);
      this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS "idx_${EXECUTE_TABLE}_work" ON "${EXECUTE_TABLE}" ("work_id")`);
      this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS "idx_${EXECUTE_TABLE}_run" ON "${EXECUTE_TABLE}" ("run_id")`);
      this.schemaEnsured = true;
    } catch {
      // 建表失败容忍:后续插入会按原路径报错并被 catch 记录
    }
  }

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logger?: Logger,
  ) {}

  /** ADR-012:同步生成行 id 并返回(供 message_part 关联 execute_id),插入走内部异步链 */
  push(event: ExecuteEvent): string {
    const rowId = IdGenerator.generate();
    this.writeChain = this.writeChain
      .then(() => this.persist(event, rowId))
      .catch((err: unknown) => {
        this.logger?.warn?.('[execute-event] 执行事件落库失败（已丢弃该事件，不影响业务）', {
          component_id: event.component_id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return rowId;
  }

  async flush(): Promise<void> {
    await this.writeChain;
  }

  private async persist(event: ExecuteEvent, rowId: string): Promise<void> {
    this.ensureSchema();
    if (!this.isPersistable(event)) return;
    if (event.permission_id && this.pendingPermissions.has(event.permission_id)) {
      await this.amendPermissionAnswer(event);
      return;
    }
    await this.insertExecuteRow(event, rowId);
  }

  private isPersistable(event: ExecuteEvent): boolean {
    return Boolean(event.session_id || event.run_id || event.work_id);
  }

  private async amendPermissionAnswer(event: ExecuteEvent): Promise<void> {
    const pending = this.pendingPermissions.get(event.permission_id!);
    if (!pending) return;
    this.pendingPermissions.delete(event.permission_id!);
    const answer = this.serialize(event.output);
    const gap = Math.max(0, event.end - pending.askedAt);
    await this.relationDb.update(EXECUTE_TABLE, [
      { field: 'output', value: answer.text },
      { field: 'output_length', value: answer.length },
      { field: 'gap', value: gap },
      { field: 'updated', value: event.end },
      { field: 'status', value: event.status },
    ], [{ field: 'id', operator: Operator.EQ, value: pending.rowId }]);
  }

  private async insertExecuteRow(event: ExecuteEvent, rowId: string): Promise<void> {
    const id = rowId;
    const taskKey = event.work_id || event.run_id || event.session_id || '';
    const record = this.buildInsertRecord(id, event, this.nextExecNo(taskKey));
    await this.relationDb.insert(EXECUTE_TABLE, record);
    if (event.permission_id) this.rememberPendingPermission(event.permission_id, id, event.start);
  }

  private buildInsertRecord(id: string, event: ExecuteEvent, execNo: number): DataObject[] {
    const input = this.serialize(event.input);
    const output = this.serialize(this.resolveOutputPayload(event));
    return [
      { field: 'id', value: id },
      { field: 'created', value: event.start },
      { field: 'updated', value: event.end },
      { field: 'session_id', value: event.session_id || '' },
      { field: 'work_id', value: event.work_id || event.run_id || '' },
      { field: 'run_id', value: event.run_id || '' },
      { field: 'trace_id', value: event.trace_id || '' },
      { field: 'agent_id', value: event.agent_id || '' },
      { field: 'exec_no', value: execNo },
      { field: 'component_id', value: event.component_id },
      { field: 'component_type', value: event.component_type },
      { field: 'input', value: input.text },
      { field: 'input_length', value: input.length },
      { field: 'output', value: output.text },
      { field: 'output_length', value: output.length },
      { field: 'gap', value: Math.max(0, event.gap) },
      { field: 'status', value: event.status },
    ];
  }

  private resolveOutputPayload(event: ExecuteEvent): unknown {
    if (event.status === 'error' && event.error) {
      return event.error;
    }
    return event.output;
  }

  private serialize(value: unknown): SerializedField {
    const safe = Metrics.safeSerialize(value, EXECUTE_FIELD_MAX_CHARS);
    const json = typeof safe === 'string' ? safe : JSON.stringify(safe);
    const text = (json ?? '').slice(0, EXECUTE_FIELD_MAX_CHARS);
    return { text, length: text.length };
  }

  private nextExecNo(taskKey: string): number {
    const next = (this.execNoCounters.get(taskKey) ?? 0) + 1;
    this.execNoCounters.set(taskKey, next);
    this.evictOldestCounter(taskKey);
    return next;
  }

  private evictOldestCounter(taskKey: string): void {
    if (this.execNoCounters.size <= EXECUTE_COUNTER_MAX_KEYS) return;
    const oldest = this.execNoCounters.keys().next().value;
    if (oldest !== undefined && oldest !== taskKey) this.execNoCounters.delete(oldest);
  }

  private rememberPendingPermission(permissionId: string, rowId: string, askedAt: number): void {
    this.pendingPermissions.set(permissionId, { rowId, askedAt });
    this.evictOldestPendingPermission();
  }

  private evictOldestPendingPermission(): void {
    if (this.pendingPermissions.size <= EXECUTE_PENDING_PERMISSION_MAX) return;
    const oldest = this.pendingPermissions.keys().next().value;
    if (oldest !== undefined) this.pendingPermissions.delete(oldest);
  }
}
