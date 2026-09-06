import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidationError, SystemMonitorAccess } from '@brian-agent/base';
import { MonitorService } from '../Monitor/application/MonitorService';
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
} from '../Monitor/domain/types';
import { setupRealTestEnvironment, cleanupTempDirs } from './real-test-helpers';
import type { RealTestContext } from './real-test-helpers';
import { IdGenerator } from '@brian-agent/base';

function ctx(): MonitorContext { return new MonitorContext(); }

describe('MonitorService', () => {
  let testCtx: RealTestContext;
  let service: MonitorService;

  beforeEach(async () => {
    testCtx = await setupRealTestEnvironment();
    service = new MonitorService(
      testCtx.relationDb,
      testCtx.logAccess,
      testCtx.llmAccess,
      testCtx.graphDBAccess,
      testCtx.vectorDbAccess as never,
      testCtx.mqAccess,
      new SystemMonitorAccess(testCtx.tempDir),
    );
  });

  afterEach(() => {
    cleanupTempDirs();
  });

  it('TC-MON-001: health-all returns six components and overall status', async () => {
    const output = new GetHealthAllOutput();
    const ok = await service.soHealthAll(new GetHealthAllInput(), output, ctx());
    expect(ok).toBe(true);
    expect(['healthy', 'degraded', 'unhealthy']).toContain(output.status);
    expect(output.uptime).toBeGreaterThanOrEqual(0);
    const names = output.components.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining([
      'RelationDB', 'GraphDB', 'VectorDB', 'LLM Provider', 'MCP', 'MQ',
    ]));
    expect(output.components).toHaveLength(6);
  });

  it('TC-MON-002: resources returns cpu/memory/disk percentages', async () => {
    const output = new GetResourcesOutput();
    const ok = await service.soResources(new GetResourcesInput(), output, ctx());
    expect(ok).toBe(true);
    expect(output.cpu).toBeGreaterThanOrEqual(0);
    expect(output.cpu).toBeLessThanOrEqual(100);
    expect(output.memory).toBeGreaterThanOrEqual(0);
    expect(output.memory).toBeLessThanOrEqual(100);
    expect(output.disk).toBeGreaterThanOrEqual(0);
    expect(output.disk).toBeLessThanOrEqual(100);
    expect(output.cores).toBeGreaterThan(0);
    expect(output.timestamp).toBeGreaterThan(0);
  });

  it('TC-MON-003: token trend is empty when llm_usage has no rows', async () => {
    const output = new GetTokenTrendOutput();
    await service.soTokenTrend(new GetTokenTrendInput(), output, ctx());
    expect(output.points).toEqual([]);
  });

  it('TC-MON-004: token trend and model distribution aggregate llm_usage', async () => {
    const now = IdGenerator.now();
    testCtx.relationDb.executeRaw(
      'INSERT INTO "llm_usage" ("id","created","updated","llm_available_id","usage_date","usage_count","input_tokens","output_tokens") VALUES (?,?,?,?,?,?,?,?)',
      ['usage-1', now, now, 'llm-a', '2026-09-01', 3, 100, 50],
    );
    testCtx.relationDb.executeRaw(
      'INSERT INTO "llm_usage" ("id","created","updated","llm_available_id","usage_date","usage_count","input_tokens","output_tokens") VALUES (?,?,?,?,?,?,?,?)',
      ['usage-2', now, now, 'llm-a', '2026-09-02', 1, 20, 10],
    );

    const trend = new GetTokenTrendOutput();
    await service.soTokenTrend(new GetTokenTrendInput(), trend, ctx());
    expect(trend.points).toEqual([
      { date: '2026-09-01', tokens: 150 },
      { date: '2026-09-02', tokens: 30 },
    ]);

    const dist = new GetModelDistributionOutput();
    await service.soModelDistribution(new GetModelDistributionInput(), dist, ctx());
    expect(dist.models.length).toBeGreaterThanOrEqual(1);
    expect(dist.models[0].tokens).toBe(180);
    expect(dist.models[0].deleted).toBe(true);
  });

  it('TC-MON-005: token-usage returns today and month buckets', async () => {
    const now = IdGenerator.now();
    const today = IdGenerator.today();
    testCtx.relationDb.executeRaw(
      'INSERT INTO "llm_usage" ("id","created","updated","llm_available_id","usage_date","usage_count","input_tokens","output_tokens") VALUES (?,?,?,?,?,?,?,?)',
      ['usage-today', now, now, 'llm-b', today, 2, 40, 10],
    );
    const output = new GetTokenUsageOutput();
    await service.soTokenUsage(new GetTokenUsageInput(), output, ctx());
    expect(output.today.tokens).toBe(50);
    expect(output.today.requests).toBe(2);
    expect(output.month.tokens).toBeGreaterThanOrEqual(50);
  });

  it('TC-MON-006: log query/stats/sources round-trip', async () => {
    const now = IdGenerator.now();
    testCtx.logAccess.getRelationDb().executeRaw(
      'INSERT INTO "log_record" ("id","created","updated","level","source","message") VALUES (?,?,?,?,?,?)',
      ['log-mon-1', now, now, 'INFO', 'MonitorTest', 'hello-monitor'],
    );

    const queryOut = new QueryLogsOutput();
    await service.soLogs(Object.assign(new QueryLogsInput(), { source: 'MonitorTest' }), queryOut, ctx());
    expect(queryOut.total).toBeGreaterThanOrEqual(1);
    expect(queryOut.entries.some((e) => e.message.includes('hello-monitor'))).toBe(true);

    const statsOut = new GetLogStatsOutput();
    await service.soLogStats(new GetLogStatsInput(), statsOut, ctx());
    expect(statsOut.distribution.some((d) => d.count > 0)).toBe(true);

    const sourcesOut = new GetLogSourcesOutput();
    await service.soLogSources(new GetLogSourcesInput(), sourcesOut, ctx());
    expect(sourcesOut.sources).toContain('MonitorTest');
  });

  it('TC-MON-007: delLogs rejects empty ids', async () => {
    await expect(service.delLogs(new DeleteLogsInput(), new DeleteLogsOutput(), ctx()))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('TC-MON-008: clearLogs returns deleted_count', async () => {
    const output = new ClearLogsOutput();
    const ok = await service.clearLogs(new ClearLogsInput(), output, ctx());
    expect(ok).toBe(true);
    expect(output.deleted_count).toBeGreaterThanOrEqual(0);
  });
});
