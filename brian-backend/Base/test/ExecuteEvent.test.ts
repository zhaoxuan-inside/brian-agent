import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { Operator } from '../shared/query/QueryObjects';
import { Report } from '../shared/base/Report';
import { AopProxy } from '../shared/aop/AopProxy';
import { ExecuteEventInterceptor } from '../shared/aop/ExecuteEventInterceptor';
import { EXECUTE_COMPONENT_TYPES, isExecuteEventObservable, resolveComponentType } from '../shared/base/ExecuteEvent';
import type { ExecuteEvent } from '../shared/base/ExecuteEvent';
import { ExecuteEventProcessor } from '../ExecuteEventProvider/application/ExecuteEventProcessor';
import { EXECUTE_TABLE } from '../ExecuteEventProvider';



interface DemoInput {
  session_id?: string;
  run_id?: string;
  work_id?: string;
  task?: string;
}

class DemoService {
  async doWork(input: DemoInput, output: { value: string }, _context: unknown, _metrics?: unknown, _report?: unknown): Promise<boolean> {
    output.value = `done:${input.task ?? ''}`;
    return true;
  }

  async failWork(_input: DemoInput, _output: { value: string }, _context: unknown, _metrics?: unknown, _report?: unknown): Promise<boolean> {
    throw new Error('boom');
  }
}

describe('ExecuteEvent 观测规则', () => {
  it('resolveComponentType 按服务映射组件类型', () => {
    expect(resolveComponentType('WriterAgentService')).toBe(EXECUTE_COMPONENT_TYPES.WRITER);
    expect(resolveComponentType('AgentLoopService')).toBe(EXECUTE_COMPONENT_TYPES.AGENT_LOOP);
    expect(resolveComponentType('LLMService')).toBe(EXECUTE_COMPONENT_TYPES.LLM);
    expect(resolveComponentType('UnknownService')).toBe(EXECUTE_COMPONENT_TYPES.SYSTEM);
  });

  it('isExecuteEventObservable 排除存储/日志/流管道与 so 前缀查询', () => {
    expect(isExecuteEventObservable('RelationDBService', 'insert')).toBe(false);
    expect(isExecuteEventObservable('LogService', 'log')).toBe(false);
    expect(isExecuteEventObservable('StreamService', 'publishEvent')).toBe(false);
    expect(isExecuteEventObservable('SessionService', 'soMessages')).toBe(false);
    expect(isExecuteEventObservable('SessionService', 'addMessage')).toBe(true);
  });
});

describe('ExecuteEventProcessor', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let processor: ExecuteEventProcessor;

  const makeEvent = (overrides?: Partial<ExecuteEvent>): ExecuteEvent => ({
    component_id: 'LLMService.execLLMEvents',
    component_type: EXECUTE_COMPONENT_TYPES.LLM,
    session_id: 'session-1',
    work_id: 'work-1',
    run_id: 'run-1',
    trace_id: 'trace-1',
    agent_id: '',
    start: 1000,
    end: 1060,
    gap: 60,
    input: { task: 'hello' },
    output: { value: 'ok' },
    status: 'ok',
    ...overrides,
  });

  const soRows = async (): Promise<Array<Record<string, unknown>>> =>
    relationDb.select(EXECUTE_TABLE, { order_by: [{ field: 'exec_no', direction: 'ASC' }] });

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-execute-event-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS "${EXECUTE_TABLE}" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "session_id" TEXT NOT NULL, "work_id" TEXT NOT NULL, "run_id" TEXT NOT NULL DEFAULT '',
      "trace_id" TEXT NOT NULL DEFAULT '', "agent_id" TEXT NOT NULL DEFAULT '',
      "exec_no" INTEGER NOT NULL DEFAULT 0, "component_id" TEXT NOT NULL DEFAULT '',
      "component_type" TEXT NOT NULL DEFAULT '', "input" TEXT NOT NULL DEFAULT '',
      "input_length" INTEGER NOT NULL DEFAULT 0, "output" TEXT NOT NULL DEFAULT '',
      "output_length" INTEGER NOT NULL DEFAULT 0, "gap" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'ok')`);
    processor = new ExecuteEventProcessor(relationDb);
  });

  afterEach(async () => {
    await processor.flush();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('push 按任务自增 exec_no 并序列化输入输出与状态', async () => {
    processor.push(makeEvent());
    processor.push(makeEvent({ component_id: 'WriterAgentService.execWrite', component_type: EXECUTE_COMPONENT_TYPES.WRITER, end: 1120, gap: 120 }));
    processor.push(makeEvent({ run_id: 'run-2', work_id: 'work-2' }));
    await processor.flush();

    const taskOne = await relationDb.select(EXECUTE_TABLE, {
      conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'work-1' }],
      order_by: [{ field: 'exec_no', direction: 'ASC' }],
    });
    const taskTwo = await relationDb.select(EXECUTE_TABLE, {
      conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'work-2' }],
    });
    expect(taskOne.length).toBe(2);
    expect(taskTwo.length).toBe(1);
    expect(taskOne[0]['exec_no']).toBe(1);
    expect(taskOne[1]['exec_no']).toBe(2);
    expect(taskTwo[0]['exec_no']).toBe(1);
    expect(taskOne[0]['component_id']).toBe('LLMService.execLLMEvents');
    expect(taskOne[0]['component_type']).toBe('LLM');
    expect(taskOne[0]['gap']).toBe(60);
    expect(taskOne[0]['status']).toBe('ok');
    expect(String(taskOne[0]['input'])).toContain('hello');
    expect(String(taskOne[0]['output'])).toContain('ok');
    expect(taskOne[0]['created']).toBe(1000);
    expect(taskOne[0]['updated']).toBe(1060);
    expect(taskOne[0]['work_id']).toBe('work-1');
    expect(taskOne[0]['run_id']).toBe('run-1');
    expect(taskOne[0]['trace_id']).toBe('trace-1');
  });

  it('错误事件落 status=error 且携带错误信息', async () => {
    processor.push(makeEvent({ status: 'error', error: 'boom', output: '' }));
    await processor.flush();

    const rows = await soRows();
    expect(rows.length).toBe(1);
    expect(rows[0]['status']).toBe('error');
    expect(String(rows[0]['output'])).not.toContain('ok');
  });

  it('缺 session/run/work 上下文的噪音事件被丢弃', async () => {
    processor.push(makeEvent({ session_id: undefined, work_id: undefined, run_id: undefined }));
    await processor.flush();
    expect((await soRows()).length).toBe(0);
  });

  it('permission 事件先插行后按 permission_id 回填结果与耗时', async () => {
    processor.push(makeEvent({
      component_id: 'skill_builtin-exec',
      component_type: EXECUTE_COMPONENT_TYPES.PERMISSION,
      start: 2000,
      end: 2000,
      gap: 0,
      input: { arguments: { q: 'x' }, status: 'pending' },
      output: '',
      permission_id: 'perm-1',
    }));
    processor.push(makeEvent({
      component_type: EXECUTE_COMPONENT_TYPES.PERMISSION,
      start: 2500,
      end: 2500,
      output: { status: 'allowed', answered_at: 2500 },
      permission_id: 'perm-1',
    }));
    await processor.flush();

    const rows = await soRows();
    expect(rows.length).toBe(1);
    expect(rows[0]['component_type']).toBe('PERMISSION');
    expect(rows[0]['gap']).toBe(500);
    expect(rows[0]['updated']).toBe(2500);
    expect(String(rows[0]['output'])).toContain('allowed');
    expect(String(rows[0]['input'])).toContain('pending');
  });
});

describe('AopProxy + ExecuteEventInterceptor 集成', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let processor: ExecuteEventProcessor;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-execute-aop-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS "${EXECUTE_TABLE}" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "session_id" TEXT NOT NULL, "work_id" TEXT NOT NULL, "run_id" TEXT NOT NULL DEFAULT '',
      "trace_id" TEXT NOT NULL DEFAULT '', "agent_id" TEXT NOT NULL DEFAULT '',
      "exec_no" INTEGER NOT NULL DEFAULT 0, "component_id" TEXT NOT NULL DEFAULT '',
      "component_type" TEXT NOT NULL DEFAULT '', "input" TEXT NOT NULL DEFAULT '',
      "input_length" INTEGER NOT NULL DEFAULT 0, "output" TEXT NOT NULL DEFAULT '',
      "output_length" INTEGER NOT NULL DEFAULT 0, "gap" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'ok')`);
    processor = new ExecuteEventProcessor(relationDb);
    Report.setExecuteEventSink(processor);
  });

  afterEach(async () => {
    Report.setExecuteEventSink(null);
    await processor.flush();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('AOP 方法调用自动产出执行事件行（成功与失败）', async () => {
    const service = AopProxy.wrap(new DemoService(), { enableAop: true });
    const output = { value: '' };
    await service.doWork({ session_id: 's-aop', run_id: 'r-aop', task: 't' }, output, {}, undefined, undefined);

    await expect(service.failWork({ session_id: 's-aop', run_id: 'r-aop' }, { value: '' }, {}, undefined, undefined)).rejects.toThrow('boom');
    await processor.flush();

    const rows = await relationDb.select(EXECUTE_TABLE, { order_by: [{ field: 'exec_no', direction: 'ASC' }] });
    expect(rows.length).toBe(2);
    expect(rows[0]['component_id']).toBe('DemoService.doWork');
    expect(rows[0]['component_type']).toBe(EXECUTE_COMPONENT_TYPES.SYSTEM);
    expect(rows[0]['status']).toBe('ok');
    expect(String(rows[0]['output'])).toContain('done:t');
    expect(rows[1]['component_id']).toBe('DemoService.failWork');
    expect(rows[1]['status']).toBe('error');
    expect(String(rows[1]['output'])).toContain('boom');
  });

  it('未挂 sink 时静默跳过，不影响业务', async () => {
    Report.setExecuteEventSink(null);
    const service = AopProxy.wrap(new DemoService(), { enableAop: true });
    const output = { value: '' };
    await expect(service.doWork({ session_id: 's-bare' }, output, {}, undefined, undefined)).resolves.toBe(true);
    expect(output.value).toBe('done:');
  });

  it('ExecuteEventInterceptor 可作为独立拦截器注入', async () => {
    const service = AopProxy.wrap(new DemoService(), { enableAop: true, interceptors: [new ExecuteEventInterceptor()] });
    const output = { value: '' };
    await service.doWork({ session_id: 's-custom', run_id: 'r-custom' }, output, {}, undefined, undefined);
    await processor.flush();
    const rows = await relationDb.select(EXECUTE_TABLE, {});
    expect(rows.length).toBe(1);
  });
});
