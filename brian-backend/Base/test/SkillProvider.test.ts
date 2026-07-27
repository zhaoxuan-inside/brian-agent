/**
 * @fileoverview SkillProvider 模块测试。
 *
 * 测试范围：
 * - 初始化：initialize / 配置表创建 / 默认配置写入 / enabled 状态恢复
 * - Skill 管理：addSkill / getSkill / updateSkill / delSkill / soSkill
 * - Skill 执行：execSkill（沙箱执行、usage_count 更新）
 * - 可视化与运维：enableSkill（运行时启用/禁用）
 * - AOP 集成：elapsed_ms 填充
 * - 验证与错误场景全覆盖
 * - 数据清理：delSkill 同步清理 skill_usage
 *
 * 所有测试使用真实 SQLite 数据库，通过 RelationDBProvider 访问，
 * 不使用任何 MOCK 数据。
 * 每个测试用例在 temp 目录中创建独立的数据库文件，测试后清理。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { DBContext, CloseDBInput, CloseDBOutput } from '../RelationDBProvider';
import {
  SkillAccess,
  SkillContext,
  AddSkillInput,
  AddSkillOutput,
  GetSkillInput,
  GetSkillOutput,
  UpdateSkillInput,
  UpdateSkillOutput,
  DelSkillInput,
  DelSkillOutput,
  SoSkillInput,
  SoSkillOutput,
  ExecSkillInput,
  ExecSkillOutput,
  EnableSkillInput,
  EnableSkillOutput,
  SKILL_TABLE,
  SKILL_USAGE_TABLE,
  SKILL_CONFIG_TABLE,
} from '../SkillProvider';
import type { SkillData, SkillRecord } from '../SkillProvider';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
} from '../shared/errors';
import { Operator } from '../shared/query';

// ---------------------------------------------------------------------------
// 测试辅助函数
// ---------------------------------------------------------------------------

function makeSkillData(overrides?: Partial<SkillData>): SkillData {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    skill_brief: `测试 Skill ${suffix}`,
    work: `result = "执行成功: ${suffix}"`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('SkillProvider', () => {
  let tempDir: string;
  let sqlitePath: string;
  let relationDb: RelationDBAccess;
  let skillAccess: SkillAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-skill-test-'));
    sqlitePath = path.join(tempDir, 'test.db');

    relationDb = new RelationDBAccess({ dbPath: sqlitePath });
    await relationDb.initialize();

    skillAccess = new SkillAccess(relationDb);
    await skillAccess.initialize();
  });

  afterEach(async () => {
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
  // 初始化与配置
  // =========================================================================

  describe('initialize', () => {
    it('初始化后应创建 skill、skill_usage、skill_config 三张表', async () => {
      const tables = relationDb.queryRaw<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      );

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain(SKILL_TABLE);
      expect(tableNames).toContain(SKILL_USAGE_TABLE);
      expect(tableNames).toContain(SKILL_CONFIG_TABLE);
    });

    it('初始化后应写入默认配置 enabled=true', async () => {
      const rows = relationDb.queryRaw<{ config_key: string; config_value: string }>(
        `SELECT * FROM "${SKILL_CONFIG_TABLE}" WHERE config_key = 'enabled'`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].config_value).toBe('true');
    });

    it('重复初始化应无副作用', async () => {
      await skillAccess.initialize();

      // 验证可正常操作
      const data = makeSkillData();
      const input = new AddSkillInput();
      input.data = data;
      const out = new AddSkillOutput();
      const result = await skillAccess.addSkill(
        input,
        new SkillContext(),
        out,
      );
      expect(result).toBe(true);
    });

    it('初始化时应从 config 恢复 enabled 状态（禁用后保持）', async () => {
      // 先禁用
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      // 重新初始化
      const newAccess = new SkillAccess(relationDb);
      await newAccess.initialize();

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();

      await expect(
        newAccess.addSkill(input, new SkillContext(), out),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('初始化时应从 config 恢复 enabled 状态（启用后保持）', async () => {
      // 先禁用秒启用
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: true }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      // 重新初始化
      const newAccess = new SkillAccess(relationDb);
      await newAccess.initialize();

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();

      const result = await newAccess.addSkill(
        input,
        new SkillContext(),
        out,
      );
      expect(result).toBe(true);
      expect(out.id).toBeTruthy();
    });
  });

  // =========================================================================
  // addSkill - 新增 Skill
  // =========================================================================

  describe('addSkill', () => {
    it('应该成功新增一个 Skill', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData();
      const output = new AddSkillOutput();

      const result = await skillAccess.addSkill(
        input,
        new SkillContext(),
        output,
      );
      expect(result).toBe(true);
      expect(output.id).toBeTruthy();
      expect(typeof output.id).toBe('string');
      expect(output.id.length).toBeGreaterThan(0);
    });

    it('新增后应可通过 getSkill 查到', async () => {
      const data = makeSkillData({ skill_brief: '天气查询' });
      const input = new AddSkillInput();
      input.data = data;
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);

      expect(getOut.skill).toBeTruthy();
      expect(getOut.skill!.skill_brief).toBe('天气查询');
      expect(getOut.skill!.work).toBe(data.work);
    });

    it('enable 应默认为 true', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);

      expect(getOut.skill!.enable).toBe(true);
    });

    it('新增时指定 enable: false 应保存为禁用状态', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({ enable: false });
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);

      expect(getOut.skill!.enable).toBe(false);
    });

    it('应支持所有可选字段（scripts/references/assets）', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({
        scripts: '/data/skills/test/scripts',
        references: '/data/skills/test/references',
        assets: '/data/skills/test/assets',
      });
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);

      expect(getOut.skill!.scripts).toBe('/data/skills/test/scripts');
      expect(getOut.skill!.references).toBe('/data/skills/test/references');
      expect(getOut.skill!.assets).toBe('/data/skills/test/assets');
    });

    it('每个 Skill 的 ID 应唯一', async () => {
      const ids = new Set<string>();

      for (let i = 0; i < 10; i++) {
        const input = new AddSkillInput();
        input.data = makeSkillData();
        const out = new AddSkillOutput();
        await skillAccess.addSkill(input, new SkillContext(), out);

        expect(ids.has(out.id)).toBe(false);
        ids.add(out.id);
      }
      expect(ids.size).toBe(10);
    });

    it('created 和 updated 应为非零时间戳', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);

      expect(getOut.skill!.created).toBeGreaterThan(0);
      expect(getOut.skill!.updated).toBeGreaterThan(0);
      expect(getOut.skill!.created).toBe(getOut.skill!.updated);
    });

    it('skill_brief 为空应抛出 ValidationError', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({ skill_brief: '' });
      const out = new AddSkillOutput();

      await expect(
        skillAccess.addSkill(input, new SkillContext(), out),
      ).rejects.toThrow(ValidationError);
    });

    it('work 为空应抛出 ValidationError', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({ work: '' });
      const out = new AddSkillOutput();

      await expect(
        skillAccess.addSkill(input, new SkillContext(), out),
      ).rejects.toThrow(ValidationError);
    });

    it('组件禁用后 addSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();

      await expect(
        skillAccess.addSkill(input, new SkillContext(), out),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // =========================================================================
  // getSkill - 获取 Skill
  // =========================================================================

  describe('getSkill', () => {
    let skillId: string;
    let skillData: SkillData;

    beforeEach(async () => {
      skillData = makeSkillData({ skill_brief: '待查询 Skill' });
      const input = new AddSkillInput();
      input.data = skillData;
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);
      skillId = out.id;
    });

    it('应通过 ID 获取 Skill', async () => {
      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      const result = await skillAccess.getSkill(
        getInput,
        new SkillContext(),
        getOut,
      );

      expect(result).toBe(true);
      expect(getOut.skill).toBeTruthy();
      expect(getOut.skill!.id).toBe(skillId);
      expect(getOut.skill!.skill_brief).toBe('待查询 Skill');
    });

    it('应通过 conditions 获取 Skill', async () => {
      const getInput = new GetSkillInput();
      getInput.conditions = [
        { field: 'skill_brief', operator: Operator.EQ, value: '待查询 Skill' },
      ];
      const getOut = new GetSkillOutput();
      const result = await skillAccess.getSkill(
        getInput,
        new SkillContext(),
        getOut,
      );

      expect(result).toBe(true);
      expect(getOut.skill).toBeTruthy();
      expect(getOut.skill!.skill_brief).toBe('待查询 Skill');
    });

    it('ID 不存在时应返回 null 而非抛错', async () => {
      const getInput = new GetSkillInput();
      getInput.id = 'non-existent-id';
      const getOut = new GetSkillOutput();
      const result = await skillAccess.getSkill(
        getInput,
        new SkillContext(),
        getOut,
      );

      expect(result).toBe(true);
      expect(getOut.skill).toBeNull();
    });

    it('conditions 不匹配时应返回 null', async () => {
      const getInput = new GetSkillInput();
      getInput.conditions = [
        { field: 'skill_brief', operator: Operator.EQ, value: '不存在的 Skill' },
      ];
      const getOut = new GetSkillOutput();
      const result = await skillAccess.getSkill(
        getInput,
        new SkillContext(),
        getOut,
      );

      expect(result).toBe(true);
      expect(getOut.skill).toBeNull();
    });

    it('id 与 conditions 均未传时抛出 ValidationError', async () => {
      const getInput = new GetSkillInput();
      const getOut = new GetSkillOutput();

      await expect(
        skillAccess.getSkill(getInput, new SkillContext(), getOut),
      ).rejects.toThrow(ValidationError);
    });

    it('组件禁用后 getSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();

      await expect(
        skillAccess.getSkill(getInput, new SkillContext(), getOut),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // =========================================================================
  // soSkill - 搜索 Skill
  // =========================================================================

  describe('soSkill', () => {
    beforeEach(async () => {
      const skills = [
        { skill_brief: '天气查询', work: 'result = params.city' },
        { skill_brief: '翻译服务', work: 'result = params.text' },
        { skill_brief: '代码生成', work: 'result = params.prompt' },
        { skill_brief: '天气分析', work: 'result = params.data' },
        { skill_brief: '邮件发送', work: 'result = "done"' },
      ];

      for (const s of skills) {
        const input = new AddSkillInput();
        input.data = s;
        const out = new AddSkillOutput();
        await skillAccess.addSkill(input, new SkillContext(), out);
      }
    });

    it('应返回所有 Skill（无条件时）', async () => {
      const input = new SoSkillInput();
      const out = new SoSkillOutput();
      const result = await skillAccess.soSkill(input, new SkillContext(), out);

      expect(result).toBe(true);
      expect(out.list.length).toBe(5);
      expect(out.total).toBe(5);
    });

    it('keyword 应对 skill_brief 模糊匹配', async () => {
      const input = new SoSkillInput();
      input.keyword = '天气';
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, new SkillContext(), out);

      expect(out.list.length).toBe(2);
      expect(out.total).toBe(2);
      const briefs = out.list.map((s) => s.skill_brief);
      expect(briefs).toContain('天气查询');
      expect(briefs).toContain('天气分析');
    });

    it('keyword 不匹配应返回空列表', async () => {
      const input = new SoSkillInput();
      input.keyword = '不存在的关键词';
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, new SkillContext(), out);

      expect(out.list).toEqual([]);
      expect(out.total).toBe(0);
    });

    it('应支持 conditions 条件过滤', async () => {
      const input = new SoSkillInput();
      input.conditions = [
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ];
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, new SkillContext(), out);

      expect(out.list.length).toBe(5);
      expect(out.total).toBe(5);
    });

    it('应支持 order_by 排序（按 created 升序）', async () => {
      const input = new SoSkillInput();
      input.order_by = [{ field: 'created', direction: 'ASC' }];
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, new SkillContext(), out);

      expect(out.list.length).toBe(5);
      // 验证升序：created 依次递增
      for (let i = 1; i < out.list.length; i++) {
        expect(out.list[i].created).toBeGreaterThanOrEqual(
          out.list[i - 1].created,
        );
      }
    });

    it('应支持 order_by 排序（按 created 降序）', async () => {
      const input = new SoSkillInput();
      input.order_by = [{ field: 'created', direction: 'DESC' }];
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, new SkillContext(), out);

      expect(out.list.length).toBe(5);
      for (let i = 1; i < out.list.length; i++) {
        expect(out.list[i].created).toBeLessThanOrEqual(
          out.list[i - 1].created,
        );
      }
    });

    it('应支持分页 page', async () => {
      const input = new SoSkillInput();
      input.page = { current: 1, size: 2 };
      input.order_by = [{ field: 'created', direction: 'ASC' }];
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, new SkillContext(), out);

      expect(out.list.length).toBe(2);
      expect(out.total).toBe(5);
    });

    it('分页第二页应返回正确数据', async () => {
      // 先按 created 排序获取全部
      const allInput = new SoSkillInput();
      allInput.order_by = [{ field: 'created', direction: 'ASC' }];
      const allOut = new SoSkillOutput();
      await skillAccess.soSkill(allInput, new SkillContext(), allOut);
      const allIds = allOut.list.map((s) => s.id);

      // 分页获取
      const input = new SoSkillInput();
      input.page = { current: 3, size: 2 };
      input.order_by = [{ field: 'created', direction: 'ASC' }];
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, new SkillContext(), out);

      expect(out.list.length).toBe(1); // 第3页只有1条(总数5, 每页2)
      expect(out.total).toBe(5);
      expect(out.list[0].id).toBe(allIds[4]); // 第5条
    });

    it('keyword + conditions + order_by + page 应同时生效', async () => {
      const input = new SoSkillInput();
      input.keyword = '气';
      input.conditions = [{ field: 'enable', operator: Operator.EQ, value: 1 }];
      input.order_by = [{ field: 'created', direction: 'ASC' }];
      input.page = { current: 1, size: 10 };
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, new SkillContext(), out);

      expect(out.list.length).toBeGreaterThanOrEqual(2);
      expect(out.total).toBeGreaterThanOrEqual(2);
    });

    it('空表搜索应返回空列表', async () => {
      // 清空所有 skill
      const allInput = new SoSkillInput();
      const allOut = new SoSkillOutput();
      await skillAccess.soSkill(allInput, new SkillContext(), allOut);

      const delInput = new DelSkillInput();
      delInput.ids = allOut.list.map((s) => s.id);
      await skillAccess.delSkill(
        delInput,
        new SkillContext(),
        new DelSkillOutput(),
      );

      const input = new SoSkillInput();
      input.keyword = '任何';
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, new SkillContext(), out);

      expect(out.list).toEqual([]);
      expect(out.total).toBe(0);
    });

    it('组件禁用后 soSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const input = new SoSkillInput();
      const out = new SoSkillOutput();

      await expect(
        skillAccess.soSkill(input, new SkillContext(), out),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // =========================================================================
  // updateSkill - 更新 Skill
  // =========================================================================

  describe('updateSkill', () => {
    let skillId: string;

    beforeEach(async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({ skill_brief: '原始 Skill' });
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);
      skillId = out.id;
    });

    it('应通过 ID 更新 skill_brief', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = { skill_brief: '更新后的 Skill' };
      const updateOut = new UpdateSkillOutput();
      const result = await skillAccess.updateSkill(
        updateInput,
        new SkillContext(),
        updateOut,
      );

      expect(result).toBe(true);
      expect(updateOut.affected_rows).toBe(1);

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);
      expect(getOut.skill!.skill_brief).toBe('更新后的 Skill');
    });

    it('更新后 updated 字段应变更', async () => {
      const getBefore = new GetSkillInput();
      getBefore.id = skillId;
      const getBeforeOut = new GetSkillOutput();
      await skillAccess.getSkill(getBefore, new SkillContext(), getBeforeOut);
      const beforeUpdated = getBeforeOut.skill!.updated;

      // 等待 10ms 确保时间戳不同
      await new Promise((r) => setTimeout(r, 10));

      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = { skill_brief: '再次更新' };
      await skillAccess.updateSkill(
        updateInput,
        new SkillContext(),
        new UpdateSkillOutput(),
      );

      const getAfter = new GetSkillInput();
      getAfter.id = skillId;
      const getAfterOut = new GetSkillOutput();
      await skillAccess.getSkill(getAfter, new SkillContext(), getAfterOut);
      expect(getAfterOut.skill!.updated).toBeGreaterThan(beforeUpdated);
    });

    it('应通过 conditions 更新', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.conditions = [
        { field: 'skill_brief', operator: Operator.EQ, value: '原始 Skill' },
      ];
      updateInput.data = { work: 'result = "new work"' };
      const updateOut = new UpdateSkillOutput();
      const result = await skillAccess.updateSkill(
        updateInput,
        new SkillContext(),
        updateOut,
      );

      expect(result).toBe(true);
      expect(updateOut.affected_rows).toBe(1);
    });

    it('应能更新 enable 字段（资源级禁用）', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = { enable: false };
      const updateOut = new UpdateSkillOutput();
      await skillAccess.updateSkill(
        updateInput,
        new SkillContext(),
        updateOut,
      );

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);
      expect(getOut.skill!.enable).toBe(false);
    });

    it('应能重新启用已禁用的 Skill', async () => {
      // 先禁用
      const updateInput1 = new UpdateSkillInput();
      updateInput1.id = skillId;
      updateInput1.data = { enable: false };
      await skillAccess.updateSkill(
        updateInput1,
        new SkillContext(),
        new UpdateSkillOutput(),
      );

      // 再启用
      const updateInput2 = new UpdateSkillInput();
      updateInput2.id = skillId;
      updateInput2.data = { enable: true };
      await skillAccess.updateSkill(
        updateInput2,
        new SkillContext(),
        new UpdateSkillOutput(),
      );

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);
      expect(getOut.skill!.enable).toBe(true);
    });

    it('应支持更新 scripts/references/assets 字段', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = {
        scripts: '/new/scripts',
        references: '/new/references',
        assets: '/new/assets',
      };
      await skillAccess.updateSkill(
        updateInput,
        new SkillContext(),
        new UpdateSkillOutput(),
      );

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);
      expect(getOut.skill!.scripts).toBe('/new/scripts');
      expect(getOut.skill!.references).toBe('/new/references');
      expect(getOut.skill!.assets).toBe('/new/assets');
    });

    it('不存在的 ID 应返回 affected_rows=0（不抛错）', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.id = 'non-existent-id';
      updateInput.data = { skill_brief: '不存在' };
      const updateOut = new UpdateSkillOutput();
      const result = await skillAccess.updateSkill(
        updateInput,
        new SkillContext(),
        updateOut,
      );

      expect(result).toBe(true);
      expect(updateOut.affected_rows).toBe(0);
    });

    it('id 与 conditions 均未传时抛出 ValidationError', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.data = { skill_brief: '不指定任何条件' };
      const updateOut = new UpdateSkillOutput();

      await expect(
        skillAccess.updateSkill(updateInput, new SkillContext(), updateOut),
      ).rejects.toThrow(ValidationError);
    });

    it('组件禁用后 updateSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = { skill_brief: '禁用时更新' };
      const updateOut = new UpdateSkillOutput();

      await expect(
        skillAccess.updateSkill(updateInput, new SkillContext(), updateOut),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // =========================================================================
  // execSkill - 执行 Skill
  // =========================================================================

  describe('execSkill', () => {
    let skillId: string;

    beforeEach(async () => {
      const data = makeSkillData({
        skill_brief: '加法运算',
        work: 'result = Number(params.a) + Number(params.b)',
      });
      const input = new AddSkillInput();
      input.data = data;
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);
      skillId = out.id;
    });

    it('应在沙箱中执行 Skill 并返回 result', async () => {
      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 3, b: 5 };
      const execOut = new ExecSkillOutput();
      const result = await skillAccess.execSkill(
        execInput,
        new SkillContext(),
        execOut,
      );

      expect(result).toBe(true);
      expect(execOut.result).toBe(8);
    });

    it('应支持字符串处理', async () => {
      const data = makeSkillData({
        skill_brief: '字符串拼接',
        work: 'result = "Hello, " + params.name + "!"',
      });
      const addInput = new AddSkillInput();
      addInput.data = data;
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, new SkillContext(), addOut);

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = { name: 'Brian' };
      const execOut = new ExecSkillOutput();
      await skillAccess.execSkill(execInput, new SkillContext(), execOut);

      expect(execOut.result).toBe('Hello, Brian!');
    });

    it('应支持复杂表达式', async () => {
      const data = makeSkillData({
        skill_brief: '复杂计算',
        work: 'result = params.items.reduce((sum, n) => sum + n, 0)',
      });
      const addInput = new AddSkillInput();
      addInput.data = data;
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, new SkillContext(), addOut);

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = { items: [1, 2, 3, 4, 5] };
      const execOut = new ExecSkillOutput();
      await skillAccess.execSkill(execInput, new SkillContext(), execOut);

      expect(execOut.result).toBe(15);
    });

    it('应支持字符串模板拼接', async () => {
      const data = makeSkillData({
        skill_brief: '天气查询',
        work: 'result = `城市 ${params.city} 今天天气 ${params.weather}`',
      });
      const addInput = new AddSkillInput();
      addInput.data = data;
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, new SkillContext(), addOut);

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = { city: '北京', weather: '晴' };
      const execOut = new ExecSkillOutput();
      await skillAccess.execSkill(execInput, new SkillContext(), execOut);

      expect(execOut.result).toBe('城市 北京 今天天气 晴');
    });

    it('console.log 应为空实现（不抛错）', async () => {
      const data = makeSkillData({
        skill_brief: '带日志的 Skill',
        work: 'console.log("不应输出"); result = "done"',
      });
      const addInput = new AddSkillInput();
      addInput.data = data;
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, new SkillContext(), addOut);

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = {};
      const execOut = new ExecSkillOutput();
      const result = await skillAccess.execSkill(
        execInput,
        new SkillContext(),
        execOut,
      );

      expect(result).toBe(true);
      expect(execOut.result).toBe('done');
    });

    it('执行成功后应更新 skill_usage 表', async () => {
      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 1, b: 2 };
      await skillAccess.execSkill(
        execInput,
        new SkillContext(),
        new ExecSkillOutput(),
      );

      // 查询 usage 表
      const usageRows = relationDb.queryRaw<{
        skill_id: string;
        usage_count: number;
        usage_date: string;
      }>(`SELECT * FROM "${SKILL_USAGE_TABLE}" WHERE skill_id = ?`, [skillId]);

      expect(usageRows.length).toBe(1);
      expect(usageRows[0].usage_count).toBe(1);
      expect(usageRows[0].skill_id).toBe(skillId);
    });

    it('多次执行应累加 usage_count', async () => {
      for (let i = 0; i < 3; i++) {
        const execInput = new ExecSkillInput();
        execInput.id = skillId;
        execInput.params = { a: i, b: i + 1 };
        await skillAccess.execSkill(
          execInput,
          new SkillContext(),
          new ExecSkillOutput(),
        );
      }

      const usageRows = relationDb.queryRaw<{ usage_count: number }>(
        `SELECT * FROM "${SKILL_USAGE_TABLE}" WHERE skill_id = ?`,
        [skillId],
      );
      expect(usageRows.length).toBe(1);
      expect(usageRows[0].usage_count).toBe(3);
    });

    it('不同 Skill 应有各自的 usage 记录', async () => {
      const data2 = makeSkillData({ skill_brief: '另一个 Skill' });
      const addInput2 = new AddSkillInput();
      addInput2.data = data2;
      const addOut2 = new AddSkillOutput();
      await skillAccess.addSkill(addInput2, new SkillContext(), addOut2);

      // 执行两个 Skill 各 2 次
      for (let i = 0; i < 2; i++) {
        const execInput1 = new ExecSkillInput();
        execInput1.id = skillId;
        execInput1.params = { a: 1, b: 2 };
        await skillAccess.execSkill(execInput1, new SkillContext(), new ExecSkillOutput());

        const execInput2 = new ExecSkillInput();
        execInput2.id = addOut2.id;
        execInput2.params = {};
        await skillAccess.execSkill(execInput2, new SkillContext(), new ExecSkillOutput());
      }

      const usageRows1 = relationDb.queryRaw<{ usage_count: number }>(
        `SELECT * FROM "${SKILL_USAGE_TABLE}" WHERE skill_id = ?`,
        [skillId],
      );
      const usageRows2 = relationDb.queryRaw<{ usage_count: number }>(
        `SELECT * FROM "${SKILL_USAGE_TABLE}" WHERE skill_id = ?`,
        [addOut2.id],
      );

      expect(usageRows1[0].usage_count).toBe(2);
      expect(usageRows2[0].usage_count).toBe(2);
    });

    it('Skill 不存在应抛出 NotFoundError', async () => {
      const execInput = new ExecSkillInput();
      execInput.id = 'non-existent-id';
      execInput.params = { x: 1 };
      const execOut = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput, new SkillContext(), execOut),
      ).rejects.toThrow(NotFoundError);
    });

    it('资源级已禁用的 Skill 执行应抛出 ValidationError', async () => {
      // 先禁用该 Skill
      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = { enable: false };
      await skillAccess.updateSkill(
        updateInput,
        new SkillContext(),
        new UpdateSkillOutput(),
      );

      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 1, b: 2 };
      const execOut = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput, new SkillContext(), execOut),
      ).rejects.toThrow(ValidationError);
    });

    it('id 为空应抛出 ValidationError', async () => {
      const execInput = new ExecSkillInput();
      execInput.id = '';
      execInput.params = { a: 1, b: 2 };
      const execOut = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput, new SkillContext(), execOut),
      ).rejects.toThrow(ValidationError);
    });

    it('params 为 null/undefined 应抛出 ValidationError', async () => {
      const execInput1 = new ExecSkillInput();
      execInput1.id = skillId;
      // params 未赋值
      const execOut1 = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput1, new SkillContext(), execOut1),
      ).rejects.toThrow(ValidationError);

      const execInput2 = new ExecSkillInput();
      execInput2.id = skillId;
      execInput2.params = null as unknown as Record<string, unknown>;
      const execOut2 = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput2, new SkillContext(), execOut2),
      ).rejects.toThrow(ValidationError);
    });

    it('组件级禁用后 execSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 1, b: 2 };
      const execOut = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput, new SkillContext(), execOut),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('超时脚本应被终止', async () => {
      const data = makeSkillData({
        skill_brief: '无限循环',
        work: 'while (true) {}; result = "done"',
      });
      const addInput = new AddSkillInput();
      addInput.data = data;
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, new SkillContext(), addOut);

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = {};
      const execOut = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput, new SkillContext(), execOut),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // delSkill - 删除 Skill
  // =========================================================================

  describe('delSkill', () => {
    let skillId: string;
    let skillIds: string[];

    beforeEach(async () => {
      skillIds = [];
      for (let i = 0; i < 3; i++) {
        const input = new AddSkillInput();
        input.data = makeSkillData({ skill_brief: `待删除 Skill ${i}` });
        const out = new AddSkillOutput();
        await skillAccess.addSkill(input, new SkillContext(), out);
        skillIds.push(out.id);
      }
      skillId = skillIds[0];
    });

    it('应通过 ID 删除单个 Skill', async () => {
      const delInput = new DelSkillInput();
      delInput.ids = [skillId];
      const delOut = new DelSkillOutput();
      const result = await skillAccess.delSkill(
        delInput,
        new SkillContext(),
        delOut,
      );

      expect(result).toBe(true);
      expect(delOut.affected_rows).toBe(1);

      // 验证已删除
      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);
      expect(getOut.skill).toBeNull();
    });

    it('应支持批量删除', async () => {
      const delInput = new DelSkillInput();
      delInput.ids = skillIds;
      const delOut = new DelSkillOutput();
      const result = await skillAccess.delSkill(
        delInput,
        new SkillContext(),
        delOut,
      );

      expect(result).toBe(true);
      expect(delOut.affected_rows).toBe(3);

      // 验证全部删除
      const soInput = new SoSkillInput();
      const soOut = new SoSkillOutput();
      await skillAccess.soSkill(soInput, new SkillContext(), soOut);
      expect(soOut.list.length).toBe(0);
    });

    it('应通过 conditions 删除', async () => {
      const delInput = new DelSkillInput();
      delInput.conditions = [
        { field: 'skill_brief', operator: Operator.LIKE, value: '%待删除%' },
      ];
      const delOut = new DelSkillOutput();
      const result = await skillAccess.delSkill(
        delInput,
        new SkillContext(),
        delOut,
      );

      expect(result).toBe(true);
      expect(delOut.affected_rows).toBe(3);
    });

    it('删除 Skill 后应同步清理 skill_usage 记录（按 ID 删除）', async () => {
      // 先执行 Skill 产生 usage 记录
      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 1, b: 2 };
      await skillAccess.execSkill(
        execInput,
        new SkillContext(),
        new ExecSkillOutput(),
      );

      // 确认有 usage 记录
      const beforeUsage = relationDb.queryRaw<{ id: string }>(
        `SELECT * FROM "${SKILL_USAGE_TABLE}" WHERE skill_id = ?`,
        [skillId],
      );
      expect(beforeUsage.length).toBe(1);

      // 删除 Skill
      await skillAccess.delSkill(
        Object.assign(new DelSkillInput(), { ids: [skillId] }),
        new SkillContext(),
        new DelSkillOutput(),
      );

      // 验证 usage 也被清理
      const afterUsage = relationDb.queryRaw<{ id: string }>(
        `SELECT * FROM "${SKILL_USAGE_TABLE}" WHERE skill_id = ?`,
        [skillId],
      );
      expect(afterUsage.length).toBe(0);
    });

    it('删除 Skill 后应同步清理 skill_usage 记录（按 conditions 删除）', async () => {
      // 先执行 Skill 产生 usage 记录
      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 1, b: 2 };
      await skillAccess.execSkill(
        execInput,
        new SkillContext(),
        new ExecSkillOutput(),
      );

      // 通过 conditions 删除
      await skillAccess.delSkill(
        Object.assign(new DelSkillInput(), {
          conditions: [{ field: 'id', operator: Operator.EQ, value: skillId }],
        }),
        new SkillContext(),
        new DelSkillOutput(),
      );

      // 验证 usage 也被清理
      const afterUsage = relationDb.queryRaw<{ id: string }>(
        `SELECT * FROM "${SKILL_USAGE_TABLE}" WHERE skill_id = ?`,
        [skillId],
      );
      expect(afterUsage.length).toBe(0);
    });

    it('不存在的 ID 应返回 affected_rows=0', async () => {
      const delInput = new DelSkillInput();
      delInput.ids = ['non-existent-id'];
      const delOut = new DelSkillOutput();
      const result = await skillAccess.delSkill(
        delInput,
        new SkillContext(),
        delOut,
      );

      expect(result).toBe(true);
      expect(delOut.affected_rows).toBe(0);
    });

    it('ids 与 conditions 均未传时抛出 ValidationError', async () => {
      const delInput = new DelSkillInput();
      const delOut = new DelSkillOutput();

      await expect(
        skillAccess.delSkill(delInput, new SkillContext(), delOut),
      ).rejects.toThrow(ValidationError);
    });

    it('组件禁用后 delSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const delInput = new DelSkillInput();
      delInput.ids = [skillId];
      const delOut = new DelSkillOutput();

      await expect(
        skillAccess.delSkill(delInput, new SkillContext(), delOut),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // =========================================================================
  // enableSkill - 启用/禁用组件
  // =========================================================================

  describe('enableSkill', () => {
    it('禁用后所有操作应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();

      await expect(
        skillAccess.addSkill(input, new SkillContext(), out),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('禁用后再启用应恢复正常', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: true }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      const result = await skillAccess.addSkill(
        input,
        new SkillContext(),
        out,
      );

      expect(result).toBe(true);
      expect(out.id).toBeTruthy();
    });

    it('enable 状态应持久化到 skill_config', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const rows = relationDb.queryRaw<{ config_value: string }>(
        `SELECT * FROM "${SKILL_CONFIG_TABLE}" WHERE config_key = 'enabled'`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].config_value).toBe('false');

      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: true }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const rows2 = relationDb.queryRaw<{ config_value: string }>(
        `SELECT * FROM "${SKILL_CONFIG_TABLE}" WHERE config_key = 'enabled'`,
      );
      expect(rows2[0].config_value).toBe('true');
    });

    it('重复启用应无副作用', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: true }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      const result = await skillAccess.addSkill(
        input,
        new SkillContext(),
        out,
      );
      expect(result).toBe(true);
    });

    it('重复禁用应无副作用', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new SkillContext(),
        new EnableSkillOutput(),
      );

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      await expect(
        skillAccess.addSkill(input, new SkillContext(), out),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // =========================================================================
  // AOP 集成
  // =========================================================================

  describe('AOP 集成', () => {
    it('elapsed_ms 应在执行后被填充', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);

      expect(out.elapsed_ms).toBeDefined();
      expect(out.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });

    it('getSkill 应填充 elapsed_ms', async () => {
      // 先新增
      const addInput = new AddSkillInput();
      addInput.data = makeSkillData();
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, new SkillContext(), addOut);

      const getInput = new GetSkillInput();
      getInput.id = addOut.id;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);

      expect(getOut.elapsed_ms).toBeDefined();
      expect(getOut.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });

    it('soSkill 应填充 elapsed_ms', async () => {
      const input = new SoSkillInput();
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, new SkillContext(), out);

      expect(out.elapsed_ms).toBeDefined();
      expect(out.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });

    it('updateSkill 应填充 elapsed_ms', async () => {
      // 先新增
      const addInput = new AddSkillInput();
      addInput.data = makeSkillData();
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, new SkillContext(), addOut);

      const updateInput = new UpdateSkillInput();
      updateInput.id = addOut.id;
      updateInput.data = { skill_brief: 'AOP 测试' };
      const updateOut = new UpdateSkillOutput();
      await skillAccess.updateSkill(
        updateInput,
        new SkillContext(),
        updateOut,
      );

      expect(updateOut.elapsed_ms).toBeDefined();
      expect(updateOut.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });

    it('delSkill 应填充 elapsed_ms', async () => {
      const addInput = new AddSkillInput();
      addInput.data = makeSkillData();
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, new SkillContext(), addOut);

      const delInput = new DelSkillInput();
      delInput.ids = [addOut.id];
      const delOut = new DelSkillOutput();
      await skillAccess.delSkill(delInput, new SkillContext(), delOut);

      expect(delOut.elapsed_ms).toBeDefined();
      expect(delOut.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });

    it('execSkill 应填充 elapsed_ms', async () => {
      const addInput = new AddSkillInput();
      addInput.data = makeSkillData();
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, new SkillContext(), addOut);

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = { a: 1, b: 2 };
      const execOut = new ExecSkillOutput();
      await skillAccess.execSkill(execInput, new SkillContext(), execOut);

      expect(execOut.elapsed_ms).toBeDefined();
      expect(execOut.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // 数据完整性
  // =========================================================================

  describe('数据完整性', () => {
    it('SkillRecord 应包含完整的系统字段', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({ skill_brief: '完整性测试' });
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);

      const skill = getOut.skill!;
      expect(skill.id).toBeTruthy();
      expect(typeof skill.created).toBe('number');
      expect(typeof skill.updated).toBe('number');
      expect(skill.created).toBeGreaterThan(0);
      expect(skill.updated).toBeGreaterThan(0);
      expect(typeof skill.skill_brief).toBe('string');
      expect(typeof skill.work).toBe('string');
      expect(typeof skill.enable).toBe('boolean');
    });

    it('scripts/references/assets 未传时应为 undefined', async () => {
      const input = new AddSkillInput();
      input.data = { skill_brief: '最小值测试', work: 'result = 1' };
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, new SkillContext(), out);

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.getSkill(getInput, new SkillContext(), getOut);

      expect(getOut.skill!.scripts).toBeUndefined();
      expect(getOut.skill!.references).toBeUndefined();
      expect(getOut.skill!.assets).toBeUndefined();
    });
  });
});
