import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator, Operator, ValidationError } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  InfoCoreContext, SoContextByWorkInput, SoContextByWorkOutput,
} from '@brian-agent/core';
import type { AgentContextContext, AgentContextConfigRecord } from '../domain/types';
import {
  AGENT_CONTEXT_CONFIG_TABLE,
  DEFAULT_MAX_CONTEXT_ITEMS,
  DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE,
  GetContextDetailInput,
  GetContextDetailOutput,
  ConfigAgentContextInput,
  ConfigAgentContextOutput,
} from '../domain/types';

export class AgentContextService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly infoCore: InfoCoreAccess,
  ) {}

  

  async soContextDetail(input: GetContextDetailInput, output: GetContextDetailOutput, _ctx: AgentContextContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.work_id) {
      throw new ValidationError('work_id 为必填');
    }

    const soInput = Object.assign(new SoContextByWorkInput(), { work_id: input.work_id });
    const soOutput = new SoContextByWorkOutput();
    await this.infoCore.soContextByWork(soInput, soOutput, new InfoCoreContext());

    output.source_ids_map = soOutput.source_ids_map as Record<string, string[]>;
    output.content_map = soOutput.content_map;
    output.attribute_map = soOutput.attribute_map as unknown as Record<string, Record<string, unknown>>;
    output.total_context_count = Object.keys(soOutput.content_map).length;
    return true;
  }

  async configAgentContext(input: ConfigAgentContextInput, output: ConfigAgentContextOutput, _ctx: AgentContextContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    
    if (input.max_context_items !== undefined) {
      const v = input.max_context_items;
      if (typeof v !== 'number' || Number.isNaN(v) || !Number.isInteger(v) || v <= 0) {
        throw new ValidationError('max_context_items 必须为正整数');
      }
    }

    let config = await this.getConfigInternal();

    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(AGENT_CONTEXT_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'max_context_items', value: input.max_context_items ?? DEFAULT_MAX_CONTEXT_ITEMS },
        { field: 'enable_snapshot_persistence', value: DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE },
      ]);
      config = await this.getConfigInternal();
    }
    if (!config) throw new ValidationError('config init failed');

    const data: Array<{ field: string; value: unknown }> = [];
    if (input.max_context_items !== undefined) {
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
    output.max_context_items = updated
      ? updated.max_context_items
      : DEFAULT_MAX_CONTEXT_ITEMS;
    output.enable_snapshot_persistence = updated
      ? updated.enable_snapshot_persistence !== 0
      : true;
    return true;
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
