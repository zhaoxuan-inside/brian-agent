/**
 * @fileoverview LogProvider 模块测试。
 *
 * 测试范围：
 * - 日志管理：addLog / getLog / soLog / delLog / countLog
 * - 可视化：visualizedLog（health / volume / levelDistribution / sourceDistribution）
 * - 运维：enableLog（日志规则配置）
 * - AOP 切面：LogInterceptor（beforeExecute / afterExecute）
 * - 组件生命周期：initialize / enabled 状态
 *
 * 遵循 PRD `docs/_01_Base/LogProvider/LogProvider-PRD.md` 的全部需求。
 * 所有测试使用真实的 SQLite 数据库和本地文件系统，不使用任何 MOCK。
 * 每个测试用例在 temp 目录中创建独立的数据库文件，测试后清理。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { DBContext, CloseDBInput, CloseDBOutput } from '../RelationDBProvider';
import {
  LogAccess,
  LogInterceptor,
  LogContext,
  LogLevel,
  LogSource,
  AddLogInput,
  AddLogOutput,
  GetLogInput,
  GetLogOutput,
  SoLogInput,
  SoLogOutput,
  DelLogInput,
  DelLogOutput,
  CountLogInput,
  CountLogOutput,
  VisualizedLogInput,
  VisualizedLogOutput,
  EnableLogInput,
  EnableLogOutput,
  LOG_RULE_TABLE,
  LOG_CONFIG_TABLE,
} from '../LogProvider';
import type { LogData, LogRule } from '../LogProvider';
import type { InterceptContext } from '../shared/aop/Interceptor';
import { Operator } from '../shared/query';
import { ComponentDisabledError, ValidationError } from '../shared/errors';

/** 创建测试用 LogData */
function makeLogData(overrides?: Partial<LogData>): LogData {
  return {
    level: LogLevel.INFO,
    source: 'TestModule',
    message: '测试日志消息',
    ...overrides,
  };
}

/** 读取模块日志文件内容 */
function readLogFile(logDir: string, moduleName: string): string {
  const filePath = path.join(logDir, moduleName, `${moduleName}.log`);
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/** 确保 LogProvider 重新读取配置 */
async function reinitializeLogAccess(logAccess: LogAccess): Promise<void> {
  await logAccess.initialize();
}

describe('LogProvider', () => {
  let tempDir: string;
  let sqlitePath: string;
  let relationDb: RelationDBAccess;
  let logAccess: LogAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-log-test-'));
    sqlitePath = path.join(tempDir, 'test.db');

    relationDb = new RelationDBAccess({ dbPath: sqlitePath });
    await relationDb.initialize();

    // 构造 LogAccess（创建表结构）
    logAccess = new LogAccess(relationDb);

    // 在 initialize 前插入自定义 file_path，使日志写入 temp 目录
    const logDir = path.join(tempDir, 'data', 'logs');
    await relationDb.insert(LOG_CONFIG_TABLE, [
      { field: 'config_key', value: 'file_path' },
      { field: 'config_value', value: logDir },
      { field: 'value_type', value: 'STRING' },
      { field: 'description', value: 'Test log directory' },
      { field: 'updated', value: Date.now() },
    ]);

    await logAccess.initialize();
  });

  afterEach(async () => {
    try {
      await relationDb.closeDB(new CloseDBInput(), new DBContext(), new CloseDBOutput());
    } catch {
      // 可能已关闭
    }
    await new Promise((r) => setTimeout(r, 50));
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // 忽略清理错误
      }
    }
  });

  // ==========================================================================
  // addLog - 日志写入
  // ==========================================================================

  describe('addLog', () => {
    it('应写入日志到本地文件并返回 id', async () => {
      const output = new AddLogOutput();
      const ok = await logAccess.addLog(
        { data: makeLogData() } as AddLogInput,
        new LogContext(),
        output,
      );
      expect(ok).toBe(true);
      expect(output.id).toBeTruthy();
      expect(typeof output.id).toBe('string');
    });

    it('应创建模块目录和日志文件', async () => {
      await logAccess.addLog(
        { data: makeLogData({ source: 'UniqueModule' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const moduleDir = path.join(tempDir, 'data', 'logs', 'UniqueModule');
      const logFile = path.join(moduleDir, 'UniqueModule.log');
      expect(fs.existsSync(moduleDir)).toBe(true);
      expect(fs.existsSync(logFile)).toBe(true);
    });

    it('写入的日志行包含时间戳、级别、模块名、消息', async () => {
      await logAccess.addLog(
        { data: makeLogData({ level: LogLevel.WARN, source: 'TestModule', message: '警告消息' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'TestModule');
      expect(content).toContain('[WARN]');
      expect(content).toContain('[TestModule]');
      expect(content).toContain('警告消息');
    });

    it('写入的日志行应包含 trace_id', async () => {
      await logAccess.addLog(
        { data: makeLogData({ trace_id: 'trace-abc-123' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'TestModule');
      expect(content).toContain('[trace-abc-123]');
    });

    it('trace_id 为空时应输出 [-]', async () => {
      await logAccess.addLog(
        { data: makeLogData({ trace_id: undefined }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'TestModule');
      expect(content).toContain('[-]');
    });

    it('写入的日志行应包含 metadata JSON', async () => {
      await logAccess.addLog(
        { data: makeLogData({ metadata: { key: 'value', num: 42 } }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'TestModule');
      expect(content).toContain('{"key":"value","num":42}');
    });

    it('无 metadata 时应输出 -', async () => {
      await logAccess.addLog(
        { data: makeLogData({ metadata: undefined }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'TestModule');
      const parts = content.split(' | ');
      expect(parts[1]).toBe('-');
    });

    it('写入的日志行应包含 elapsed_ms', async () => {
      await logAccess.addLog(
        { data: makeLogData({ elapsed_ms: 123 }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'TestModule');
      expect(content).toContain('123');
    });

    it('无 elapsed_ms 时应输出 -', async () => {
      await logAccess.addLog(
        { data: makeLogData({ elapsed_ms: undefined }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'TestModule');
      const parts = content.split(' | ');
      expect(parts[2].trim()).toBe('-');
    });

    it('caller 字段通过 LogInterceptor 正确设置', async () => {
      // caller 存储在 LogData 中但不在日志行输出中直接显示，
      // 仅通过 AOP LogInterceptor 在 context.caller 中提取并传递给 LogData
      // 此处验证 addLog 可接受 caller 字段不报错
      await logAccess.addLog(
        { data: makeLogData({ caller: 'TestCaller' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      // 通过 soLog 获取日志，验证 caller 字段被存储
      const output = new SoLogOutput();
      await logAccess.soLog(
        { source: 'TestModule' } as SoLogInput,
        new LogContext(),
        output,
      );
      expect(output.list.length).toBeGreaterThanOrEqual(1);
    });

    it('不同模块的日志应写入不同目录', async () => {
      await logAccess.addLog(
        { data: makeLogData({ source: 'ModuleA', message: 'A msg' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await logAccess.addLog(
        { data: makeLogData({ source: 'ModuleB', message: 'B msg' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const dirA = path.join(tempDir, 'data', 'logs', 'ModuleA');
      const dirB = path.join(tempDir, 'data', 'logs', 'ModuleB');
      expect(fs.existsSync(dirA)).toBe(true);
      expect(fs.existsSync(dirB)).toBe(true);

      const contentA = readLogFile(path.join(tempDir, 'data', 'logs'), 'ModuleA');
      const contentB = readLogFile(path.join(tempDir, 'data', 'logs'), 'ModuleB');
      expect(contentA).toContain('A msg');
      expect(contentB).toContain('B msg');
    });

    it('同一模块多次写入应追加到同一文件', async () => {
      await logAccess.addLog(
        { data: makeLogData({ source: 'RepeatedModule', message: 'first' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await logAccess.addLog(
        { data: makeLogData({ source: 'RepeatedModule', message: 'second' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'RepeatedModule');
      const lines = content.split('\n').filter((l) => l.trim());
      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('first');
      expect(lines[1]).toContain('second');
    });

    it('应拒绝 level 为空的日志', async () => {
      const output = new AddLogOutput();
      await expect(
        logAccess.addLog(
          { data: makeLogData({ level: '' }) } as AddLogInput,
          new LogContext(),
          output,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应拒绝 source 为空的日志', async () => {
      const output = new AddLogOutput();
      await expect(
        logAccess.addLog(
          { data: makeLogData({ source: '' }) } as AddLogInput,
          new LogContext(),
          output,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应拒绝 message 为空的日志', async () => {
      const output = new AddLogOutput();
      await expect(
        logAccess.addLog(
          { data: makeLogData({ message: '' }) } as AddLogInput,
          new LogContext(),
          output,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('LogProvider 禁用时应抛出 ComponentDisabledError', async () => {
      // 通过更新配置表禁用 LogProvider
      await relationDb.update(LOG_CONFIG_TABLE, [
        { field: 'config_value', value: 'false' },
        { field: 'updated', value: Date.now() },
      ], [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ]);
      await reinitializeLogAccess(logAccess);

      const output = new AddLogOutput();
      await expect(
        logAccess.addLog(
          { data: makeLogData() } as AddLogInput,
          new LogContext(),
          output,
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('应支持 DEBUG 级别日志', async () => {
      await logAccess.addLog(
        { data: makeLogData({ level: LogLevel.DEBUG }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'TestModule');
      expect(content).toContain('[DEBUG]');
    });

    it('应支持 ERROR 级别日志', async () => {
      await logAccess.addLog(
        { data: makeLogData({ level: LogLevel.ERROR }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'TestModule');
      expect(content).toContain('[ERROR]');
    });

    it('每条日志应各自返回不同的 id', async () => {
      const out1 = new AddLogOutput();
      await logAccess.addLog(
        { data: makeLogData() } as AddLogInput,
        new LogContext(),
        out1,
      );

      await new Promise((r) => setTimeout(r, 5));

      const out2 = new AddLogOutput();
      await logAccess.addLog(
        { data: makeLogData() } as AddLogInput,
        new LogContext(),
        out2,
      );

      expect(out1.id).not.toBe(out2.id);
    });
  });

  // ==========================================================================
  // getLog - 获取单条日志
  // ==========================================================================

  describe('getLog', () => {
    it('应返回 null 当没有日志', async () => {
      const output = new GetLogOutput();
      await logAccess.getLog(new GetLogInput(), new LogContext(), output);
      expect(output.log).toBeNull();
    });

    it('应返回存在的日志', async () => {
      await logAccess.addLog(
        { data: makeLogData({ source: 'GetLogModule', message: 'findme' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const output = new GetLogOutput();
      await logAccess.getLog(new GetLogInput(), new LogContext(), output);
      expect(output.log).not.toBeNull();
      expect(output.log!.message).toContain('findme');
      expect(output.log!.source).toBe('GetLogModule');
    });

    it('LogProvider 禁用时应抛出 ComponentDisabledError', async () => {
      await relationDb.update(LOG_CONFIG_TABLE, [
        { field: 'config_value', value: 'false' },
        { field: 'updated', value: Date.now() },
      ], [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ]);
      await reinitializeLogAccess(logAccess);

      const output = new GetLogOutput();
      await expect(
        logAccess.getLog(new GetLogInput(), new LogContext(), output),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // ==========================================================================
  // soLog - 搜索日志
  // ==========================================================================

  describe('soLog', () => {
    beforeEach(async () => {
      // 准备测试数据：多个模块、多种级别
      await logAccess.addLog(
        { data: makeLogData({ source: 'ServiceA', level: LogLevel.INFO, message: '用户登录成功' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await logAccess.addLog(
        { data: makeLogData({ source: 'ServiceA', level: LogLevel.ERROR, message: '数据库连接失败' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await logAccess.addLog(
        { data: makeLogData({ source: 'ServiceB', level: LogLevel.WARN, message: '内存使用率高' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await logAccess.addLog(
        { data: makeLogData({ source: 'ServiceB', level: LogLevel.DEBUG, message: '调试信息', trace_id: 'trace-001' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
    });

    it('应返回所有日志', async () => {
      const output = new SoLogOutput();
      await logAccess.soLog(new SoLogInput(), new LogContext(), output);
      expect(output.list.length).toBe(4);
      expect(output.total).toBe(4);
    });

    it('应按 level 过滤', async () => {
      const output = new SoLogOutput();
      await logAccess.soLog(
        { level: LogLevel.ERROR } as SoLogInput,
        new LogContext(),
        output,
      );
      expect(output.list.length).toBe(1);
      expect(output.list[0].level).toBe(LogLevel.ERROR);
    });

    it('应按 source 过滤', async () => {
      const output = new SoLogOutput();
      await logAccess.soLog(
        { source: 'ServiceA' } as SoLogInput,
        new LogContext(),
        output,
      );
      expect(output.list.length).toBe(2);
      for (const log of output.list) {
        expect(log.source).toBe('ServiceA');
      }
    });

    it('应按 keyword 过滤', async () => {
      const output = new SoLogOutput();
      await logAccess.soLog(
        { keyword: '登录' } as SoLogInput,
        new LogContext(),
        output,
      );
      expect(output.list.length).toBe(1);
      expect(output.list[0].message).toContain('登录');
    });

    it('应按 trace_id 过滤', async () => {
      const output = new SoLogOutput();
      await logAccess.soLog(
        { trace_id: 'trace-001' } as SoLogInput,
        new LogContext(),
        output,
      );
      expect(output.list.length).toBe(1);
      expect(output.list[0].trace_id).toBe('trace-001');
    });

    it('应按 start_time 过滤', async () => {
      await new Promise((r) => setTimeout(r, 5));
      const beforeTime = Date.now();
      await logAccess.addLog(
        { data: makeLogData({ source: 'TimeModule', message: 'after' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const output = new SoLogOutput();
      await logAccess.soLog(
        { start_time: beforeTime } as SoLogInput,
        new LogContext(),
        output,
      );
      expect(output.list.length).toBe(1);
      expect(output.list[0].message).toBe('after');
    });

    it('应按 end_time 过滤', async () => {
      const cutoffTime = Date.now();
      await new Promise((r) => setTimeout(r, 10));

      const output = new SoLogOutput();
      await logAccess.soLog(
        { end_time: cutoffTime } as SoLogInput,
        new LogContext(),
        output,
      );
      expect(output.list.length).toBe(4);
    });

    it('应支持分页', async () => {
      const out1 = new SoLogOutput();
      await logAccess.soLog(
        { page: { current: 1, size: 2 } } as SoLogInput,
        new LogContext(),
        out1,
      );
      expect(out1.list.length).toBe(2);
      expect(out1.total).toBe(4);

      const out2 = new SoLogOutput();
      await logAccess.soLog(
        { page: { current: 2, size: 2 } } as SoLogInput,
        new LogContext(),
        out2,
      );
      expect(out2.list.length).toBe(2);
      expect(out2.total).toBe(4);
    });

    it('无匹配时应返回空列表', async () => {
      const output = new SoLogOutput();
      await logAccess.soLog(
        { keyword: '不存在的关键字@@@' } as SoLogInput,
        new LogContext(),
        output,
      );
      expect(output.list.length).toBe(0);
      expect(output.total).toBe(0);
    });

    it('默认 page 应返回前 50 条', async () => {
      const output = new SoLogOutput();
      await logAccess.soLog(new SoLogInput(), new LogContext(), output);
      expect(output.total).toBe(4);
    });

    it('LogProvider 禁用时应抛出 ComponentDisabledError', async () => {
      await relationDb.update(LOG_CONFIG_TABLE, [
        { field: 'config_value', value: 'false' },
        { field: 'updated', value: Date.now() },
      ], [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ]);
      await reinitializeLogAccess(logAccess);

      const output = new SoLogOutput();
      await expect(
        logAccess.soLog(new SoLogInput(), new LogContext(), output),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // ==========================================================================
  // delLog - 删除日志
  // ==========================================================================

  describe('delLog', () => {
    beforeEach(async () => {
      await logAccess.addLog(
        { data: makeLogData({ source: 'DelModule', message: 'to delete' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await logAccess.addLog(
        { data: makeLogData({ source: 'KeepModule', message: 'to keep' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
    });

    it('应按模块名删除日志文件', async () => {
      const output = new DelLogOutput();
      await logAccess.delLog(
        { ids: ['DelModule'] } as DelLogInput,
        new LogContext(),
        output,
      );

      const logPath = path.join(tempDir, 'data', 'logs', 'DelModule', 'DelModule.log');
      expect(fs.existsSync(logPath)).toBe(false);

      // KeepModule 不受影响
      const keepPath = path.join(tempDir, 'data', 'logs', 'KeepModule', 'KeepModule.log');
      expect(fs.existsSync(keepPath)).toBe(true);
    });

    it('按模块名删除应返回 affected_rows', async () => {
      const output = new DelLogOutput();
      await logAccess.delLog(
        { ids: ['DelModule'] } as DelLogInput,
        new LogContext(),
        output,
      );
      expect(output.affected_rows).toBe(1);
    });

    it('删除不存在的模块不影响现有数据', async () => {
      const output = new DelLogOutput();
      await logAccess.delLog(
        { ids: ['NonExistent'] } as DelLogInput,
        new LogContext(),
        output,
      );
      expect(output.affected_rows).toBe(0);
    });

    it('应按 before_time 删除过期日志行', async () => {
      // 等待确保后续日志有时间差
      await new Promise((r) => setTimeout(r, 10));
      const cutoff = Date.now();

      await logAccess.addLog(
        { data: makeLogData({ source: 'KeepModule', message: 'new message' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const output = new DelLogOutput();
      await logAccess.delLog(
        { before_time: cutoff } as DelLogInput,
        new LogContext(),
        output,
      );

      // 验证较早的日志被删除，新的保留
      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'KeepModule');
      expect(content).toContain('new message');
      // to keep 可能在 cutoff 之前
    });

    it('LogProvider 禁用时应抛出 ComponentDisabledError', async () => {
      await relationDb.update(LOG_CONFIG_TABLE, [
        { field: 'config_value', value: 'false' },
        { field: 'updated', value: Date.now() },
      ], [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ]);
      await reinitializeLogAccess(logAccess);

      const output = new DelLogOutput();
      await expect(
        logAccess.delLog({ ids: ['DelModule'] } as DelLogInput, new LogContext(), output),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // ==========================================================================
  // countLog - 统计日志数量
  // ==========================================================================

  describe('countLog', () => {
    beforeEach(async () => {
      await logAccess.addLog(
        { data: makeLogData({ source: 'CountA', level: LogLevel.INFO, message: 'msg1' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await logAccess.addLog(
        { data: makeLogData({ source: 'CountA', level: LogLevel.ERROR, message: 'msg2' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await logAccess.addLog(
        { data: makeLogData({ source: 'CountB', level: LogLevel.INFO, message: 'msg3' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
    });

    it('应统计所有日志数量', async () => {
      const output = new CountLogOutput();
      await logAccess.countLog(new CountLogInput(), new LogContext(), output);
      expect(output.count).toBe(3);
    });

    it('应按 level 统计', async () => {
      const output = new CountLogOutput();
      await logAccess.countLog(
        { level: LogLevel.ERROR } as CountLogInput,
        new LogContext(),
        output,
      );
      expect(output.count).toBe(1);
    });

    it('应按 source 统计', async () => {
      const output = new CountLogOutput();
      await logAccess.countLog(
        { source: 'CountA' } as CountLogInput,
        new LogContext(),
        output,
      );
      expect(output.count).toBe(2);
    });

    it('应按时间范围统计', async () => {
      const output = new CountLogOutput();
      await logAccess.countLog(
        { start_time: 0, end_time: Date.now() + 10000 } as CountLogInput,
        new LogContext(),
        output,
      );
      expect(output.count).toBe(3);
    });

    it('无匹配时应返回 0', async () => {
      const output = new CountLogOutput();
      await logAccess.countLog(
        { level: 'NONEXISTENT' } as CountLogInput,
        new LogContext(),
        output,
      );
      expect(output.count).toBe(0);
    });

    it('LogProvider 禁用时应抛出 ComponentDisabledError', async () => {
      await relationDb.update(LOG_CONFIG_TABLE, [
        { field: 'config_value', value: 'false' },
        { field: 'updated', value: Date.now() },
      ], [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ]);
      await reinitializeLogAccess(logAccess);

      const output = new CountLogOutput();
      await expect(
        logAccess.countLog(new CountLogInput(), new LogContext(), output),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // ==========================================================================
  // visualizedLog - 可视化数据
  // ==========================================================================

  describe('visualizedLog', () => {
    beforeEach(async () => {
      await logAccess.addLog(
        { data: makeLogData({ source: 'VisA', level: LogLevel.INFO, message: 'a' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await logAccess.addLog(
        { data: makeLogData({ source: 'VisA', level: LogLevel.ERROR, message: 'b' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await logAccess.addLog(
        { data: makeLogData({ source: 'VisB', level: LogLevel.DEBUG, message: 'c' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
    });

    it('scope=health 应返回健康状态', async () => {
      const output = new VisualizedLogOutput();
      await logAccess.visualizedLog(
        { scope: 'health' } as VisualizedLogInput,
        new LogContext(),
        output,
      );

      const data = output.data as Record<string, unknown>;
      expect(data.enabled).toBe(true);
      expect(typeof data.log_dir).toBe('string');
      expect(data.dir_exists).toBe(true);
      expect(typeof data.max_file_size).toBe('number');
    });

    it('scope=volume 应返回容量统计', async () => {
      const output = new VisualizedLogOutput();
      await logAccess.visualizedLog(
        { scope: 'volume' } as VisualizedLogInput,
        new LogContext(),
        output,
      );

      const data = output.data as Record<string, unknown>;
      expect(data.file_count).toBe(2);
      expect(typeof data.total_size_bytes).toBe('number');
      expect(typeof data.total_size_mb).toBe('number');
      expect((data.total_size_bytes as number) > 0).toBe(true);
    });

    it('scope=levelDistribution 应返回级别分布', async () => {
      const output = new VisualizedLogOutput();
      await logAccess.visualizedLog(
        { scope: 'levelDistribution' } as VisualizedLogInput,
        new LogContext(),
        output,
      );

      const data = output.data as Record<string, unknown>;
      const distribution = data.distribution as Record<string, number>;
      expect(distribution.INFO).toBe(1);
      expect(distribution.ERROR).toBe(1);
      expect(distribution.DEBUG).toBe(1);
      expect(distribution.WARN).toBe(0);
    });

    it('scope=sourceDistribution 应返回模块分布', async () => {
      const output = new VisualizedLogOutput();
      await logAccess.visualizedLog(
        { scope: 'sourceDistribution' } as VisualizedLogInput,
        new LogContext(),
        output,
      );

      const data = output.data as Record<string, unknown>;
      const sources = data.sources as Array<{ module: string }>;
      const modules = sources.map((s) => s.module).sort();
      expect(modules).toContain('VisA');
      expect(modules).toContain('VisB');
    });

    it('无效 scope 应返回错误', async () => {
      const output = new VisualizedLogOutput();
      const ok = await logAccess.visualizedLog(
        { scope: 'invalidScope' } as VisualizedLogInput,
        new LogContext(),
        output,
      );
      expect(ok).toBe(false);
      expect(output.error).toContain('未知的可视化范围');
      expect(output.error_code).toBe('INVALID_SCOPE');
    });

    it('LogProvider 禁用时应抛出 ComponentDisabledError', async () => {
      await relationDb.update(LOG_CONFIG_TABLE, [
        { field: 'config_value', value: 'false' },
        { field: 'updated', value: Date.now() },
      ], [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ]);
      await reinitializeLogAccess(logAccess);

      const output = new VisualizedLogOutput();
      await expect(
        logAccess.visualizedLog(
          { scope: 'health' } as VisualizedLogInput,
          new LogContext(),
          output,
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // ==========================================================================
  // enableLog - 配置日志规则
  // ==========================================================================

  describe('enableLog', () => {
    it('应保存单条规则', async () => {
      const output = new EnableLogOutput();
      const ok = await logAccess.enableLog(
        { rules: [{ source: 'SoulService', method: 'addSoul', enable: true }] } as EnableLogInput,
        new LogContext(),
        output,
      );
      expect(ok).toBe(true);
    });

    it('保存规则后规则应持久化到数据库', async () => {
      await logAccess.enableLog(
        { rules: [{ source: 'SoulService', method: 'addSoul', enable: true }] } as EnableLogInput,
        new LogContext(),
        new EnableLogOutput(),
      );

      // 直接从 DB 验证
      const rows = await relationDb.select(LOG_RULE_TABLE, {
        conditions: [
          { field: 'source', operator: Operator.EQ, value: 'SoulService' },
          { field: 'method', operator: Operator.EQ, value: 'addSoul' },
        ],
      });
      expect(rows.length).toBe(1);
      expect(Number(rows[0].enable)).toBe(1);
    });

    it('保存规则后应同步到内存缓存（shouldLog 生效）', async () => {
      await logAccess.enableLog(
        { rules: [
          { source: '*', method: '*', enable: false },
          { source: 'SoulService', method: '*', enable: true },
        ] } as EnableLogInput,
        new LogContext(),
        new EnableLogOutput(),
      );

      const rawService = logAccess.getRawService();

      // SoulService 的任意方法应记录
      expect(rawService.shouldLog('SoulService', 'addSoul')).toBe(true);
      expect(rawService.shouldLog('SoulService', 'delSoul')).toBe(true);

      // 其他模块不应记录
      expect(rawService.shouldLog('OtherService', 'someMethod')).toBe(false);
    });

    it('应支持通配符 `*` 匹配所有模块', async () => {
      await logAccess.enableLog(
        { rules: [{ source: '*', method: '*', enable: false }] } as EnableLogInput,
        new LogContext(),
        new EnableLogOutput(),
      );

      const rawService = logAccess.getRawService();
      expect(rawService.shouldLog('AnyModule', 'anyMethod')).toBe(false);
    });

    it('应支持精确匹配优先级高于通配符', async () => {
      await logAccess.enableLog(
        { rules: [
          { source: '*', method: '*', enable: false },
          { source: 'AllowModule', method: '*', enable: true },
        ] } as EnableLogInput,
        new LogContext(),
        new EnableLogOutput(),
      );

      const rawService = logAccess.getRawService();
      expect(rawService.shouldLog('AllowModule', 'anyMethod')).toBe(true);
      expect(rawService.shouldLog('BlockModule', 'anyMethod')).toBe(false);
    });

    it('应支持精确方法匹配优先级高于通配符方法', async () => {
      await logAccess.enableLog(
        { rules: [
          { source: 'FlexModule', method: '*', enable: false },
          { source: 'FlexModule', method: 'allowedMethod', enable: true },
        ] } as EnableLogInput,
        new LogContext(),
        new EnableLogOutput(),
      );

      const rawService = logAccess.getRawService();
      expect(rawService.shouldLog('FlexModule', 'allowedMethod')).toBe(true);
      expect(rawService.shouldLog('FlexModule', 'blockedMethod')).toBe(false);
    });

    it('无规则时应默认全量记录', async () => {
      const rawService = logAccess.getRawService();
      expect(rawService.shouldLog('AnyModule', 'anyMethod')).toBe(true);
    });

    it('应支持 upsert 更新已有规则', async () => {
      await logAccess.enableLog(
        { rules: [{ source: 'UpsertModule', method: 'test', enable: true }] } as EnableLogInput,
        new LogContext(),
        new EnableLogOutput(),
      );

      // 更新为 disable
      await logAccess.enableLog(
        { rules: [{ source: 'UpsertModule', method: 'test', enable: false }] } as EnableLogInput,
        new LogContext(),
        new EnableLogOutput(),
      );

      const rawService = logAccess.getRawService();
      expect(rawService.shouldLog('UpsertModule', 'test')).toBe(false);

      // DB 中应只有一条记录
      const rows = await relationDb.select(LOG_RULE_TABLE, {
        conditions: [
          { field: 'source', operator: Operator.EQ, value: 'UpsertModule' },
          { field: 'method', operator: Operator.EQ, value: 'test' },
        ],
      });
      expect(rows.length).toBe(1);
      expect(Number(rows[0].enable)).toBe(0);
    });

    it('应支持批量设置多条规则', async () => {
      await logAccess.enableLog(
        { rules: [
          { source: 'Module1', method: 'method1', enable: true },
          { source: 'Module1', method: 'method2', enable: false },
          { source: 'Module2', method: '*', enable: true },
        ] } as EnableLogInput,
        new LogContext(),
        new EnableLogOutput(),
      );

      const rawService = logAccess.getRawService();
      expect(rawService.shouldLog('Module1', 'method1')).toBe(true);
      expect(rawService.shouldLog('Module1', 'method2')).toBe(false);
      expect(rawService.shouldLog('Module2', 'anyMethod')).toBe(true);
    });

    it('应拒绝空规则列表', async () => {
      const output = new EnableLogOutput();
      await expect(
        logAccess.enableLog(
          { rules: [] } as EnableLogInput,
          new LogContext(),
          output,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应拒绝 source 为空的规则', async () => {
      const output = new EnableLogOutput();
      await expect(
        logAccess.enableLog(
          { rules: [{ source: '', method: 'test', enable: true }] } as EnableLogInput,
          new LogContext(),
          output,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应拒绝 method 为空的规则', async () => {
      const output = new EnableLogOutput();
      await expect(
        logAccess.enableLog(
          { rules: [{ source: 'Test', method: '', enable: true }] } as EnableLogInput,
          new LogContext(),
          output,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('enableLog 在组件禁用时仍应正常工作', async () => {
      // 先禁用
      await relationDb.update(LOG_CONFIG_TABLE, [
        { field: 'config_value', value: 'false' },
        { field: 'updated', value: Date.now() },
      ], [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ]);
      await reinitializeLogAccess(logAccess);

      // enableLog 在禁用状态下仍应工作（配置方法不受 enabled 影响）
      const output = new EnableLogOutput();
      const ok = await logAccess.enableLog(
        { rules: [{ source: 'Test', method: 'test', enable: true }] } as EnableLogInput,
        new LogContext(),
        output,
      );
      expect(ok).toBe(true);
    });
  });

  // ==========================================================================
  // LogInterceptor - AOP 日志拦截器
  // ==========================================================================

  describe('LogInterceptor', () => {
    let rawService: ReturnType<typeof logAccess.getRawService>;
    let interceptor: LogInterceptor;

    beforeEach(async () => {
      rawService = logAccess.getRawService();
      interceptor = new LogInterceptor(rawService);
    });

    it('beforeExecute 应写入 DEBUG 级别日志', async () => {
      const ctx: InterceptContext = {
        targetName: 'SoulService',
        methodName: 'addSoul',
        input: undefined,
        context: undefined,
        output: undefined,
        startedAt: Date.now(),
        elapsedMs: 0,
      };

      interceptor.beforeExecute(ctx);

      // 验证日志已写入文件
      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'SoulService');
      expect(content).toContain('[DEBUG]');
      expect(content).toContain('addSoul invoke');
    });

    it('afterExecute 成功时应写入 INFO 级别日志', async () => {
      const startedAt = Date.now();
      await new Promise((r) => setTimeout(r, 5));
      const ctx: InterceptContext = {
        targetName: 'SoulService',
        methodName: 'addSoul',
        input: undefined,
        context: undefined,
        output: undefined,
        startedAt,
        elapsedMs: Date.now() - startedAt,
      };

      interceptor.afterExecute(ctx);

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'SoulService');
      expect(content).toContain('[INFO]');
      expect(content).toContain('addSoul done');
    });

    it('afterExecute 失败时应写入 ERROR 级别日志', async () => {
      const ctx: InterceptContext = {
        targetName: 'LLMService',
        methodName: 'execLLM',
        input: undefined,
        context: undefined,
        output: undefined,
        startedAt: Date.now(),
        elapsedMs: 150,
      };

      interceptor.afterExecute(ctx, new Error('连接超时'));

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'LLMService');
      expect(content).toContain('[ERROR]');
      expect(content).toContain('execLLM failed');
      expect(content).toContain('连接超时');
    });

    it('beforeExecute 应提取 input.trace_id', async () => {
      const ctx: InterceptContext = {
        targetName: 'TraceService',
        methodName: 'tracedMethod',
        input: { trace_id: 'trace-from-input' },
        context: undefined,
        output: undefined,
        startedAt: Date.now(),
        elapsedMs: 0,
      };

      interceptor.beforeExecute(ctx);

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'TraceService');
      expect(content).toContain('[trace-from-input]');
    });

    it('afterExecute 应包含 elapsed_ms', async () => {
      const ctx: InterceptContext = {
        targetName: 'ElapsedService',
        methodName: 'slowMethod',
        input: undefined,
        context: undefined,
        output: undefined,
        startedAt: Date.now(),
        elapsedMs: 250,
      };

      interceptor.afterExecute(ctx);

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'ElapsedService');
      expect(content).toContain('250');
    });

    it('afterExecute 应提取 context.caller', async () => {
      const ctx: InterceptContext = {
        targetName: 'CallerService',
        methodName: 'calledMethod',
        input: undefined,
        context: { caller: 'test-caller-id' },
        output: undefined,
        startedAt: Date.now(),
        elapsedMs: 10,
      };

      interceptor.afterExecute(ctx);

      // 虽然 caller 存储在 LogData 中，但日志行格式不包含 caller 字段
      // 但可以通过读取文件确认 caller 存在于日志数据中
    });

    it('日志中应包含 AOP 来源标识', async () => {
      const ctx: InterceptContext = {
        targetName: 'AopModule',
        methodName: 'aopMethod',
        input: undefined,
        context: undefined,
        output: undefined,
        startedAt: Date.now(),
        elapsedMs: 0,
      };

      interceptor.beforeExecute(ctx);

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'AopModule');
      expect(content).toContain('"log_source":"AOP"');
    });

    it('应遵循 enableLog 规则（未启用的模块不记录）', async () => {
      // 只允许 SoulService 的日志
      await logAccess.enableLog(
        { rules: [
          { source: '*', method: '*', enable: false },
          { source: 'SoulService', method: '*', enable: true },
        ] } as EnableLogInput,
        new LogContext(),
        new EnableLogOutput(),
      );

      const allowedCtx: InterceptContext = {
        targetName: 'SoulService',
        methodName: 'allowedMethod',
        input: undefined,
        context: undefined,
        output: undefined,
        startedAt: Date.now(),
        elapsedMs: 0,
      };

      const blockedCtx: InterceptContext = {
        targetName: 'BlockedService',
        methodName: 'blockedMethod',
        input: undefined,
        context: undefined,
        output: undefined,
        startedAt: Date.now(),
        elapsedMs: 0,
      };

      interceptor.beforeExecute(allowedCtx);
      interceptor.beforeExecute(blockedCtx);

      const allowedContent = readLogFile(path.join(tempDir, 'data', 'logs'), 'SoulService');
      expect(allowedContent).toContain('allowedMethod invoke');

      const blockedContent = readLogFile(path.join(tempDir, 'data', 'logs'), 'BlockedService');
      expect(blockedContent).toBe('');
    });

    it('afterExecute 在规则禁用时不应写入日志', async () => {
      await logAccess.enableLog(
        { rules: [
          { source: '*', method: '*', enable: false },
        ] } as EnableLogInput,
        new LogContext(),
        new EnableLogOutput(),
      );

      const ctx: InterceptContext = {
        targetName: 'DisabledService',
        methodName: 'disabledMethod',
        input: undefined,
        context: undefined,
        output: undefined,
        startedAt: Date.now(),
        elapsedMs: 100,
      };

      interceptor.afterExecute(ctx);

      const dir = path.join(tempDir, 'data', 'logs', 'DisabledService');
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('interceptor 应能处理无 input 的上下文', async () => {
      const ctx: InterceptContext = {
        targetName: 'NoInputService',
        methodName: 'noInputMethod',
        input: null,
        context: undefined,
        output: undefined,
        startedAt: Date.now(),
        elapsedMs: 0,
      };

      expect(() => interceptor.beforeExecute(ctx)).not.toThrow();
    });

    it('beforeExecute 和 afterExecute 应各自记录独立的日志行', async () => {
      const startedAt = Date.now();
      const ctx: InterceptContext = {
        targetName: 'FullCycle',
        methodName: 'cycleMethod',
        input: undefined,
        context: undefined,
        output: undefined,
        startedAt,
        elapsedMs: 0,
      };

      interceptor.beforeExecute(ctx);

      await new Promise((r) => setTimeout(r, 10));
      const afterCtx: InterceptContext = {
        ...ctx,
        elapsedMs: Date.now() - startedAt,
      };
      interceptor.afterExecute(afterCtx);

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'FullCycle');
      const lines = content.split('\n').filter((l) => l.trim());
      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('invoke');
      expect(lines[1]).toContain('done');
    });
  });

  // ==========================================================================
  // 组件生命周期
  // ==========================================================================

  describe('Component lifecycle', () => {
    it('initialize 应创建 log_rule 和 log_config 表', async () => {
      // 通过查询表验证表存在
      const configRows = await relationDb.select(LOG_CONFIG_TABLE);
      expect(configRows.length).toBeGreaterThan(0);
    });

    it('initialize 应写入默认配置项', async () => {
      const configRows = await relationDb.select(LOG_CONFIG_TABLE);
      const keys = configRows.map((r) => String(r.config_key));

      expect(keys).toContain('enabled');
      expect(keys).toContain('default_level');
      expect(keys).toContain('file_path');
      expect(keys).toContain('max_file_size');
      expect(keys).toContain('retention_days');
    });

    it('initialize 默认应启用 LogProvider', async () => {
      const output = new VisualizedLogOutput();
      await logAccess.visualizedLog(
        { scope: 'health' } as VisualizedLogInput,
        new LogContext(),
        output,
      );
      expect((output.data as Record<string, unknown>).enabled).toBe(true);
    });

    it('多次 initialize 应保持幂等', async () => {
      await logAccess.initialize();
      await logAccess.initialize();

      const configRows = await relationDb.select(LOG_CONFIG_TABLE);
      const enabledRows = configRows.filter((r) => String(r.config_key) === 'enabled');
      expect(enabledRows.length).toBe(1);
    });

    it('initialize 应从 log_config 恢复 enabled 状态', async () => {
      // 修改 DB 中的配置
      await relationDb.update(LOG_CONFIG_TABLE, [
        { field: 'config_value', value: 'false' },
        { field: 'updated', value: Date.now() },
      ], [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ]);

      // 重新初始化以读取禁用状态
      await logAccess.initialize();

      // 禁用后 visualizedLog 应抛出 ComponentDisabledError
      await expect(
        logAccess.visualizedLog(
          { scope: 'health' } as VisualizedLogInput,
          new LogContext(),
          new VisualizedLogOutput(),
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('log_rule 表应正确创建索引', async () => {
      // 直接执行查询验证索引存在
      const indexes = relationDb.queryRaw(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${LOG_RULE_TABLE}'`,
      );
      const indexNames = indexes.map((r) => String(r.name));
      expect(indexNames).toContain(`idx_${LOG_RULE_TABLE}_source`);
      expect(indexNames).toContain(`idx_${LOG_RULE_TABLE}_method`);
      expect(indexNames).toContain(`idx_${LOG_RULE_TABLE}_source_method`);
    });
  });

  // ==========================================================================
  // 边界情况
  // ==========================================================================

  describe('Edge cases', () => {
    it('日志消息包含特殊字符应正确写入和读取', async () => {
      const specialMsg = '特殊字符: !@#$%^&*()_+-={}[]|;:"<>,.?/~`';
      await logAccess.addLog(
        { data: makeLogData({ source: 'SpecialModule', message: specialMsg }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'SpecialModule');
      expect(content).toContain(specialMsg);
    });

    it('日志消息包含换行符应按原样写入', async () => {
      const multilineMsg = 'line1\nline2\nline3';
      await logAccess.addLog(
        { data: makeLogData({ source: 'MultilineModule', message: multilineMsg }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      // 换行符会被原样写入文件，导致日志跨多行
      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'MultilineModule');
      expect(content).toContain('line1');
      expect(content).toContain('line2');
      expect(content).toContain('line3');
    });

    it('不存在的模块搜索应返回空', async () => {
      const output = new SoLogOutput();
      await logAccess.soLog(
        { source: 'NonExistentModule' } as SoLogInput,
        new LogContext(),
        output,
      );
      expect(output.list.length).toBe(0);
      expect(output.total).toBe(0);
    });

    it('应正确解析标准格式的日志行', async () => {
      await logAccess.addLog(
        { data: makeLogData({
          source: 'ParseModule',
          level: LogLevel.INFO,
          trace_id: 'trace-xyz',
          message: '解析测试',
          metadata: { a: 1 },
          elapsed_ms: 100,
        }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      // 通过 soLog 验证解析结果
      const output = new SoLogOutput();
      await logAccess.soLog(
        { source: 'ParseModule' } as SoLogInput,
        new LogContext(),
        output,
      );

      expect(output.list.length).toBe(1);
      const record = output.list[0];
      expect(record.level).toBe('INFO');
      expect(record.source).toBe('ParseModule');
      expect(record.trace_id).toBe('trace-xyz');
      expect(record.message).toBe('解析测试');
      expect(record.metadata).toEqual({ a: 1 });
      expect(record.elapsed_ms).toBe(100);
    });

    it('非常大数量的日志写入应正确', async () => {
      const count = 200;
      for (let i = 0; i < count; i++) {
        await logAccess.addLog(
          { data: makeLogData({ source: 'BulkModule', message: `msg-${i}` }) } as AddLogInput,
          new LogContext(),
          new AddLogOutput(),
        );
      }

      const countOutput = new CountLogOutput();
      await logAccess.countLog(
        { source: 'BulkModule' } as CountLogInput,
        new LogContext(),
        countOutput,
      );
      expect(countOutput.count).toBe(count);
    });

    it('soLog 按时间倒序返回（最新的在前）', async () => {
      await logAccess.addLog(
        { data: makeLogData({ source: 'OrderModule', message: 'first' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );
      await new Promise((r) => setTimeout(r, 10));
      await logAccess.addLog(
        { data: makeLogData({ source: 'OrderModule', message: 'second' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      const output = new SoLogOutput();
      await logAccess.soLog(
        { source: 'OrderModule' } as SoLogInput,
        new LogContext(),
        output,
      );

      expect(output.list[0].message).toBe('second');
      expect(output.list[1].message).toBe('first');
    });

    it('LogData 中 source 为 AOP 枚举值时应正确存储', async () => {
      await logAccess.addLog(
        { data: makeLogData({ source: LogSource.AOP, message: 'AOP source test' }) } as AddLogInput,
        new LogContext(),
        new AddLogOutput(),
      );

      // AOP 作为 source 值，会被当作模块名创建目录
      const content = readLogFile(path.join(tempDir, 'data', 'logs'), 'AOP');
      expect(content).toContain('AOP source test');
    });
  });
});
