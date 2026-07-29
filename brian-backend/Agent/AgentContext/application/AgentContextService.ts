import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator, Operator, OperationType, ValidationError } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  ContextInfoInput, ContextInfoOutput, InfoCoreContext,
} from '@brian-agent/core';
import type { AgentContextContext } from '../domain/types';
import {
  AGENT_CONTEXT_TABLE,
  AGENT_CONTEXT_ITEM_TABLE,
  AGENT_CONTEXT_CONFIG_TABLE,
  DEFAULT_MAX_CONTEXT_ITEMS,
  DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE,
  BuildAgentContextInput,
  BuildAgentContextOutput,
  GetContextByTraceInput,
  GetContextByTraceOutput,
  GetContextByAgentInput,
  GetContextByAgentOutput,
  GetContextDetailInput,
  GetContextDetailOutput,
  ConfigAgentContextInput,
  ConfigAgentContextOutput,
} from '../domain/types';
import type {
  AgentContextConfigRecord,
} from '../domain/types';

export class AgentContextService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly infoCore: InfoCoreAccess,
  ) {}

  async buildAgentContext(
    input: BuildAgentContextInput,
    _ctx: AgentContextContext,
    output: BuildAgentContextOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id 为必填');
    }

    const ctxOutput = new ContextInfoOutput();
    await this.infoCore.context(
      Object.assign(new ContextInfoInput(), { session_id: input.session_id }),
      new InfoCoreContext(),
      ctxOutput,
    );

    const rawList = ctxOutput.list;
    const contextData = rawList.map((item) => ({
      info_id: item.info_id,
      content: item.info,
      source: '',
    }));

    const contextId = IdGenerator.generate();
    const now = IdGenerator.now();

    const sourceCounts: Record<string, number> = {};
    for (const item of contextData) {
      const src = item.source || 'unknown';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }

    const config = await this.getConfigInternal();
    if (config && config.enable_snapshot_persistence !== 0) {
      await this.relationDb.insert(AGENT_CONTEXT_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'context_id', value: contextId },
        { field: 'session_id', value: input.session_id },
        { field: 'agent_id', value: input.agent_id || '' },
        { field: 'work_id', value: input.work_id || '' },
        { field: 'trace_id', value: input.trace_id || '' },
        { field: 'context_total_count', value: contextData.length },
        { field: 'context_sources_summary', value: JSON.stringify(sourceCounts) },
      ]);

      if (contextData.length > 0) {
        const itemOps = contextData.map((item) => ({
          type: OperationType.INSERT,
          table: AGENT_CONTEXT_ITEM_TABLE,
          data: [
            { field: 'id', value: IdGenerator.generate() },
            { field: 'created', value: now },
            { field: 'updated', value: now },
            { field: 'context_id', value: contextId },
            { field: 'info_id', value: item.info_id },
            { field: 'source', value: item.source || '' },
          ],
        }));
        this.relationDb.transactionRaw(itemOps);
      }
    }

    output.context_data = contextData;
    output.context_id = contextId;
    output.total_context_count = contextData.length;
    return true;
  }

  async getContextByTrace(
    input: GetContextByTraceInput,
    _ctx: AgentContextContext,
    output: GetContextByTraceOutput,
  ): Promise<boolean> {
    if (!input.trace_id) {
      throw new ValidationError('trace_id 为必填');
    }

    const row = await this.relationDb.selectOne(AGENT_CONTEXT_TABLE, [
      { field: 'trace_id', operator: Operator.EQ, value: input.trace_id },
    ]);

    if (!row) return true;

    output.context_id = String(row.context_id || '');
    output.trace_id = String(row.trace_id || '');
    output.agent_id = String(row.agent_id || '');
    output.work_id = String(row.work_id || '');
    output.total_context_count = Number(row.context_total_count || 0);
    output.sources = this.parseSourceSummary(String(row.context_sources_summary || '{}'));
    return true;
  }

  async getContextByAgent(
    input: GetContextByAgentInput,
    _ctx: AgentContextContext,
    output: GetContextByAgentOutput,
  ): Promise<boolean> {
    if (!input.agent_id || !input.work_id) {
      throw new ValidationError('agent_id 和 work_id 为必填');
    }

    const row = await this.relationDb.selectOne(AGENT_CONTEXT_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
      { field: 'work_id', operator: Operator.EQ, value: input.work_id },
    ]);

    if (!row) return true;

    output.context_id = String(row.context_id || '');
    output.agent_id = String(row.agent_id || '');
    output.work_id = String(row.work_id || '');
    output.total_context_count = Number(row.context_total_count || 0);
    output.sources = this.parseSourceSummary(String(row.context_sources_summary || '{}'));
    return true;
  }

  async getContextDetail(
    input: GetContextDetailInput,
    _ctx: AgentContextContext,
    output: GetContextDetailOutput,
  ): Promise<boolean> {
    if (!input.context_id) {
      throw new ValidationError('context_id 为必填');
    }

    const snapshot = await this.relationDb.selectOne(AGENT_CONTEXT_TABLE, [
      { field: 'context_id', operator: Operator.EQ, value: input.context_id },
    ]);
    if (!snapshot) return true;

    const conditions: Array<{ field: string; operator: string; value: unknown }> = [
      { field: 'context_id', operator: Operator.EQ, value: input.context_id },
    ];
    if (input.sources && input.sources.length > 0) {
      conditions.push({
        field: 'source',
        operator: Operator.IN,
        value: input.sources,
      });
    }

    const items = await this.relationDb.select(AGENT_CONTEXT_ITEM_TABLE, { conditions });

    const sourceGroups: Record<string, { count: number; info_ids: string[] }> = {};
    for (const item of items) {
      const src = String(item.source || 'unknown');
      if (!sourceGroups[src]) {
        sourceGroups[src] = { count: 0, info_ids: [] };
      }
      sourceGroups[src].count++;
      sourceGroups[src].info_ids.push(String(item.info_id || ''));
    }

    output.context_id = input.context_id;
    output.total_context_count = Number(snapshot.context_total_count || 0);
    output.sources = sourceGroups;
    return true;
  }

  async configAgentContext(
    input: ConfigAgentContextInput,
    _ctx: AgentContextContext,
    output: ConfigAgentContextOutput,
  ): Promise<boolean> {
    let config = await this.getConfigInternal();

    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(AGENT_CONTEXT_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'max_context_items', value: DEFAULT_MAX_CONTEXT_ITEMS },
        { field: 'enable_snapshot_persistence', value: DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE },
      ]);
      config = await this.getConfigInternal();
    }
    if (!config) throw new ValidationError('config init failed');

    const data: Array<{ field: string; value: unknown }> = [];
    if (input.max_context_items !== undefined) {
      if (!Number.isInteger(input.max_context_items) || input.max_context_items < 1) {
        throw new ValidationError('max_context_items 必须为正整数');
      }
      data.push({ field: 'max_context_items', value: input.max_context_items });
    }
    if (input.enable_snapshot_persistence !== undefined) {
      data.push({
        field: 'enable_snapshot_persistence',
        value: input.enable_snapshot_persistence ? 1 : 0,
      });
    }
    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(
        AGENT_CONTEXT_CONFIG_TABLE,
        data,
        [{ field: 'id', operator: Operator.EQ, value: config.id }],
      );
    }

    const updated = await this.getConfigInternal();
    output.max_context_items = updated?.max_context_items ?? DEFAULT_MAX_CONTEXT_ITEMS;
    output.enable_snapshot_persistence = updated
      ? updated.enable_snapshot_persistence !== 0
      : true;
    return true;
  }

  private parseSourceSummary(
    raw: string,
  ): Record<string, { count: number }> {
    try {
      const parsed = JSON.parse(raw);
      const result: Record<string, { count: number }> = {};
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = { count: Number(value) || 0 };
      }
      return result;
    } catch {
      return {};
    }
  }

  private async getConfigInternal(): Promise<AgentContextConfigRecord | null> {
    const row = await this.relationDb.selectOne(AGENT_CONTEXT_CONFIG_TABLE, []);
    if (!row) return null;
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      max_context_items: Number(row.max_context_items ?? DEFAULT_MAX_CONTEXT_ITEMS),
      enable_snapshot_persistence: Number(row.enable_snapshot_persistence ?? DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE),
    };
  }
}
