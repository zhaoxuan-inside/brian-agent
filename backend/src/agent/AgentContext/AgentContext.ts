import { Input, Context, Output } from '../../shared/base';
import { ValidationError, NotFoundError } from '../../shared/errors';
import { logger } from '../../infrastructure/logger';
import { AopProxy } from '../infra/aopProxy';
import * as db from './db';
import type { SourcesSummary } from './db';
import { v4 as uuidv4 } from 'uuid';

export type ContextSource = db.ContextSource;

export interface ContextItem {
  info_id: string;
  content: string;
  source: ContextSource;
}

export interface InfoContextProvider {
  context(sessionId: string, options?: { maxContextItems?: number }): Promise<ContextItem[]> | ContextItem[];
}

function classifySources(items: ContextItem[]): SourcesSummary {
  const summary: SourcesSummary = { ...db.EMPTY_SOURCES_SUMMARY };
  for (const item of items) {
    if (item.source in summary) {
      summary[item.source]++;
    }
  }
  return summary;
}

export interface SourceCounts {
  pinned: number;
  timeline: number;
  tag_relative: number;
  similarity: number;
  keyword: number;
  random: number;
}

export interface SourceDetail {
  count: number;
  info_ids?: string[];
}

class BuildAgentContextInput extends Input {
  session_id!: string;
  agent_id?: string;
  work_id?: string;
  trace_id?: string;
  constructor(data: Partial<BuildAgentContextInput>) { super(data); Object.assign(this, data); }
}
class BuildAgentContextContext extends Context { }
class BuildAgentContextOutput extends Output {
  context_data?: ContextItem[];
  context_id?: string;
  total_context_count?: number;
}

class GetContextByTraceInput extends Input {
  trace_id!: string;
  constructor(data: Partial<GetContextByTraceInput>) { super(data); Object.assign(this, data); }
}
class GetContextByTraceContext extends Context { }
class GetContextByTraceOutput extends Output {
  context_id?: string;
  trace_id?: string;
  agent_id?: string;
  work_id?: string;
  total_context_count?: number;
  sources?: Record<string, { count: number }>;
}

class GetContextByAgentInput extends Input {
  agent_id!: string;
  work_id!: string;
  constructor(data: Partial<GetContextByAgentInput>) { super(data); Object.assign(this, data); }
}
class GetContextByAgentContext extends Context { }
class GetContextByAgentOutput extends Output {
  context_id?: string;
  agent_id?: string;
  work_id?: string;
  total_context_count?: number;
  sources?: Record<string, { count: number }>;
}

class GetContextDetailInput extends Input {
  context_id!: string;
  sources?: ContextSource[];
  constructor(data: Partial<GetContextDetailInput>) { super(data); Object.assign(this, data); }
}
class GetContextDetailContext extends Context { }
class GetContextDetailOutput extends Output {
  context_id?: string;
  total_context_count?: number;
  sources?: Record<string, SourceDetail>;
}

class ConfigAgentContextInput extends Input {
  max_context_items?: number;
  enable_snapshot_persistence?: boolean;
  constructor(data: Partial<ConfigAgentContextInput>) { super(data); Object.assign(this, data); }
}
class ConfigAgentContextContext extends Context { }
class ConfigAgentContextOutput extends Output {
  max_context_items?: number;
  enable_snapshot_persistence?: boolean;
}

export { BuildAgentContextInput, BuildAgentContextContext, BuildAgentContextOutput };
export { GetContextByTraceInput, GetContextByTraceContext, GetContextByTraceOutput };
export { GetContextByAgentInput, GetContextByAgentContext, GetContextByAgentOutput };
export { GetContextDetailInput, GetContextDetailContext, GetContextDetailOutput };
export { ConfigAgentContextInput, ConfigAgentContextContext, ConfigAgentContextOutput };

const MODULE = 'AgentContext';

export class AgentContextService {
  private infoCoreProvider: InfoContextProvider;

  constructor(infoCoreProvider: InfoContextProvider) {
    this.infoCoreProvider = infoCoreProvider;
  }

  async buildAgentContext(input: BuildAgentContextInput, _context: BuildAgentContextContext, output: BuildAgentContextOutput): Promise<boolean> {
    logger.info(MODULE, '[buildAgentContext] start', { session_id: input.session_id, agent_id: input.agent_id, trace_id: input.trace_id });

    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }

    const config = db.getAgentContextConfig();

    const items = await this.infoCoreProvider.context(input.session_id, {
      maxContextItems: config.max_context_items,
    });

    const contextId = uuidv4();
    const sourcesSummary = classifySources(items);

    if (config.enable_snapshot_persistence) {
      db.insertAgentContext({
        context_id: contextId,
        session_id: input.session_id,
        agent_id: input.agent_id,
        work_id: input.work_id,
        trace_id: input.trace_id,
        context_total_count: items.length,
        context_sources_summary: sourcesSummary,
      });

      const itemRows = items.map(item => ({
        context_id: contextId,
        info_id: item.info_id,
        source: item.source,
      }));
      db.insertAgentContextItems(itemRows);
    }

    output.context_data = items;
    output.context_id = contextId;
    output.total_context_count = items.length;

    logger.info(MODULE, '[buildAgentContext] done', { context_id: contextId, count: items.length });
    return true;
  }

  getContextByTrace(input: GetContextByTraceInput, _context: GetContextByTraceContext, output: GetContextByTraceOutput): boolean {
    logger.info(MODULE, '[getContextByTrace] start', { trace_id: input.trace_id });

    const row = db.getAgentContextByTraceId(input.trace_id);
    const sourcesSummary = db.parseSourcesSummary(row);

    output.context_id = row?.context_id || '';
    output.trace_id = row?.trace_id || input.trace_id;
    output.agent_id = row?.agent_id || undefined;
    output.work_id = row?.work_id || undefined;
    output.total_context_count = row?.context_total_count || 0;
    output.sources = {
      pinned: { count: sourcesSummary.pinned },
      timeline: { count: sourcesSummary.timeline },
      tag_relative: { count: sourcesSummary.tag_relative },
      similarity: { count: sourcesSummary.similarity },
      keyword: { count: sourcesSummary.keyword },
      random: { count: sourcesSummary.random },
    };

    logger.info(MODULE, '[getContextByTrace] done', { context_id: output.context_id });
    return true;
  }

  getContextByAgent(input: GetContextByAgentInput, _context: GetContextByAgentContext, output: GetContextByAgentOutput): boolean {
    logger.info(MODULE, '[getContextByAgent] start', { agent_id: input.agent_id, work_id: input.work_id });

    const row = db.getAgentContextByAgentAndWork(input.agent_id, input.work_id);
    const sourcesSummary = db.parseSourcesSummary(row);

    output.context_id = row?.context_id || '';
    output.agent_id = row?.agent_id || input.agent_id;
    output.work_id = row?.work_id || input.work_id;
    output.total_context_count = row?.context_total_count || 0;
    output.sources = {
      pinned: { count: sourcesSummary.pinned },
      timeline: { count: sourcesSummary.timeline },
      tag_relative: { count: sourcesSummary.tag_relative },
      similarity: { count: sourcesSummary.similarity },
      keyword: { count: sourcesSummary.keyword },
      random: { count: sourcesSummary.random },
    };

    logger.info(MODULE, '[getContextByAgent] done', { context_id: output.context_id });
    return true;
  }

  getContextDetail(input: GetContextDetailInput, _context: GetContextDetailContext, output: GetContextDetailOutput): boolean {
    logger.info(MODULE, '[getContextDetail] start', { context_id: input.context_id, sources: input.sources });

    if (!input.context_id) {
      throw new ValidationError('context_id is required');
    }

    const snapshot = db.getAgentContextByContextId(input.context_id);
    if (!snapshot) {
      output.context_id = input.context_id;
      output.total_context_count = 0;
      output.sources = {};
      return true;
    }

    const items = db.listAgentContextItems(input.context_id, input.sources);

    const grouped: Record<string, SourceDetail> = {};
    const allSources: ContextSource[] = ['pinned', 'timeline', 'tag_relative', 'similarity', 'keyword', 'random'];
    for (const src of allSources) {
      grouped[src] = { count: 0, info_ids: [] };
    }

    for (const item of items) {
      if (!grouped[item.source]) {
        grouped[item.source] = { count: 0, info_ids: [] };
      }
      grouped[item.source].count++;
      grouped[item.source].info_ids!.push(item.info_id);
    }

    for (const src of allSources) {
      if (grouped[src].count === 0) {
        delete grouped[src].info_ids;
      }
    }

    output.context_id = snapshot.context_id;
    output.total_context_count = snapshot.context_total_count;
    output.sources = grouped;

    logger.info(MODULE, '[getContextDetail] done', { context_id: input.context_id, total: snapshot.context_total_count });
    return true;
  }

  configAgentContext(input: ConfigAgentContextInput, _context: ConfigAgentContextContext, output: ConfigAgentContextOutput): boolean {
    logger.info(MODULE, '[configAgentContext] start', { max_items: input.max_context_items, persist: input.enable_snapshot_persistence });

    const updates: Record<string, unknown> = {};

    if (input.max_context_items !== undefined) {
      if (!Number.isInteger(input.max_context_items) || input.max_context_items < 1) {
        throw new ValidationError('max_context_items must be a positive integer');
      }
      updates.max_context_items = input.max_context_items;
    }

    if (input.enable_snapshot_persistence !== undefined) {
      updates.enable_snapshot_persistence = input.enable_snapshot_persistence ? 1 : 0;
    }

    if (Object.keys(updates).length > 0) {
      db.updateAgentContextConfig(updates as never);
    }

    const config = db.getAgentContextConfig();
    output.max_context_items = config.max_context_items;
    output.enable_snapshot_persistence = config.enable_snapshot_persistence === 1;

    logger.info(MODULE, '[configAgentContext] done', output);
    return true;
  }
}

export function createAgentContextService(infoCoreProvider: InfoContextProvider): AgentContextService {
  return AopProxy(new AgentContextService(infoCoreProvider));
}
