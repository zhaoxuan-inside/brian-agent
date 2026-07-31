import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  VISUALIZATION_CONFIG_TABLE,
  DEFAULT_MAX_NODES_PER_GRAPH,
  DEFAULT_MESSAGE_SUMMARY_LENGTH,
  DEFAULT_RESOLVE_CONTENT_BY_DEFAULT,
  DEFAULT_MAX_CONTEXT_SAMPLES_PER_SOURCE,
} from '../domain/types';

export class VisualizationSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${VISUALIZATION_CONFIG_TABLE} (
        id TEXT PRIMARY KEY,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        max_nodes_per_graph INTEGER DEFAULT ${DEFAULT_MAX_NODES_PER_GRAPH},
        default_message_summary_length INTEGER DEFAULT ${DEFAULT_MESSAGE_SUMMARY_LENGTH},
        resolve_content_by_default INTEGER DEFAULT ${DEFAULT_RESOLVE_CONTENT_BY_DEFAULT},
        max_context_samples_per_source INTEGER DEFAULT ${DEFAULT_MAX_CONTEXT_SAMPLES_PER_SOURCE}
      )`,
    );

    await this.insertDefaultConfig();
  }

  private async insertDefaultConfig(): Promise<void> {
    const count = await this.relationDb.count(VISUALIZATION_CONFIG_TABLE);
    if (count > 0) return;
    const now = IdGenerator.now();
    await this.relationDb.insert(VISUALIZATION_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'max_nodes_per_graph', value: DEFAULT_MAX_NODES_PER_GRAPH },
      { field: 'default_message_summary_length', value: DEFAULT_MESSAGE_SUMMARY_LENGTH },
      { field: 'resolve_content_by_default', value: DEFAULT_RESOLVE_CONTENT_BY_DEFAULT },
      { field: 'max_context_samples_per_source', value: DEFAULT_MAX_CONTEXT_SAMPLES_PER_SOURCE },
    ]);
  }
}
