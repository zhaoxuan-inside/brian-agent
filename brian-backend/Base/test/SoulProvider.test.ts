/**
 * @fileoverview SoulProvider 模块测试。
 *
 * 测试 SoulProvider 的全部接口：addSoul / delSoul / updateSoul /
 * getSoul / soSoul / enableSoul / closeSoul / recordSoulUsage。
 *
 * 不使用任何 MOCK 数据，使用真实 SQLite 数据库。
 * 所有数据访问通过 RelationDBProvider，遵循 PromptsProvider.test.ts 的测试模式。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { DBContext, CloseDBInput, CloseDBOutput } from '../RelationDBProvider';
import {
  SoulAccess,
  SoulContext,
  AddSoulInput,
  AddSoulOutput,
  DelSoulInput,
  DelSoulOutput,
  UpdateSoulInput,
  UpdateSoulOutput,
  GetSoulInput,
  GetSoulOutput,
  SoSoulInput,
  SoSoulOutput,
  EnableSoulInput,
  EnableSoulOutput,
  CloseSoulInput,
  CloseSoulOutput,
  RecordSoulUsageInput,
  RecordSoulUsageOutput,
} from '../SoulProvider';
import { Operator, Direction } from '../shared/query';
import {
  ComponentDisabledError,
  ValidationError,
  DatabaseError,
} from '../shared/errors';

// ---------------------------------------------------------------------------
// 测试辅助函数
// ---------------------------------------------------------------------------

/** 生成唯一的 Soul 测试数据 */
function makeSoulData(overrides?: Record<string, unknown>) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    soul_content: `你是一个友善的 ${suffix} 助手`,
    soul_brief: `通用助手 ${suffix}`,
    soul_usage: `对话场景 ${suffix}`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('SoulProvider', () => {
  let tempDir: string;
  let sqlitePath: string;
  let relationDb: RelationDBAccess;
  let soulAccess: SoulAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-soul-test-'));
    sqlitePath = path.join(tempDir, 'test.db');

    relationDb = new RelationDBAccess({ dbPath: sqlitePath });
    await relationDb.initialize();

    soulAccess = new SoulAccess(relationDb);
    await soulAccess.initialize();
  });

  afterEach(async () => {
    try {
      await soulAccess.closeSoul(
        new CloseSoulInput(),
        new SoulContext(),
        new CloseSoulOutput(),
      );
    } catch {
      // 忽略关闭时的错误
    }
    try {
      await relationDb.closeDB(
        new CloseDBInput(),
        new DBContext(),
        new CloseDBOutput(),
      );
    } catch {
      // 忽略关闭时的错误
    }
    await new Promise((r) => setTimeout(r, 100));

    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // 忽略清理错误
      }
    }
  });

  // =========================================================================
  // addSoul - 新增 Soul
  // =========================================================================

  describe('addSoul', () => {
    it('应该成功新增一个 Soul', async () => {
      const input = new AddSoulInput();
      input.data = makeSoulData();
      const output = new AddSoulOutput();

      const result = await soulAccess.addSoul(
        input,
        new SoulContext(),
        output,
      );
      expect(result).toBe(true);
      expect(output.id).toBeTruthy();
      expect(typeof output.id).toBe('string');
      expect(output.id.length).toBeGreaterThan(0);
    });

    it('新增后应该可以通过 getSoul 查到', async () => {
      const data = makeSoulData({
        soul_content: 'UniqueAddSoulContent',
        soul_brief: 'UniqueAddSoulBrief',
      });
      const input = new AddSoulInput();
      input.data = data;
      const out = new AddSoulOutput();
      await soulAccess.addSoul(input, new SoulContext(), out);

      const getInput = new GetSoulInput();
      getInput.id = out.id;
      const getOut = new GetSoulOutput();
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);

      expect(getOut.soul).toBeTruthy();
      expect(getOut.soul!.soul_content).toBe('UniqueAddSoulContent');
      expect(getOut.soul!.soul_brief).toBe('UniqueAddSoulBrief');
    });

    it('enable 默认为 true (1)', async () => {
      const input = new AddSoulInput();
      input.data = makeSoulData();
      const out = new AddSoulOutput();
      await soulAccess.addSoul(input, new SoulContext(), out);

      const getInput = new GetSoulInput();
      getInput.id = out.id;
      const getOut = new GetSoulOutput();
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);

      expect(getOut.soul!.enable).toBeTruthy();
    });

    it('新增时指定 enable: false 应该保存为 0', async () => {
      const input = new AddSoulInput();
      input.data = makeSoulData({ enable: false });
      const out = new AddSoulOutput();
      await soulAccess.addSoul(input, new SoulContext(), out);

      const getInput = new GetSoulInput();
      getInput.id = out.id;
      const getOut = new GetSoulOutput();
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);

      expect(getOut.soul!.enable).toBeFalsy();
    });

    it('系统字段 id / created / updated 应该自动填充', async () => {
      const input = new AddSoulInput();
      input.data = makeSoulData();
      const out = new AddSoulOutput();
      const before = Date.now();
      await soulAccess.addSoul(input, new SoulContext(), out);
      const after = Date.now();

      const getInput = new GetSoulInput();
      getInput.id = out.id;
      const getOut = new GetSoulOutput();
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);

      expect(getOut.soul!.id).toBe(out.id);
      expect(getOut.soul!.created).toBeGreaterThanOrEqual(before);
      expect(getOut.soul!.created).toBeLessThanOrEqual(after);
      expect(getOut.soul!.updated).toBeGreaterThanOrEqual(before);
      expect(getOut.soul!.updated).toBeLessThanOrEqual(after);
    });

    it('每个新增的 Soul 应该有唯一 ID', async () => {
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData();
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData();
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      expect(out1.id).not.toBe(out2.id);
    });

    it('应该保存所有三个字段：soul_content / soul_brief / soul_usage', async () => {
      const data = {
        soul_content: '你是一个专业的代码审查助手',
        soul_brief: '代码审查助手',
        soul_usage: '用于代码审查场景',
      };
      const input = new AddSoulInput();
      input.data = data;
      const out = new AddSoulOutput();
      await soulAccess.addSoul(input, new SoulContext(), out);

      const getInput = new GetSoulInput();
      getInput.id = out.id;
      const getOut = new GetSoulOutput();
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);

      expect(getOut.soul!.soul_content).toBe(data.soul_content);
      expect(getOut.soul!.soul_brief).toBe(data.soul_brief);
      expect(getOut.soul!.soul_usage).toBe(data.soul_usage);
    });
  });

  // =========================================================================
  // delSoul - 删除 Soul
  // =========================================================================

  describe('delSoul', () => {
    it('应该成功按 ID 删除 Soul', async () => {
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const input = new DelSoulInput();
      input.ids = [addOut.id];
      const output = new DelSoulOutput();
      const result = await soulAccess.delSoul(input, new SoulContext(), output);
      expect(result).toBe(true);
      expect(output.affected_rows).toBe(1);

      // 验证已删除
      const getInput = new GetSoulInput();
      getInput.id = addOut.id;
      const getOut = new GetSoulOutput();
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);
      expect(getOut.soul).toBeNull();
    });

    it('应该成功按批量 ID 删除 Soul', async () => {
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData();
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData();
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      const delInput = new DelSoulInput();
      delInput.ids = [out1.id, out2.id];
      const delOutput = new DelSoulOutput();
      await soulAccess.delSoul(delInput, new SoulContext(), delOutput);
      expect(delOutput.affected_rows).toBe(2);

      // 验证都删除了
      const getOut1 = new GetSoulOutput();
      const getInput1 = new GetSoulInput();
      getInput1.id = out1.id;
      await soulAccess.getSoul(getInput1, new SoulContext(), getOut1);
      expect(getOut1.soul).toBeNull();

      const getOut2 = new GetSoulOutput();
      const getInput2 = new GetSoulInput();
      getInput2.id = out2.id;
      await soulAccess.getSoul(getInput2, new SoulContext(), getOut2);
      expect(getOut2.soul).toBeNull();
    });

    it('应该成功按条件删除 Soul', async () => {
      const out = new AddSoulOutput();
      const input = new AddSoulInput();
      input.data = makeSoulData({ soul_brief: 'DeleteByCondition' });
      await soulAccess.addSoul(input, new SoulContext(), out);

      const delInput = new DelSoulInput();
      delInput.conditions = [
        { field: 'soul_brief', operator: Operator.EQ, value: 'DeleteByCondition' },
      ];
      const delOutput = new DelSoulOutput();
      await soulAccess.delSoul(delInput, new SoulContext(), delOutput);
      expect(delOutput.affected_rows).toBe(1);
    });

    it('删除不存在的 ID 应该返回 affected_rows = 0', async () => {
      const input = new DelSoulInput();
      input.ids = ['non-existent-id'];
      const output = new DelSoulOutput();
      const result = await soulAccess.delSoul(input, new SoulContext(), output);
      expect(result).toBe(true);
      expect(output.affected_rows).toBe(0);
    });

    it('ids 与 conditions 都不传应该抛出 ValidationError', async () => {
      const input = new DelSoulInput();
      const output = new DelSoulOutput();
      await expect(
        soulAccess.delSoul(input, new SoulContext(), output),
      ).rejects.toThrow(ValidationError);
    });

    it('删除 Soul 后应清理对应的 soul_usage 记录', async () => {
      const out = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      await soulAccess.addSoul(addInput, new SoulContext(), out);

      // 记录一次使用
      const usageInput = new RecordSoulUsageInput();
      usageInput.soul_id = out.id;
      await soulAccess.recordSoulUsage(
        usageInput,
        new SoulContext(),
        new RecordSoulUsageOutput(),
      );

      // 删除 Soul
      const delInput = new DelSoulInput();
      delInput.ids = [out.id];
      await soulAccess.delSoul(delInput, new SoulContext(), new DelSoulOutput());

      // 查询 soul_usage 是否被清理
      const soOut = new SoSoulOutput();
      const soInput = new SoSoulInput();
      soInput.order_by = [
        { field: 'usage_today_count', direction: Direction.DESC },
      ];
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      // usage 关联记录应已不存在
      for (const s of soOut.list) {
        expect(s.id).not.toBe(out.id);
      }
    });
  });

  // =========================================================================
  // updateSoul - 更新 Soul
  // =========================================================================

  describe('updateSoul', () => {
    it('应该成功按 ID 更新单个字段', async () => {
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData({ soul_brief: 'OriginalBrief' });
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const updateInput = new UpdateSoulInput();
      updateInput.id = addOut.id;
      updateInput.data = { soul_brief: 'UpdatedBrief' };
      const updateOutput = new UpdateSoulOutput();
      await soulAccess.updateSoul(
        updateInput,
        new SoulContext(),
        updateOutput,
      );
      expect(updateOutput.affected_rows).toBe(1);

      // 验证
      const getInput = new GetSoulInput();
      getInput.id = addOut.id;
      const getOut = new GetSoulOutput();
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);
      expect(getOut.soul!.soul_brief).toBe('UpdatedBrief');
    });

    it('应该成功按 ID 更新多个字段', async () => {
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const updateInput = new UpdateSoulInput();
      updateInput.id = addOut.id;
      updateInput.data = {
        soul_content: 'NewContent',
        soul_brief: 'NewBrief',
      };
      const updateOutput = new UpdateSoulOutput();
      await soulAccess.updateSoul(
        updateInput,
        new SoulContext(),
        updateOutput,
      );
      expect(updateOutput.affected_rows).toBe(1);

      const getInput = new GetSoulInput();
      getInput.id = addOut.id;
      const getOut = new GetSoulOutput();
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);
      expect(getOut.soul!.soul_content).toBe('NewContent');
      expect(getOut.soul!.soul_brief).toBe('NewBrief');
    });

    it('update 后 updated 时间戳应更新', async () => {
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const getOut1 = new GetSoulOutput();
      const getInput1 = new GetSoulInput();
      getInput1.id = addOut.id;
      await soulAccess.getSoul(getInput1, new SoulContext(), getOut1);
      const originalUpdated = getOut1.soul!.updated;

      // 等待一小段时间确保时间戳变化
      await new Promise((r) => setTimeout(r, 10));

      const updateInput = new UpdateSoulInput();
      updateInput.id = addOut.id;
      updateInput.data = { soul_brief: 'AfterUpdate' };
      await soulAccess.updateSoul(
        updateInput,
        new SoulContext(),
        new UpdateSoulOutput(),
      );

      const getOut2 = new GetSoulOutput();
      const getInput2 = new GetSoulInput();
      getInput2.id = addOut.id;
      await soulAccess.getSoul(getInput2, new SoulContext(), getOut2);

      expect(getOut2.soul!.updated).toBeGreaterThan(originalUpdated);
    });

    it('应该支持按条件更新', async () => {
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData({ soul_brief: 'CondUpdate' });
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData({ soul_brief: 'CondUpdate' });
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      const updateInput = new UpdateSoulInput();
      updateInput.conditions = [
        { field: 'soul_brief', operator: Operator.EQ, value: 'CondUpdate' },
      ];
      updateInput.data = { soul_brief: 'UpdatedByCond' };
      const updateOutput = new UpdateSoulOutput();
      await soulAccess.updateSoul(
        updateInput,
        new SoulContext(),
        updateOutput,
      );
      expect(updateOutput.affected_rows).toBe(2);
    });

    it('资源级启用/禁用通过 updateSoul 修改 enable 字段', async () => {
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      // 禁用
      const updateInput = new UpdateSoulInput();
      updateInput.id = addOut.id;
      updateInput.data = { enable: false };
      await soulAccess.updateSoul(
        updateInput,
        new SoulContext(),
        new UpdateSoulOutput(),
      );

      const getOut = new GetSoulOutput();
      const getInput = new GetSoulInput();
      getInput.id = addOut.id;
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);
      expect(getOut.soul!.enable).toBeFalsy();

      // 重新启用
      const reEnableInput = new UpdateSoulInput();
      reEnableInput.id = addOut.id;
      reEnableInput.data = { enable: true };
      await soulAccess.updateSoul(
        reEnableInput,
        new SoulContext(),
        new UpdateSoulOutput(),
      );

      const getOut2 = new GetSoulOutput();
      const getInput2 = new GetSoulInput();
      getInput2.id = addOut.id;
      await soulAccess.getSoul(getInput2, new SoulContext(), getOut2);
      expect(getOut2.soul!.enable).toBeTruthy();
    });

    it('更新不存在的 ID 应该返回 affected_rows = 0', async () => {
      const updateInput = new UpdateSoulInput();
      updateInput.id = 'non-existent-id';
      updateInput.data = { soul_brief: 'Nope' };
      const output = new UpdateSoulOutput();
      await soulAccess.updateSoul(updateInput, new SoulContext(), output);
      expect(output.affected_rows).toBe(0);
    });

    it('id 与 conditions 都不传应该抛出 ValidationError', async () => {
      const input = new UpdateSoulInput();
      input.data = { soul_brief: 'NoId' };
      const output = new UpdateSoulOutput();
      await expect(
        soulAccess.updateSoul(input, new SoulContext(), output),
      ).rejects.toThrow(ValidationError);
    });

    it('空 data 对象也可执行（仅更新 updated）', async () => {
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const getOut1 = new GetSoulOutput();
      const getInput1 = new GetSoulInput();
      getInput1.id = addOut.id;
      await soulAccess.getSoul(getInput1, new SoulContext(), getOut1);
      const originalUpdated = getOut1.soul!.updated;

      await new Promise((r) => setTimeout(r, 10));

      const updateInput = new UpdateSoulInput();
      updateInput.id = addOut.id;
      updateInput.data = {};
      const updateOutput = new UpdateSoulOutput();
      await soulAccess.updateSoul(updateInput, new SoulContext(), updateOutput);
      expect(updateOutput.affected_rows).toBe(1);

      const getOut2 = new GetSoulOutput();
      const getInput2 = new GetSoulInput();
      getInput2.id = addOut.id;
      await soulAccess.getSoul(getInput2, new SoulContext(), getOut2);
      expect(getOut2.soul!.updated).toBeGreaterThan(originalUpdated);
    });
  });

  // =========================================================================
  // getSoul - 获取 Soul
  // =========================================================================

  describe('getSoul', () => {
    it('应该成功按 ID 获取 Soul', async () => {
      const data = makeSoulData({ soul_content: 'GetById' });
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = data;
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const getInput = new GetSoulInput();
      getInput.id = addOut.id;
      const getOut = new GetSoulOutput();
      const result = await soulAccess.getSoul(
        getInput,
        new SoulContext(),
        getOut,
      );
      expect(result).toBe(true);
      expect(getOut.soul).toBeTruthy();
      expect(getOut.soul!.id).toBe(addOut.id);
      expect(getOut.soul!.soul_content).toBe('GetById');
    });

    it('按不存在的 ID 获取应返回 null', async () => {
      const getInput = new GetSoulInput();
      getInput.id = 'non-existent-id';
      const getOut = new GetSoulOutput();
      const result = await soulAccess.getSoul(
        getInput,
        new SoulContext(),
        getOut,
      );
      expect(result).toBe(true);
      expect(getOut.soul).toBeNull();
    });

    it('应该成功按条件获取第一条 Soul', async () => {
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData({ soul_brief: 'CondGetTarget' });
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData({ soul_brief: 'CondGetTarget' });
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      const getInput = new GetSoulInput();
      getInput.conditions = [
        { field: 'soul_brief', operator: Operator.EQ, value: 'CondGetTarget' },
      ];
      const getOut = new GetSoulOutput();
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);
      expect(getOut.soul).toBeTruthy();
      expect(getOut.soul!.soul_brief).toBe('CondGetTarget');
    });

    it('id 与 conditions 都不传应该抛出 ValidationError', async () => {
      const getInput = new GetSoulInput();
      const getOut = new GetSoulOutput();
      await expect(
        soulAccess.getSoul(getInput, new SoulContext(), getOut),
      ).rejects.toThrow(ValidationError);
    });

    it('getSoul 返回的记录应包含所有系统字段', async () => {
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const getInput = new GetSoulInput();
      getInput.id = addOut.id;
      const getOut = new GetSoulOutput();
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);

      expect(getOut.soul).toHaveProperty('id');
      expect(getOut.soul).toHaveProperty('created');
      expect(getOut.soul).toHaveProperty('updated');
      expect(getOut.soul).toHaveProperty('soul_content');
      expect(getOut.soul).toHaveProperty('soul_brief');
      expect(getOut.soul).toHaveProperty('soul_usage');
      expect(getOut.soul).toHaveProperty('enable');
    });
  });

  // =========================================================================
  // soSoul - 搜索 Soul
  // =========================================================================

  describe('soSoul', () => {
    it('无过滤条件的搜索应返回所有 Soul', async () => {
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData();
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData();
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      const soInput = new SoSoulInput();
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      expect(soOut.total).toBeGreaterThanOrEqual(2);
      expect(soOut.list.length).toBeGreaterThanOrEqual(2);
    });

    it('关键词搜索应匹配 soul_content', async () => {
      const data = makeSoulData({ soul_content: '我是一名专业翻译员' });
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = data;
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const soInput = new SoSoulInput();
      soInput.keyword = '翻译员';
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      expect(soOut.total).toBeGreaterThanOrEqual(1);
      const found = soOut.list.find((s) => s.id === addOut.id);
      expect(found).toBeTruthy();
    });

    it('关键词搜索应匹配 soul_brief', async () => {
      const data = makeSoulData({ soul_brief: '代码生成专家' });
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = data;
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const soInput = new SoSoulInput();
      soInput.keyword = '代码生成';
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      const found = soOut.list.find((s) => s.id === addOut.id);
      expect(found).toBeTruthy();
    });

    it('关键词无匹配时应返回空结果', async () => {
      const soInput = new SoSoulInput();
      soInput.keyword = '不存在的关键词xyz123';
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      expect(soOut.list).toHaveLength(0);
      expect(soOut.total).toBe(0);
    });

    it('应支持按条件过滤', async () => {
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData({ soul_brief: 'EnabledSoul' });
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData({ soul_brief: 'DisabledSoul', enable: false });
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      const soInput = new SoSoulInput();
      soInput.conditions = [
        { field: 'soul_brief', operator: Operator.EQ, value: 'EnabledSoul' },
      ];
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      expect(soOut.total).toBe(1);
      expect(soOut.list[0].soul_brief).toBe('EnabledSoul');
    });

    it('关键词 + 条件同时使用应正确分组过滤', async () => {
      // 创建数据：有匹配关键词但不符合条件的，有符合条件但不匹配关键词的，有两者都匹配的
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData({
        soul_content: '我是翻译助手',
        soul_brief: 'Target',
      });
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData({
        soul_content: '我是翻译助手',
        soul_brief: 'Other',
      });
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      const out3 = new AddSoulOutput();
      const input3 = new AddSoulInput();
      input3.data = makeSoulData({
        soul_content: '我是代码助手',
        soul_brief: 'Target',
      });
      await soulAccess.addSoul(input3, new SoulContext(), out3);

      // 搜索：关键词"翻译" AND soul_brief="Target"
      const soInput = new SoSoulInput();
      soInput.keyword = '翻译';
      soInput.conditions = [
        { field: 'soul_brief', operator: Operator.EQ, value: 'Target' },
      ];
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      // 只有 out1 同时匹配关键词和条件
      expect(soOut.total).toBe(1);
      expect(soOut.list[0].id).toBe(out1.id);
    });

    it('应支持分页', async () => {
      for (let i = 0; i < 15; i++) {
        const addOut = new AddSoulOutput();
        const addInput = new AddSoulInput();
        addInput.data = makeSoulData({
          soul_brief: `PageTest-${i}`,
        });
        await soulAccess.addSoul(addInput, new SoulContext(), addOut);
      }

      // 第一页 10 条
      const soInput1 = new SoSoulInput();
      soInput1.page = { current: 1, size: 10 };
      soInput1.order_by = [
        { field: 'created', direction: Direction.ASC },
      ];
      const soOut1 = new SoSoulOutput();
      await soulAccess.soSoul(soInput1, new SoulContext(), soOut1);
      expect(soOut1.list.length).toBe(10);
      expect(soOut1.total).toBe(15);

      // 第二页 5 条
      const soInput2 = new SoSoulInput();
      soInput2.page = { current: 2, size: 10 };
      soInput2.order_by = [
        { field: 'created', direction: Direction.ASC },
      ];
      const soOut2 = new SoSoulOutput();
      await soulAccess.soSoul(soInput2, new SoulContext(), soOut2);
      expect(soOut2.list.length).toBe(5);
      expect(soOut2.total).toBe(15);
    });

    it('应支持排序', async () => {
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData({ soul_brief: 'AAA First' });
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      await new Promise((r) => setTimeout(r, 5));

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData({ soul_brief: 'ZZZ Last' });
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      // ASC
      const soInputAsc = new SoSoulInput();
      soInputAsc.order_by = [
        { field: 'created', direction: Direction.ASC },
      ];
      const soOutAsc = new SoSoulOutput();
      await soulAccess.soSoul(soInputAsc, new SoulContext(), soOutAsc);
      expect(soOutAsc.list[0].id).toBe(out1.id);

      // DESC
      const soInputDesc = new SoSoulInput();
      soInputDesc.order_by = [
        { field: 'created', direction: Direction.DESC },
      ];
      const soOutDesc = new SoSoulOutput();
      await soulAccess.soSoul(soInputDesc, new SoulContext(), soOutDesc);
      expect(soOutDesc.list[0].id).toBe(out2.id);
    });
  });

  // =========================================================================
  // soSoul - 按使用频率排序
  // =========================================================================

  describe('soSoul usage-based sorting', () => {
    it('应按 usage_today_count 排序', async () => {
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData({ soul_brief: 'HighUsageSoul' });
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData({ soul_brief: 'LowUsageSoul' });
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      // out1 记录 3 次使用
      for (let i = 0; i < 3; i++) {
        const usageInput = new RecordSoulUsageInput();
        usageInput.soul_id = out1.id;
        await soulAccess.recordSoulUsage(
          usageInput,
          new SoulContext(),
          new RecordSoulUsageOutput(),
        );
      }

      // out2 记录 1 次使用
      const usageInput2 = new RecordSoulUsageInput();
      usageInput2.soul_id = out2.id;
      await soulAccess.recordSoulUsage(
        usageInput2,
        new SoulContext(),
        new RecordSoulUsageOutput(),
      );

      const soInput = new SoSoulInput();
      soInput.order_by = [
        { field: 'usage_today_count', direction: Direction.DESC },
      ];
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      // HighUsageSoul (3次) 应在 LowUsageSoul (1次) 前
      const idx1 = soOut.list.findIndex((s) => s.id === out1.id);
      const idx2 = soOut.list.findIndex((s) => s.id === out2.id);
      expect(idx1).toBeGreaterThanOrEqual(0);
      expect(idx2).toBeGreaterThanOrEqual(0);
      expect(idx1).toBeLessThan(idx2);
    });

    it('应按 usage_7d_count 排序', async () => {
      const out = new AddSoulOutput();
      const input = new AddSoulInput();
      input.data = makeSoulData({ soul_brief: 'WeekUsageSoul' });
      await soulAccess.addSoul(input, new SoulContext(), out);

      // 记录使用
      const usageInput = new RecordSoulUsageInput();
      usageInput.soul_id = out.id;
      await soulAccess.recordSoulUsage(
        usageInput,
        new SoulContext(),
        new RecordSoulUsageOutput(),
      );

      const soInput = new SoSoulInput();
      soInput.order_by = [
        { field: 'usage_7d_count', direction: Direction.ASC },
      ];
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      const found = soOut.list.find((s) => s.id === out.id);
      expect(found).toBeTruthy();
      expect(soOut.total).toBeGreaterThanOrEqual(1);
    });

    it('应按 usage_30d_count 排序', async () => {
      const out = new AddSoulOutput();
      const input = new AddSoulInput();
      input.data = makeSoulData({ soul_brief: 'MonthUsageSoul' });
      await soulAccess.addSoul(input, new SoulContext(), out);

      const usageInput = new RecordSoulUsageInput();
      usageInput.soul_id = out.id;
      await soulAccess.recordSoulUsage(
        usageInput,
        new SoulContext(),
        new RecordSoulUsageOutput(),
      );

      const soInput = new SoSoulInput();
      soInput.order_by = [
        { field: 'usage_30d_count', direction: Direction.DESC },
      ];
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      const found = soOut.list.find((s) => s.id === out.id);
      expect(found).toBeTruthy();
    });

    it('使用频率排序应支持分页', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 15; i++) {
        const addOut = new AddSoulOutput();
        const addInput = new AddSoulInput();
        addInput.data = makeSoulData({ soul_brief: `UsagePage-${i}` });
        await soulAccess.addSoul(addInput, new SoulContext(), addOut);
        ids.push(addOut.id);
      }

      // 每个记录不同使用次数用于测试排序
      for (let i = 0; i < ids.length; i++) {
        const usageInput = new RecordSoulUsageInput();
        usageInput.soul_id = ids[i];
        for (let j = 0; j < i; j++) {
          await soulAccess.recordSoulUsage(
            usageInput,
            new SoulContext(),
            new RecordSoulUsageOutput(),
          );
        }
      }

      const soInput = new SoSoulInput();
      soInput.order_by = [
        { field: 'usage_today_count', direction: Direction.DESC },
      ];
      soInput.page = { current: 1, size: 5 };
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      expect(soOut.list.length).toBe(5);
      expect(soOut.total).toBe(15);
    });

    it('无使用记录的 Soul 在升序中应排在前面', async () => {
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData({ soul_brief: 'NoUsage' });
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData({ soul_brief: 'HasUsage' });
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      const usageInput = new RecordSoulUsageInput();
      usageInput.soul_id = out2.id;
      for (let i = 0; i < 5; i++) {
        await soulAccess.recordSoulUsage(
          usageInput,
          new SoulContext(),
          new RecordSoulUsageOutput(),
        );
      }

      const soInput = new SoSoulInput();
      soInput.order_by = [
        { field: 'usage_today_count', direction: Direction.ASC },
      ];
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      const idx1 = soOut.list.findIndex((s) => s.id === out1.id);
      const idx2 = soOut.list.findIndex((s) => s.id === out2.id);
      expect(idx1).toBe(0); // NoUsage (0) 应在 HasUsage (5) 之前
      expect(idx2).toBe(1);
    });
  });

  // =========================================================================
  // enableSoul - 启用/禁用组件
  // =========================================================================

  describe('enableSoul', () => {
    it('应该成功禁用 Soul 组件', async () => {
      const enableInput = new EnableSoulInput();
      enableInput.enable = false;
      await soulAccess.enableSoul(
        enableInput,
        new SoulContext(),
        new EnableSoulOutput(),
      );

      // 禁用后操作应失败
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      const addOut = new AddSoulOutput();
      await expect(
        soulAccess.addSoul(addInput, new SoulContext(), addOut),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('禁用后应可重新启用', async () => {
      // 禁用
      const disableInput = new EnableSoulInput();
      disableInput.enable = false;
      await soulAccess.enableSoul(
        disableInput,
        new SoulContext(),
        new EnableSoulOutput(),
      );

      // 重新启用
      const enableInput = new EnableSoulInput();
      enableInput.enable = true;
      await soulAccess.enableSoul(
        enableInput,
        new SoulContext(),
        new EnableSoulOutput(),
      );

      // 启用后操作应成功
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      const addOut = new AddSoulOutput();
      const result = await soulAccess.addSoul(
        addInput,
        new SoulContext(),
        addOut,
      );
      expect(result).toBe(true);
      expect(addOut.id).toBeTruthy();
    });

    it('enableSoul 状态应持久化到 soul_config', async () => {
      const disableInput = new EnableSoulInput();
      disableInput.enable = false;
      await soulAccess.enableSoul(
        disableInput,
        new SoulContext(),
        new EnableSoulOutput(),
      );

      // 创建新的 access 实例（使用同一个 relationDb）
      const newAccess = new SoulAccess(relationDb);
      await newAccess.initialize();

      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      const addOut = new AddSoulOutput();
      await expect(
        newAccess.addSoul(addInput, new SoulContext(), addOut),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('初始化时应从 config 恢复 enable 状态', async () => {
      // 先禁用
      const disableInput = new EnableSoulInput();
      disableInput.enable = false;
      await soulAccess.enableSoul(
        disableInput,
        new SoulContext(),
        new EnableSoulOutput(),
      );

      // 重新初始化
      const newAccess = new SoulAccess(relationDb);
      await newAccess.initialize();

      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      const addOut = new AddSoulOutput();
      await expect(
        newAccess.addSoul(addInput, new SoulContext(), addOut),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('反复启用禁用应正常工作', async () => {
      // 禁用
      const e1 = new EnableSoulInput();
      e1.enable = false;
      await soulAccess.enableSoul(e1, new SoulContext(), new EnableSoulOutput());

      // 启用
      const e2 = new EnableSoulInput();
      e2.enable = true;
      await soulAccess.enableSoul(e2, new SoulContext(), new EnableSoulOutput());

      // 再禁用
      const e3 = new EnableSoulInput();
      e3.enable = false;
      await soulAccess.enableSoul(e3, new SoulContext(), new EnableSoulOutput());

      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      const addOut = new AddSoulOutput();
      await expect(
        soulAccess.addSoul(addInput, new SoulContext(), addOut),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('禁用后所有操作都应该被拒绝', async () => {
      const disableInput = new EnableSoulInput();
      disableInput.enable = false;
      await soulAccess.enableSoul(
        disableInput,
        new SoulContext(),
        new EnableSoulOutput(),
      );

      // addSoul
      await expect(
        soulAccess.addSoul(
          Object.assign(new AddSoulInput(), { data: makeSoulData() }),
          new SoulContext(),
          new AddSoulOutput(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      // delSoul
      await expect(
        soulAccess.delSoul(
          Object.assign(new DelSoulInput(), { ids: ['any'] }),
          new SoulContext(),
          new DelSoulOutput(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      // updateSoul
      await expect(
        soulAccess.updateSoul(
          Object.assign(new UpdateSoulInput(), {
            id: 'any',
            data: { soul_brief: 'x' },
          }),
          new SoulContext(),
          new UpdateSoulOutput(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      // getSoul
      await expect(
        soulAccess.getSoul(
          Object.assign(new GetSoulInput(), { id: 'any' }),
          new SoulContext(),
          new GetSoulOutput(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      // soSoul
      await expect(
        soulAccess.soSoul(
          new SoSoulInput(),
          new SoulContext(),
          new SoSoulOutput(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      // recordSoulUsage
      await expect(
        soulAccess.recordSoulUsage(
          Object.assign(new RecordSoulUsageInput(), { soul_id: 'any' }),
          new SoulContext(),
          new RecordSoulUsageOutput(),
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // =========================================================================
  // closeSoul - 关闭组件（终态操作）
  // =========================================================================

  describe('closeSoul', () => {
    it('closeSoul 后所有操作应抛出 DatabaseError', async () => {
      await soulAccess.closeSoul(
        new CloseSoulInput(),
        new SoulContext(),
        new CloseSoulOutput(),
      );

      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      const addOut = new AddSoulOutput();
      await expect(
        soulAccess.addSoul(addInput, new SoulContext(), addOut),
      ).rejects.toThrow(DatabaseError);
    });

    it('closeSoul 后 enableSoul 应抛出 DatabaseError', async () => {
      await soulAccess.closeSoul(
        new CloseSoulInput(),
        new SoulContext(),
        new CloseSoulOutput(),
      );

      await expect(
        soulAccess.enableSoul(
          Object.assign(new EnableSoulInput(), { enable: true }),
          new SoulContext(),
          new EnableSoulOutput(),
        ),
      ).rejects.toThrow(DatabaseError);
    });

    it('先禁用再 closeSoul 也应生效', async () => {
      const disableInput = new EnableSoulInput();
      disableInput.enable = false;
      await soulAccess.enableSoul(
        disableInput,
        new SoulContext(),
        new EnableSoulOutput(),
      );

      await soulAccess.closeSoul(
        new CloseSoulInput(),
        new SoulContext(),
        new CloseSoulOutput(),
      );

      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      const addOut = new AddSoulOutput();
      await expect(
        soulAccess.addSoul(addInput, new SoulContext(), addOut),
      ).rejects.toThrow(DatabaseError);
    });

    it('closeSoul 可以重复调用且无副作用', async () => {
      await soulAccess.closeSoul(
        new CloseSoulInput(),
        new SoulContext(),
        new CloseSoulOutput(),
      );
      await soulAccess.closeSoul(
        new CloseSoulInput(),
        new SoulContext(),
        new CloseSoulOutput(),
      );

      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      const addOut = new AddSoulOutput();
      await expect(
        soulAccess.addSoul(addInput, new SoulContext(), addOut),
      ).rejects.toThrow(DatabaseError);
    });

    it('close 后重新创建 SoulAccess 实例可以恢复工作', async () => {
      await soulAccess.closeSoul(
        new CloseSoulInput(),
        new SoulContext(),
        new CloseSoulOutput(),
      );

      // 创建新的 access 实例重新初始化
      const newAccess = new SoulAccess(relationDb);
      await newAccess.initialize();

      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      const addOut = new AddSoulOutput();
      const result = await newAccess.addSoul(
        addInput,
        new SoulContext(),
        addOut,
      );
      expect(result).toBe(true);
      expect(addOut.id).toBeTruthy();
    });

    it('closeSoul 后所有接口类型都应抛出 DatabaseError', async () => {
      await soulAccess.closeSoul(
        new CloseSoulInput(),
        new SoulContext(),
        new CloseSoulOutput(),
      );

      // delSoul
      await expect(
        soulAccess.delSoul(
          Object.assign(new DelSoulInput(), { ids: ['any'] }),
          new SoulContext(),
          new DelSoulOutput(),
        ),
      ).rejects.toThrow(DatabaseError);

      // updateSoul
      await expect(
        soulAccess.updateSoul(
          Object.assign(new UpdateSoulInput(), {
            id: 'any',
            data: { soul_brief: 'x' },
          }),
          new SoulContext(),
          new UpdateSoulOutput(),
        ),
      ).rejects.toThrow(DatabaseError);

      // getSoul
      await expect(
        soulAccess.getSoul(
          Object.assign(new GetSoulInput(), { id: 'any' }),
          new SoulContext(),
          new GetSoulOutput(),
        ),
      ).rejects.toThrow(DatabaseError);

      // soSoul
      await expect(
        soulAccess.soSoul(
          new SoSoulInput(),
          new SoulContext(),
          new SoSoulOutput(),
        ),
      ).rejects.toThrow(DatabaseError);

      // recordSoulUsage
      await expect(
        soulAccess.recordSoulUsage(
          Object.assign(new RecordSoulUsageInput(), { soul_id: 'any' }),
          new SoulContext(),
          new RecordSoulUsageOutput(),
        ),
      ).rejects.toThrow(DatabaseError);
    });
  });

  // =========================================================================
  // recordSoulUsage - 记录 Soul 使用
  // =========================================================================

  describe('recordSoulUsage', () => {
    it('首次记录应新增 usage 记录（usage_count=1）', async () => {
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const usageInput = new RecordSoulUsageInput();
      usageInput.soul_id = addOut.id;
      const result = await soulAccess.recordSoulUsage(
        usageInput,
        new SoulContext(),
        new RecordSoulUsageOutput(),
      );
      expect(result).toBe(true);

      // 验证 soSoul 按使用频率排序能找到
      const soInput = new SoSoulInput();
      soInput.order_by = [
        { field: 'usage_today_count', direction: Direction.DESC },
      ];
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      const found = soOut.list.find((s) => s.id === addOut.id);
      expect(found).toBeTruthy();
    });

    it('多次记录同一天应递增 usage_count（upsert）', async () => {
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData();
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const usageInput = new RecordSoulUsageInput();
      usageInput.soul_id = addOut.id;

      // 记录 5 次
      for (let i = 0; i < 5; i++) {
        await soulAccess.recordSoulUsage(
          usageInput,
          new SoulContext(),
          new RecordSoulUsageOutput(),
        );
      }

      const soInput = new SoSoulInput();
      soInput.order_by = [
        { field: 'usage_today_count', direction: Direction.DESC },
      ];
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      // 验证使用频率最高为 5（第一个位置）
      const idx = soOut.list.findIndex((s) => s.id === addOut.id);
      expect(idx).toBe(0);
    });

    it('soul_id 不存在的 Soul 也可记录（不校验外键）', async () => {
      const usageInput = new RecordSoulUsageInput();
      usageInput.soul_id = 'non-existent-soul-id';
      const result = await soulAccess.recordSoulUsage(
        usageInput,
        new SoulContext(),
        new RecordSoulUsageOutput(),
      );
      expect(result).toBe(true);
    });

    it('soul_id 为空应抛出 ValidationError', async () => {
      const usageInput = new RecordSoulUsageInput();
      usageInput.soul_id = '';
      await expect(
        soulAccess.recordSoulUsage(
          usageInput,
          new SoulContext(),
          new RecordSoulUsageOutput(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('不同 Soul 的使用记录应独立统计', async () => {
      const out1 = new AddSoulOutput();
      const input1 = new AddSoulInput();
      input1.data = makeSoulData({ soul_brief: 'SoulA' });
      await soulAccess.addSoul(input1, new SoulContext(), out1);

      const out2 = new AddSoulOutput();
      const input2 = new AddSoulInput();
      input2.data = makeSoulData({ soul_brief: 'SoulB' });
      await soulAccess.addSoul(input2, new SoulContext(), out2);

      // SoulA 记录 3 次
      const usageA = new RecordSoulUsageInput();
      usageA.soul_id = out1.id;
      for (let i = 0; i < 3; i++) {
        await soulAccess.recordSoulUsage(
          usageA,
          new SoulContext(),
          new RecordSoulUsageOutput(),
        );
      }

      // SoulB 记录 1 次
      const usageB = new RecordSoulUsageInput();
      usageB.soul_id = out2.id;
      await soulAccess.recordSoulUsage(
        usageB,
        new SoulContext(),
        new RecordSoulUsageOutput(),
      );

      const soInput = new SoSoulInput();
      soInput.order_by = [
        { field: 'usage_today_count', direction: Direction.DESC },
      ];
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);

      const idxA = soOut.list.findIndex((s) => s.id === out1.id);
      const idxB = soOut.list.findIndex((s) => s.id === out2.id);
      expect(idxA).toBeLessThan(idxB); // SoulA (3次) 在 SoulB (1次) 前
    });
  });

  // =========================================================================
  // 集成测试 - 完整使用流程
  // =========================================================================

  describe('集成测试', () => {
    it('完整 CRUD 流程：新增 -> 获取 -> 更新 -> 搜索 -> 删除', async () => {
      // 1. 新增
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData({
        soul_content: '集成测试Soul',
        soul_brief: '集成测试',
      });
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);
      expect(addOut.id).toBeTruthy();

      // 2. 获取
      const getOut = new GetSoulOutput();
      const getInput = new GetSoulInput();
      getInput.id = addOut.id;
      await soulAccess.getSoul(getInput, new SoulContext(), getOut);
      expect(getOut.soul!.soul_content).toBe('集成测试Soul');

      // 3. 更新
      const updateInput = new UpdateSoulInput();
      updateInput.id = addOut.id;
      updateInput.data = { soul_brief: '已更新' };
      const updateOut = new UpdateSoulOutput();
      await soulAccess.updateSoul(updateInput, new SoulContext(), updateOut);
      expect(updateOut.affected_rows).toBe(1);

      // 4. 验证更新
      const getOut2 = new GetSoulOutput();
      const getInput2 = new GetSoulInput();
      getInput2.id = addOut.id;
      await soulAccess.getSoul(getInput2, new SoulContext(), getOut2);
      expect(getOut2.soul!.soul_brief).toBe('已更新');

      // 5. 搜索
      const soOut = new SoSoulOutput();
      await soulAccess.soSoul(new SoSoulInput(), new SoulContext(), soOut);
      expect(soOut.list.some((s) => s.id === addOut.id)).toBe(true);

      // 6. 删除
      const delInput = new DelSoulInput();
      delInput.ids = [addOut.id];
      const delOut = new DelSoulOutput();
      await soulAccess.delSoul(delInput, new SoulContext(), delOut);
      expect(delOut.affected_rows).toBe(1);

      // 7. 确认已删除
      const getOut3 = new GetSoulOutput();
      const getInput3 = new GetSoulInput();
      getInput3.id = addOut.id;
      await soulAccess.getSoul(getInput3, new SoulContext(), getOut3);
      expect(getOut3.soul).toBeNull();
    });

    it('数据隔离：不同测试不应互相干扰', async () => {
      // 新增一个独一无二的 Soul
      const uniqueId = `unique-${Date.now()}`;
      const addOut = new AddSoulOutput();
      const addInput = new AddSoulInput();
      addInput.data = makeSoulData({ soul_brief: uniqueId });
      await soulAccess.addSoul(addInput, new SoulContext(), addOut);

      const soOut = new SoSoulOutput();
      const soInput = new SoSoulInput();
      soInput.conditions = [
        { field: 'soul_brief', operator: Operator.EQ, value: uniqueId },
      ];
      await soulAccess.soSoul(soInput, new SoulContext(), soOut);
      expect(soOut.total).toBe(1);
      expect(soOut.list[0].soul_brief).toBe(uniqueId);
    });
  });
});
