import { RelationDBAccess, IdGenerator, Operator } from '@brian-agent/base';
import type { Metrics } from '@brian-agent/base';
import { AGENT_EXECUTION_TRACE_TABLE } from '../../domain/types';
import { TraceIterations } from '../../domain/trace';
import { stringifyTrace } from './TraceCodec';

export interface TraceSaveInput {
  trace_id: string;
  agent_id: string;
  start_time: number;
  end_time: number;
  iterations: TraceIterations;
  total_token_usage: number;
  answer: string;
}

export interface TraceRecord {
  trace_id: string;
  agent_id: string;
  start_time: number;
  end_time: number;
  iterations_json: string;
  total_token_usage: number;
  answer: string;
}

export class TraceStore {
  constructor(private readonly relationDb: RelationDBAccess) {}

  
  async save(input: TraceSaveInput, metrics?: Metrics): Promise<void> {
    const now = IdGenerator.now();
    try {
      await this.relationDb.insert(AGENT_EXECUTION_TRACE_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'trace_id', value: input.trace_id },
        { field: 'agent_id', value: input.agent_id },
        { field: 'start_time', value: input.start_time },
        { field: 'end_time', value: input.end_time },
        { field: 'iterations_json', value: stringifyTrace(input.iterations) },
        { field: 'total_token_usage', value: input.total_token_usage },
        { field: 'answer', value: input.answer },
      ]);
    } catch (err) {
      
      
      metrics?.warn('TraceStore.save 轨迹落盘失败已容忍', {
        error: err instanceof Error ? err.message : String(err),
        trace_id: input.trace_id,
        agent_id: input.agent_id,
      });
    }
  }

  
  async load(traceId: string): Promise<TraceRecord | null> {
    const row = await this.relationDb.selectOne(AGENT_EXECUTION_TRACE_TABLE, [
      { field: 'trace_id', operator: Operator.EQ, value: traceId },
    ]);
    if (!row) return null;
    return this.toRecord(row);
  }

  private toRecord(row: Record<string, unknown>): TraceRecord {
    return {
      trace_id: String(row.trace_id),
      agent_id: String(row.agent_id),
      start_time: Number(row.start_time),
      end_time: Number(row.end_time),
      iterations_json: String(row.iterations_json ?? '[]'),
      total_token_usage: Number(row.total_token_usage ?? 0),
      answer: String(row.answer ?? ''),
    };
  }
}
