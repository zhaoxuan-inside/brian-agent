import { Metrics, Report } from '@brian-agent/base';
import type {
  RelationDBAccess, LogAccess, LLMAccess, GraphDBAccess, VectorDBAccess, MQAccess,
  SystemMonitorAccess, Logger,
} from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { MonitorService } from '../application/MonitorService';
import {
  MonitorContext,
  GetHealthAllInput, GetHealthAllOutput,
  GetResourcesInput, GetResourcesOutput,
  GetTokenTrendInput, GetTokenTrendOutput,
  GetModelDistributionInput, GetModelDistributionOutput,
  GetTokenUsageInput, GetTokenUsageOutput,
  QueryLogsInput, QueryLogsOutput,
  GetLogStatsInput, GetLogStatsOutput,
  GetLogSourcesInput, GetLogSourcesOutput,
  DeleteLogsInput, DeleteLogsOutput,
  ClearLogsInput, ClearLogsOutput,
} from '../domain/types';

export class MonitorAccess {
  private readonly service: MonitorService;

  constructor(
    relationDb: RelationDBAccess,
    logAccess: LogAccess,
    llmAccess: LLMAccess,
    graphDBAccess: GraphDBAccess,
    vectorDBAccess: VectorDBAccess,
    mqAccess: MQAccess,
    systemMonitorAccess: SystemMonitorAccess,
    logger?: Logger,
  ) {
    const raw = new MonitorService(
      relationDb, logAccess, llmAccess, graphDBAccess, vectorDBAccess, mqAccess, systemMonitorAccess, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async soHealthAll(i: GetHealthAllInput, o: GetHealthAllOutput, c: MonitorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soHealthAll(i, o, c, metrics, report);
  }

  async soResources(i: GetResourcesInput, o: GetResourcesOutput, c: MonitorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soResources(i, o, c, metrics, report);
  }

  async soTokenTrend(i: GetTokenTrendInput, o: GetTokenTrendOutput, c: MonitorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soTokenTrend(i, o, c, metrics, report);
  }

  async soModelDistribution(i: GetModelDistributionInput, o: GetModelDistributionOutput, c: MonitorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soModelDistribution(i, o, c, metrics, report);
  }

  async soTokenUsage(i: GetTokenUsageInput, o: GetTokenUsageOutput, c: MonitorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soTokenUsage(i, o, c, metrics, report);
  }

  async soLogs(i: QueryLogsInput, o: QueryLogsOutput, c: MonitorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soLogs(i, o, c, metrics, report);
  }

  async soLogStats(i: GetLogStatsInput, o: GetLogStatsOutput, c: MonitorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soLogStats(i, o, c, metrics, report);
  }

  async soLogSources(i: GetLogSourcesInput, o: GetLogSourcesOutput, c: MonitorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soLogSources(i, o, c, metrics, report);
  }

  async delLogs(i: DeleteLogsInput, o: DeleteLogsOutput, c: MonitorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delLogs(i, o, c, metrics, report);
  }

  async clearLogs(i: ClearLogsInput, o: ClearLogsOutput, c: MonitorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.clearLogs(i, o, c, metrics, report);
  }
}
