import { describe, it, expect, beforeEach } from 'vitest';
import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { TraceService } from '../TraceBase/application/TraceService';
import { TraceSchemaInitializer } from '../TraceBase/infrastructure/TraceSchemaInitializer';
import {
  TraceContext,
  RecordUsageInput, RecordUsageOutput,
  SoDailyUsageInput, SoDailyUsageOutput,
  SoUsageEventsInput, SoUsageEventsOutput,
  SoEntityUsageTotalInput, SoEntityUsageTotalOutput,
  SoProviderTokenUsageInput, SoProviderTokenUsageOutput,
  USAGE_EVENT_TABLE, AGENT_USAGE_ORG_TABLE, LLM_USAGE_ORG_TABLE,
} from '../TraceBase';
import { Operator } from '../shared/query';

describe('TraceBase(ADR-012 统一统计)', () => {
  let db: RelationDBAccess;
  let service: TraceService;

  beforeEach(() => {
    db = new RelationDBAccess({ dbPath: ':memory:' });
    new TraceSchemaInitializer(db).init();
    service = new TraceService(db);
  });

  it('recordUsage 写 usage_event_record 事件流水并回填 event_id', async () => {
    const input = new RecordUsageInput();
    input.entity_type = 'agent';
    input.entity_id = 'agent-1';
    input.work_id = 'w-1';
    input.run_id = 'r-1';
    input.usage_context = 'soMatch';
    const output = new RecordUsageOutput();
    const ok = await service.recordUsage(input, output, new TraceContext());
    expect(ok).toBe(true);
    expect(output.event_id).not.toBe('');
    const events = await db.select(USAGE_EVENT_TABLE, {
      conditions: [{ field: 'entity_id', operator: Operator.EQ, value: 'agent-1' }],
    });
    expect(events.length).toBe(1);
    expect(events[0].entity_type).toBe('agent');
    expect(events[0].trace_id).not.toBeUndefined();
  });

  it('日聚合 agent_usage_org 同日累计 usage_count,跨日分行', async () => {
    for (let i = 0; i < 3; i++) {
      const input = new RecordUsageInput();
      input.entity_type = 'agent';
      input.entity_id = 'agent-2';
      await service.recordUsage(input, new RecordUsageOutput(), new TraceContext());
    }
    const rows = await db.select(AGENT_USAGE_ORG_TABLE, {
      conditions: [{ field: 'agent_id', operator: Operator.EQ, value: 'agent-2' }],
    });
    expect(rows.length).toBe(1);
    expect(Number(rows[0].usage_count)).toBe(3);
  });

  it('llm 实体日聚合累加 input/output tokens', async () => {
    for (const tokens of [[10, 5], [7, 3]] as const) {
      const input = new RecordUsageInput();
      input.entity_type = 'llm';
      input.entity_id = 'llm-av-1';
      input.input_tokens = tokens[0];
      input.output_tokens = tokens[1];
      await service.recordUsage(input, new RecordUsageOutput(), new TraceContext());
    }
    const rows = await db.select(LLM_USAGE_ORG_TABLE, {
      conditions: [{ field: 'llm_available_id', operator: Operator.EQ, value: 'llm-av-1' }],
    });
    expect(rows.length).toBe(1);
    expect(Number(rows[0].usage_count)).toBe(2);
    expect(Number(rows[0].input_tokens)).toBe(17);
    expect(Number(rows[0].output_tokens)).toBe(8);
  });

  it('soDailyUsage 聚合查询返回实体日用量', async () => {
    const input = new RecordUsageInput();
    input.entity_type = 'soul';
    input.entity_id = 'soul-1';
    await service.recordUsage(input, new RecordUsageOutput(), new TraceContext());
    const qin = new SoDailyUsageInput();
    qin.entity_type = 'soul';
    qin.entity_ids = ['soul-1'];
    const qout = new SoDailyUsageOutput();
    await service.soDailyUsage(qin, qout, new TraceContext());
    expect(qout.items.length).toBe(1);
    expect(qout.items[0].entity_id).toBe('soul-1');
    expect(qout.items[0].usage_count).toBe(1);
  });

  it('soUsageEvents 按 entity_type 过滤事件流水', async () => {
    for (const [type, id] of [['skill', 'sk-1'], ['mcp', 'mc-1']] as const) {
      const input = new RecordUsageInput();
      input.entity_type = type;
      input.entity_id = id;
      await service.recordUsage(input, new RecordUsageOutput(), new TraceContext());
    }
    const qin = new SoUsageEventsInput();
    qin.entity_type = 'skill';
    const qout = new SoUsageEventsOutput();
    await service.soUsageEvents(qin, qout, new TraceContext());
    expect(qout.total).toBe(1);
    expect(qout.events[0].entity_id).toBe('sk-1');
  });

  it('soEntityUsageTotal 汇总实体事件总数', async () => {
    for (let i = 0; i < 2; i++) {
      const input = new RecordUsageInput();
      input.entity_type = 'prompt';
      input.entity_id = 'pt-1';
      input.agent_id = 'agent-9';
      await service.recordUsage(input, new RecordUsageOutput(), new TraceContext());
    }
    const qin = new SoEntityUsageTotalInput();
    qin.entity_type = 'prompt';
    qin.entity_id = 'pt-1';
    const qout = new SoEntityUsageTotalOutput();
    await service.soEntityUsageTotal(qin, qout, new TraceContext());
    expect(qout.total_count).toBe(2);
  });

  it('soProviderTokenUsage 按 provider 汇总 Token(llm_available 归属)', async () => {
    db.executeRaw(`CREATE TABLE IF NOT EXISTS "llm_available_record" ("id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL, "llm_provider_id" TEXT NOT NULL DEFAULT '')`);
    db.executeRaw(`INSERT INTO "llm_available_record" ("id","created","updated","llm_provider_id") VALUES ('av-1', 0, 0, 'provider-1')`);
    const input = new RecordUsageInput();
    input.entity_type = 'llm';
    input.entity_id = 'av-1';
    input.input_tokens = 100;
    input.output_tokens = 50;
    await service.recordUsage(input, new RecordUsageOutput(), new TraceContext());
    const qin = new SoProviderTokenUsageInput();
    qin.llm_provider_id = 'provider-1';
    const qout = new SoProviderTokenUsageOutput();
    await service.soProviderTokenUsage(qin, qout, new TraceContext());
    expect(qout.tokens_used).toBe(150);
    expect(qout.call_count).toBe(1);
  });

  it('缺 entity_type/entity_id 返回 VALIDATION_ERROR', async () => {
    const input = new RecordUsageInput();
    input.entity_type = 'agent';
    input.entity_id = '';
    const output = new RecordUsageOutput();
    const ok = await service.recordUsage(input, output, new TraceContext());
    expect(ok).toBe(false);
    expect(output.error_code).toBe('VALIDATION_ERROR');
  });

  it('TraceSchemaInitializer 幂等:重复 init 不抛错且数据保留', async () => {
    const input = new RecordUsageInput();
    input.entity_type = 'agent';
    input.entity_id = 'agent-idem';
    await service.recordUsage(input, new RecordUsageOutput(), new TraceContext());
    expect(() => new TraceSchemaInitializer(db).init()).not.toThrow();
    const rows = await db.select(USAGE_EVENT_TABLE, {
      conditions: [{ field: 'entity_id', operator: Operator.EQ, value: 'agent-idem' }],
    });
    expect(rows.length).toBe(1);
  });
});
