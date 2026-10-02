import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import type { TaskEvent } from '@brian-agent/shared';
import { TaskEventType as T } from '@brian-agent/shared';
import { RUN_STATE_TABLE, type RunStatePatch } from '../domain/types';

/**
 * RunStateSink：run 状态平铺列直更（O(1) 状态查询面）。
 * 不做完整投影 —— 投影在前端 reducer，这里只维护 phase/round/计数器。
 */
export class RunStateSink {
  constructor(private readonly relationDb: RelationDBAccess) {}

  onEvent(ev: TaskEvent): void {
    const patch = this.patchOf(ev);
    if (!patch) return;
    this.apply(ev.session_id, ev.run_id, ev.work_id, patch);
  }

  private patchOf(ev: TaskEvent): RunStatePatch | null {
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    switch (ev.type) {
      case T.RunAccepted: return { phase: 'accepted', started_ts: ev.ts };
      case T.RunStarted: return { phase: 'assembling', agent_id: String(payload.agent_id ?? '') };
      case T.LoopTurnStarted: return { phase: 'reasoning', round: Number(payload.round ?? 0) };
      case T.SkillStarted: return { phase: 'acting' };
      case T.WriterStarted: return { phase: 'writing' };
      case T.EvaluationStarted: return { phase: 'evaluating' };
      // 同步评估先于 RunFinished；异步评估晚于 RunFinished 到达——此处收敛回 settled，防止 phase 永久卡在 evaluating
      case T.EvaluationCompleted: return { phase: 'settled' };
      case T.RunFinished: return { phase: 'settled', settled_ts: ev.ts, stop_reason: String(payload.stop_reason ?? 'stop') };
      case T.RunFailed: return { phase: 'failed', settled_ts: ev.ts, error: String(payload.error ?? '') };
      case T.ErrorOccurred: return { error: String(payload.error ?? '') };
      case T.LlmInvoked: return {
        llm_id: String(payload.llm_id ?? ''),
        tokens_in: Number(payload.input_tokens ?? 0),
        tokens_out: Number(payload.output_tokens ?? 0),
      };
      case T.SkillResult: return { tool_calls: 1 };
      default: return null;
    }
  }

  private apply(sessionId: string, runId: string, workId: string, patch: RunStatePatch): void {
    try {
      this.ensureRow(sessionId, runId, workId);
      const sets: string[] = ['"updated" = ?'];
      const params: unknown[] = [IdGenerator.now()];
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'tokens_in' || k === 'tokens_out' || k === 'tool_calls') {
          sets.push(`"${k}" = "${k}" + ?`);
          params.push(v ?? 0);
          continue;
        }
        sets.push(`"${k}" = ?`);
        params.push(v ?? '');
      }
      params.push(runId);
      this.relationDb.executeRaw(
        `UPDATE "${RUN_STATE_TABLE}" SET ${sets.join(', ')} WHERE "id" = ?`, params,
      );
    } catch { /* 观测尽力而为 */ }
  }

  private ensureRow(sessionId: string, runId: string, workId: string): void {
    const now = IdGenerator.now();
    this.relationDb.executeRaw(`
      INSERT OR IGNORE INTO "${RUN_STATE_TABLE}"
        ("id","created","updated","session_id","work_id","phase")
      VALUES (?,?,?,?,?,'accepted')
    `, [runId, now, now, sessionId, workId]);
  }
}
