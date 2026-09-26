import { Metrics } from '../shared/base/Metrics';
import { Report } from '../shared/base/Report';
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

function makeSkillData(overrides?: Partial<SkillData>): SkillData {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    name: `Skill-${suffix}`.slice(0, 10),
    skill_brief: `测试 Skill ${suffix}`,
    skill_md: `# 测试 Skill ${suffix}\n\n## 操作\nresult = "执行成功: ${suffix}";`,
    scripts: [{ name: 'test.js', content: `result = "执行成功: ${suffix}";` }],
    ...overrides,
  };
}

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
        new CloseDBOutput(), new DBContext(),
      );
    } catch {

    }
    await new Promise((r) => setTimeout(r, 100));

    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {

      }
    }
  });

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

    it('重复初始化应无副作用', async () => {
      await skillAccess.initialize();

      const data = makeSkillData();
      const input = new AddSkillInput();
      input.data = data;
      const out = new AddSkillOutput();
      const result = await skillAccess.addSkill(
        input,
        out, new SkillContext(),
      );
      expect(result).toBe(true);
    });

    it('初始化时应从 config 恢复 enabled 状态（禁用后保持）', async () => {

      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const newAccess = new SkillAccess(relationDb);
      await newAccess.initialize();

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();

      await expect(
        newAccess.addSkill(input, out, new SkillContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('初始化时应从 config 恢复 enabled 状态（启用后保持）', async () => {

      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: true }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const newAccess = new SkillAccess(relationDb);
      await newAccess.initialize();

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();

      const result = await newAccess.addSkill(
        input,
        out, new SkillContext(),
      );
      expect(result).toBe(true);
      expect(out.id).toBeTruthy();
    });
  });

  describe('addSkill', () => {
    it('应该成功新增一个 Skill', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData();
      const output = new AddSkillOutput();

      const result = await skillAccess.addSkill(
        input,
        output, new SkillContext(),
      );
      expect(result).toBe(true);
      expect(output.id).toBeTruthy();
      expect(typeof output.id).toBe('string');
      expect(output.id.length).toBeGreaterThan(0);
    });

    it('新增后应可通过 soSkillById 查到', async () => {
      const data = makeSkillData({ skill_brief: '天气查询' });
      const input = new AddSkillInput();
      input.data = data;
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());

      expect(getOut.skill).toBeTruthy();
      expect(getOut.skill!.skill_brief).toBe('天气查询');
      expect(getOut.skill!.skill_md).toBe(data.skill_md);
    });

    it('enable 应默认为 true', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());

      expect(getOut.skill!.enable).toBe(true);
    });

    it('新增时指定 enable: false 应保存为禁用状态', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({ enable: false });
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());

      expect(getOut.skill!.enable).toBe(false);
    });

    it('应支持所有可选字段（scripts/references/assets）', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({
        scripts: [{ name: 'test.sh', content: 'echo test' }],
        references: [{ name: 'doc.md', content: '# doc' }],
        assets: [{ name: 'img.png', content: '...' }],
      });
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());

      expect(getOut.skill!.scripts).toEqual([{ name: 'test.sh', content: 'echo test' }]);
      expect(getOut.skill!.references).toEqual([{ name: 'doc.md', content: '# doc' }]);
      expect(getOut.skill!.assets).toEqual([{ name: 'img.png', content: '...' }]);
    });

    it('每个 Skill 的 ID 应唯一', async () => {
      const ids = new Set<string>();

      for (let i = 0; i < 10; i++) {
        const input = new AddSkillInput();
        input.data = makeSkillData();
        const out = new AddSkillOutput();
        await skillAccess.addSkill(input, out, new SkillContext());

        expect(ids.has(out.id)).toBe(false);
        ids.add(out.id);
      }
      expect(ids.size).toBe(10);
    });

    it('created 和 updated 应为非零时间戳', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());

      expect(getOut.skill!.created).toBeGreaterThan(0);
      expect(getOut.skill!.updated).toBeGreaterThan(0);
      expect(getOut.skill!.created).toBe(getOut.skill!.updated);
    });

    it('skill_brief 为空应抛出 ValidationError', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({ skill_brief: '' });
      const out = new AddSkillOutput();

      await expect(
        skillAccess.addSkill(input, out, new SkillContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('skill_md 为空应抛出 ValidationError', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({ skill_md: '' });
      const out = new AddSkillOutput();

      await expect(
        skillAccess.addSkill(input, out, new SkillContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('组件禁用后 addSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();

      await expect(
        skillAccess.addSkill(input, out, new SkillContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  describe('soSkillById', () => {
    let skillId: string;
    let skillData: SkillData;

    beforeEach(async () => {
      skillData = makeSkillData({ skill_brief: '待查询 Skill' });
      const input = new AddSkillInput();
      input.data = skillData;
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());
      skillId = out.id;
    });

    it('应通过 ID 获取 Skill', async () => {
      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      const result = await skillAccess.soSkillById(
        getInput,
        getOut, new SkillContext(),
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
      const result = await skillAccess.soSkillById(
        getInput,
        getOut, new SkillContext(),
      );

      expect(result).toBe(true);
      expect(getOut.skill).toBeTruthy();
      expect(getOut.skill!.skill_brief).toBe('待查询 Skill');
    });

    it('ID 不存在时应返回 null 而非抛错', async () => {
      const getInput = new GetSkillInput();
      getInput.id = 'non-existent-id';
      const getOut = new GetSkillOutput();
      const result = await skillAccess.soSkillById(
        getInput,
        getOut, new SkillContext(),
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
      const result = await skillAccess.soSkillById(
        getInput,
        getOut, new SkillContext(),
      );

      expect(result).toBe(true);
      expect(getOut.skill).toBeNull();
    });

    it('id 与 conditions 均未传时抛出 ValidationError', async () => {
      const getInput = new GetSkillInput();
      const getOut = new GetSkillOutput();

      await expect(
        skillAccess.soSkillById(getInput, getOut, new SkillContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('组件禁用后 soSkillById 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();

      await expect(
        skillAccess.soSkillById(getInput, getOut, new SkillContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  describe('soSkill', () => {
    beforeEach(async () => {
      const skills = [
        { name: '天气查询', skill_brief: '天气查询', skill_md: '# 天气查询\n\n```js\nresult = params.city;\n```' },
        { name: '翻译服务', skill_brief: '翻译服务', skill_md: '# 翻译服务\n\n```js\nresult = params.text;\n```' },
        { name: '代码生成', skill_brief: '代码生成', skill_md: '# 代码生成\n\n```js\nresult = params.prompt;\n```' },
        { name: '天气分析', skill_brief: '天气分析', skill_md: '# 天气分析\n\n```js\nresult = params.data;\n```' },
        { name: '邮件发送', skill_brief: '邮件发送', skill_md: '# 邮件发送\n\n```js\nresult = "done";\n```' },
      ];

      for (const s of skills) {
        const input = new AddSkillInput();
        input.data = s;
        const out = new AddSkillOutput();
        await skillAccess.addSkill(input, out, new SkillContext());
      }
    });

    it('应返回所有 Skill（无条件时）', async () => {
      const input = new SoSkillInput();
      const out = new SoSkillOutput();
      const result = await skillAccess.soSkill(input, out, new SkillContext());

      expect(result).toBe(true);
      expect(out.list.length).toBe(5);
      expect(out.total).toBe(5);
    });

    it('keyword 应对 skill_brief 模糊匹配', async () => {
      const input = new SoSkillInput();
      input.keyword = '天气';
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, out, new SkillContext());

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
      await skillAccess.soSkill(input, out, new SkillContext());

      expect(out.list).toEqual([]);
      expect(out.total).toBe(0);
    });

    it('应支持 conditions 条件过滤', async () => {
      const input = new SoSkillInput();
      input.conditions = [
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ];
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, out, new SkillContext());

      expect(out.list.length).toBe(5);
      expect(out.total).toBe(5);
    });

    it('应支持 order_by 排序（按 created 升序）', async () => {
      const input = new SoSkillInput();
      input.order_by = [{ field: 'created', direction: 'ASC' }];
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, out, new SkillContext());

      expect(out.list.length).toBe(5);

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
      await skillAccess.soSkill(input, out, new SkillContext());

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
      await skillAccess.soSkill(input, out, new SkillContext());

      expect(out.list.length).toBe(2);
      expect(out.total).toBe(5);
    });

    it('分页第二页应返回正确数据', async () => {

      const allInput = new SoSkillInput();
      allInput.order_by = [{ field: 'created', direction: 'ASC' }];
      const allOut = new SoSkillOutput();
      await skillAccess.soSkill(allInput, allOut, new SkillContext());
      const allIds = allOut.list.map((s) => s.id);

      const input = new SoSkillInput();
      input.page = { current: 3, size: 2 };
      input.order_by = [{ field: 'created', direction: 'ASC' }];
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, out, new SkillContext());

      expect(out.list.length).toBe(1);
      expect(out.total).toBe(5);
      expect(out.list[0].id).toBe(allIds[4]);
    });

    it('keyword + conditions + order_by + page 应同时生效', async () => {
      const input = new SoSkillInput();
      input.keyword = '气';
      input.conditions = [{ field: 'enable', operator: Operator.EQ, value: 1 }];
      input.order_by = [{ field: 'created', direction: 'ASC' }];
      input.page = { current: 1, size: 10 };
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, out, new SkillContext());

      expect(out.list.length).toBeGreaterThanOrEqual(2);
      expect(out.total).toBeGreaterThanOrEqual(2);
    });

    it('空表搜索应返回空列表', async () => {

      const allInput = new SoSkillInput();
      const allOut = new SoSkillOutput();
      await skillAccess.soSkill(allInput, allOut, new SkillContext());

      const delInput = new DelSkillInput();
      delInput.ids = allOut.list.map((s) => s.id);
      await skillAccess.delSkill(
        delInput,
        new DelSkillOutput(), new SkillContext(),
      );

      const input = new SoSkillInput();
      input.keyword = '任何';
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, out, new SkillContext());

      expect(out.list).toEqual([]);
      expect(out.total).toBe(0);
    });

    it('组件禁用后 soSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const input = new SoSkillInput();
      const out = new SoSkillOutput();

      await expect(
        skillAccess.soSkill(input, out, new SkillContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  describe('updateSkill', () => {
    let skillId: string;

    beforeEach(async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({ skill_brief: '原始 Skill' });
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());
      skillId = out.id;
    });

    it('应通过 ID 更新 skill_brief', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = { skill_brief: '更新后的 Skill' };
      const updateOut = new UpdateSkillOutput();
      const result = await skillAccess.updateSkill(
        updateInput,
        updateOut, new SkillContext(),
      );

      expect(result).toBe(true);
      expect(updateOut.affected_rows).toBe(1);

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());
      expect(getOut.skill!.skill_brief).toBe('更新后的 Skill');
    });

    it('更新后 updated 字段应变更', async () => {
      const getBefore = new GetSkillInput();
      getBefore.id = skillId;
      const getBeforeOut = new GetSkillOutput();
      await skillAccess.soSkillById(getBefore, getBeforeOut, new SkillContext());
      const beforeUpdated = getBeforeOut.skill!.updated;

      await new Promise((r) => setTimeout(r, 10));

      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = { skill_brief: '再次更新' };
      await skillAccess.updateSkill(
        updateInput,
        new UpdateSkillOutput(), new SkillContext(),
      );

      const getAfter = new GetSkillInput();
      getAfter.id = skillId;
      const getAfterOut = new GetSkillOutput();
      await skillAccess.soSkillById(getAfter, getAfterOut, new SkillContext());
      expect(getAfterOut.skill!.updated).toBeGreaterThan(beforeUpdated);
    });

    it('应通过 conditions 更新', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.conditions = [
        { field: 'skill_brief', operator: Operator.EQ, value: '原始 Skill' },
      ];
      updateInput.data = { skill_md: 'result = "new skill_md"' };
      const updateOut = new UpdateSkillOutput();
      const result = await skillAccess.updateSkill(
        updateInput,
        updateOut, new SkillContext(),
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
        updateOut, new SkillContext(),
      );

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());
      expect(getOut.skill!.enable).toBe(false);
    });

    it('应能重新启用已禁用的 Skill', async () => {

      const updateInput1 = new UpdateSkillInput();
      updateInput1.id = skillId;
      updateInput1.data = { enable: false };
      await skillAccess.updateSkill(
        updateInput1,
        new UpdateSkillOutput(), new SkillContext(),
      );

      const updateInput2 = new UpdateSkillInput();
      updateInput2.id = skillId;
      updateInput2.data = { enable: true };
      await skillAccess.updateSkill(
        updateInput2,
        new UpdateSkillOutput(), new SkillContext(),
      );

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());
      expect(getOut.skill!.enable).toBe(true);
    });

    it('应支持更新 scripts/references/assets 字段', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = {
        scripts: [{ name: 'new.sh', content: 'new' }],
        references: [{ name: 'new.md', content: 'new' }],
        assets: [{ name: 'new.png', content: 'new' }],
      };
      await skillAccess.updateSkill(
        updateInput,
        new UpdateSkillOutput(), new SkillContext(),
      );

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());
      expect(getOut.skill!.scripts).toEqual([{ name: 'new.sh', content: 'new' }]);
      expect(getOut.skill!.references).toEqual([{ name: 'new.md', content: 'new' }]);
      expect(getOut.skill!.assets).toEqual([{ name: 'new.png', content: 'new' }]);
    });

    it('不存在的 ID 应返回 affected_rows=0（不抛错）', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.id = 'non-existent-id';
      updateInput.data = { skill_brief: '不存在' };
      const updateOut = new UpdateSkillOutput();
      const result = await skillAccess.updateSkill(
        updateInput,
        updateOut, new SkillContext(),
      );

      expect(result).toBe(true);
      expect(updateOut.affected_rows).toBe(0);
    });

    it('id 与 conditions 均未传时抛出 ValidationError', async () => {
      const updateInput = new UpdateSkillInput();
      updateInput.data = { skill_brief: '不指定任何条件' };
      const updateOut = new UpdateSkillOutput();

      await expect(
        skillAccess.updateSkill(updateInput, updateOut, new SkillContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('组件禁用后 updateSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = { skill_brief: '禁用时更新' };
      const updateOut = new UpdateSkillOutput();

      await expect(
        skillAccess.updateSkill(updateInput, updateOut, new SkillContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  describe('execSkill', () => {
    let skillId: string;

    beforeEach(async () => {
      const data = makeSkillData({
        skill_brief: '加法运算',
        skill_md: '# 加法\nresult = Number(params.a) + Number(params.b)',
        scripts: [{ name: 'add.js', content: 'result = Number(params.a) + Number(params.b)' }],
      });
      const input = new AddSkillInput();
      input.data = data;
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());
      skillId = out.id;
    });

    it('应在沙箱中执行 Skill 并返回 result', async () => {
      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 3, b: 5 };
      const execOut = new ExecSkillOutput();
      const result = await skillAccess.execSkill(
        execInput,
        execOut, new SkillContext(),
      );

      expect(result).toBe(true);
      expect(execOut.result).toBe(8);
    });

    it('应支持字符串处理', async () => {
      const data = makeSkillData({
        skill_brief: '字符串拼接',
        skill_md: '# 字符串拼接\nresult = "Hello, " + params.name + "!"',
        scripts: [{ name: 'str.js', content: 'result = "Hello, " + params.name + "!"' }],
      });
      const addInput = new AddSkillInput();
      addInput.data = data;
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, addOut, new SkillContext());

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = { name: 'Brian' };
      const execOut = new ExecSkillOutput();
      await skillAccess.execSkill(execInput, execOut, new SkillContext());

      expect(execOut.result).toBe('Hello, Brian!');
    });

    it('应支持复杂表达式', async () => {
      const data = makeSkillData({
        skill_brief: '复杂计算',
        skill_md: '# 复杂计算\nresult = params.items.reduce((sum, n) => sum + n, 0)',
        scripts: [{ name: 'sum.js', content: 'result = params.items.reduce((sum, n) => sum + n, 0)' }],
      });
      const addInput = new AddSkillInput();
      addInput.data = data;
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, addOut, new SkillContext());

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = { items: [1, 2, 3, 4, 5] };
      const execOut = new ExecSkillOutput();
      await skillAccess.execSkill(execInput, execOut, new SkillContext());

      expect(execOut.result).toBe(15);
    });

    it('应支持字符串模板拼接', async () => {
      const data = makeSkillData({
        skill_brief: '天气查询',
        skill_md: '# 天气查询\nresult = `城市 ${params.city} 今天天气 ${params.weather}`',
        scripts: [{ name: 'tmpl.js', content: 'result = `城市 ${params.city} 今天天气 ${params.weather}`' }],
      });
      const addInput = new AddSkillInput();
      addInput.data = data;
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, addOut, new SkillContext());

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = { city: '北京', weather: '晴' };
      const execOut = new ExecSkillOutput();
      await skillAccess.execSkill(execInput, execOut, new SkillContext());

      expect(execOut.result).toBe('城市 北京 今天天气 晴');
    });

    it('console.log 应为空实现（不抛错）', async () => {
      const data = makeSkillData({
        skill_brief: '带日志的 Skill',
        skill_md: '# 带日志\nconsole.log("不应输出"); result = "done"',
        scripts: [{ name: 'log.js', content: 'console.log("不应输出"); result = "done"' }],
      });
      const addInput = new AddSkillInput();
      addInput.data = data;
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, addOut, new SkillContext());

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = {};
      const execOut = new ExecSkillOutput();
      const result = await skillAccess.execSkill(
        execInput,
        execOut, new SkillContext(),
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
        new ExecSkillOutput(), new SkillContext(),
      );

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
          new ExecSkillOutput(), new SkillContext(),
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
      await skillAccess.addSkill(addInput2, addOut2, new SkillContext());

      for (let i = 0; i < 2; i++) {
        const execInput1 = new ExecSkillInput();
        execInput1.id = skillId;
        execInput1.params = { a: 1, b: 2 };
        await skillAccess.execSkill(execInput1, new ExecSkillOutput(), new SkillContext());

        const execInput2 = new ExecSkillInput();
        execInput2.id = addOut2.id;
        execInput2.params = {};
        await skillAccess.execSkill(execInput2, new ExecSkillOutput(), new SkillContext());
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
        skillAccess.execSkill(execInput, execOut, new SkillContext()),
      ).rejects.toThrow(NotFoundError);
    });

    it('资源级已禁用的 Skill 执行应抛出 ValidationError', async () => {

      const updateInput = new UpdateSkillInput();
      updateInput.id = skillId;
      updateInput.data = { enable: false };
      await skillAccess.updateSkill(
        updateInput,
        new UpdateSkillOutput(), new SkillContext(),
      );

      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 1, b: 2 };
      const execOut = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput, execOut, new SkillContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('id 为空应抛出 ValidationError', async () => {
      const execInput = new ExecSkillInput();
      execInput.id = '';
      execInput.params = { a: 1, b: 2 };
      const execOut = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput, execOut, new SkillContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('params 为 null/undefined 应抛出 ValidationError', async () => {
      const execInput1 = new ExecSkillInput();
      execInput1.id = skillId;

      const execOut1 = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput1, execOut1, new SkillContext()),
      ).rejects.toThrow(ValidationError);

      const execInput2 = new ExecSkillInput();
      execInput2.id = skillId;
      execInput2.params = null as unknown as Record<string, unknown>;
      const execOut2 = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput2, execOut2, new SkillContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('组件级禁用后 execSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 1, b: 2 };
      const execOut = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput, execOut, new SkillContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('超时脚本应被终止', async () => {
      const data = makeSkillData({
        skill_brief: '无限循环',
        skill_md: '# 无限循环\nwhile (true) {}; result = "done"',
        scripts: [{ name: 'loop.js', content: 'while (true) {}; result = "done"' }],
      });
      const addInput = new AddSkillInput();
      addInput.data = data;
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, addOut, new SkillContext());

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = {};
      const execOut = new ExecSkillOutput();

      await expect(
        skillAccess.execSkill(execInput, execOut, new SkillContext()),
      ).rejects.toThrow();
    });
  });

  describe('delSkill', () => {
    let skillId: string;
    let skillIds: string[];

    beforeEach(async () => {
      skillIds = [];
      for (let i = 0; i < 3; i++) {
        const input = new AddSkillInput();
        input.data = makeSkillData({ skill_brief: `待删除 Skill ${i}` });
        const out = new AddSkillOutput();
        await skillAccess.addSkill(input, out, new SkillContext());
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
        delOut, new SkillContext(),
      );

      expect(result).toBe(true);
      expect(delOut.affected_rows).toBe(1);

      const getInput = new GetSkillInput();
      getInput.id = skillId;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());
      expect(getOut.skill).toBeNull();
    });

    it('应支持批量删除', async () => {
      const delInput = new DelSkillInput();
      delInput.ids = skillIds;
      const delOut = new DelSkillOutput();
      const result = await skillAccess.delSkill(
        delInput,
        delOut, new SkillContext(),
      );

      expect(result).toBe(true);
      expect(delOut.affected_rows).toBe(3);

      const soInput = new SoSkillInput();
      const soOut = new SoSkillOutput();
      await skillAccess.soSkill(soInput, soOut, new SkillContext());
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
        delOut, new SkillContext(),
      );

      expect(result).toBe(true);
      expect(delOut.affected_rows).toBe(3);
    });

    it('删除 Skill 后应同步清理 skill_usage 记录（按 ID 删除）', async () => {

      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 1, b: 2 };
      await skillAccess.execSkill(
        execInput,
        new ExecSkillOutput(), new SkillContext(),
      );

      const beforeUsage = relationDb.queryRaw<{ id: string }>(
        `SELECT * FROM "${SKILL_USAGE_TABLE}" WHERE skill_id = ?`,
        [skillId],
      );
      expect(beforeUsage.length).toBe(1);

      await skillAccess.delSkill(
        Object.assign(new DelSkillInput(), { ids: [skillId] }),
        new DelSkillOutput(), new SkillContext(),
      );

      const afterUsage = relationDb.queryRaw<{ id: string }>(
        `SELECT * FROM "${SKILL_USAGE_TABLE}" WHERE skill_id = ?`,
        [skillId],
      );
      expect(afterUsage.length).toBe(0);
    });

    it('删除 Skill 后应同步清理 skill_usage 记录（按 conditions 删除）', async () => {

      const execInput = new ExecSkillInput();
      execInput.id = skillId;
      execInput.params = { a: 1, b: 2 };
      await skillAccess.execSkill(
        execInput,
        new ExecSkillOutput(), new SkillContext(),
      );

      await skillAccess.delSkill(
        Object.assign(new DelSkillInput(), {
          conditions: [{ field: 'id', operator: Operator.EQ, value: skillId }],
        }),
        new DelSkillOutput(), new SkillContext(),
      );

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
        delOut, new SkillContext(),
      );

      expect(result).toBe(true);
      expect(delOut.affected_rows).toBe(0);
    });

    it('ids 与 conditions 均未传时抛出 ValidationError', async () => {
      const delInput = new DelSkillInput();
      const delOut = new DelSkillOutput();

      await expect(
        skillAccess.delSkill(delInput, delOut, new SkillContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('组件禁用后 delSkill 应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const delInput = new DelSkillInput();
      delInput.ids = [skillId];
      const delOut = new DelSkillOutput();

      await expect(
        skillAccess.delSkill(delInput, delOut, new SkillContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  describe('enableSkill', () => {
    it('禁用后所有操作应抛出 ComponentDisabledError', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();

      await expect(
        skillAccess.addSkill(input, out, new SkillContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('禁用后再启用应恢复正常', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: true }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      const result = await skillAccess.addSkill(
        input,
        out, new SkillContext(),
      );

      expect(result).toBe(true);
      expect(out.id).toBeTruthy();
    });

    it('enable 状态应持久化到 skill_config', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const rows = relationDb.queryRaw<{ config_value: string }>(
        `SELECT * FROM "${SKILL_CONFIG_TABLE}" WHERE config_key = 'enabled'`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].config_value).toBe('false');

      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: true }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const rows2 = relationDb.queryRaw<{ config_value: string }>(
        `SELECT * FROM "${SKILL_CONFIG_TABLE}" WHERE config_key = 'enabled'`,
      );
      expect(rows2[0].config_value).toBe('true');
    });

    it('重复启用应无副作用', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: true }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      const result = await skillAccess.addSkill(
        input,
        out, new SkillContext(),
      );
      expect(result).toBe(true);
    });

    it('重复禁用应无副作用', async () => {
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );
      await skillAccess.enableSkill(
        Object.assign(new EnableSkillInput(), { enable: false }),
        new EnableSkillOutput(), new SkillContext(),
      );

      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      await expect(
        skillAccess.addSkill(input, out, new SkillContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  describe('AOP 集成', () => {
    it('elapsed_ms 应在执行后被填充', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData();
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());

      expect(out.elapsed_ms).toBeDefined();
      expect(out.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });

    it('soSkillById 应填充 elapsed_ms', async () => {

      const addInput = new AddSkillInput();
      addInput.data = makeSkillData();
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, addOut, new SkillContext());

      const getInput = new GetSkillInput();
      getInput.id = addOut.id;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());

      expect(getOut.elapsed_ms).toBeDefined();
      expect(getOut.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });

    it('soSkill 应填充 elapsed_ms', async () => {
      const input = new SoSkillInput();
      const out = new SoSkillOutput();
      await skillAccess.soSkill(input, out, new SkillContext());

      expect(out.elapsed_ms).toBeDefined();
      expect(out.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });

    it('updateSkill 应填充 elapsed_ms', async () => {

      const addInput = new AddSkillInput();
      addInput.data = makeSkillData();
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, addOut, new SkillContext());

      const updateInput = new UpdateSkillInput();
      updateInput.id = addOut.id;
      updateInput.data = { skill_brief: 'AOP 测试' };
      const updateOut = new UpdateSkillOutput();
      await skillAccess.updateSkill(
        updateInput,
        updateOut, new SkillContext(),
      );

      expect(updateOut.elapsed_ms).toBeDefined();
      expect(updateOut.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });

    it('delSkill 应填充 elapsed_ms', async () => {
      const addInput = new AddSkillInput();
      addInput.data = makeSkillData();
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, addOut, new SkillContext());

      const delInput = new DelSkillInput();
      delInput.ids = [addOut.id];
      const delOut = new DelSkillOutput();
      await skillAccess.delSkill(delInput, delOut, new SkillContext());

      expect(delOut.elapsed_ms).toBeDefined();
      expect(delOut.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });

    it('execSkill 应填充 elapsed_ms', async () => {
      const addInput = new AddSkillInput();
      addInput.data = makeSkillData();
      const addOut = new AddSkillOutput();
      await skillAccess.addSkill(addInput, addOut, new SkillContext());

      const execInput = new ExecSkillInput();
      execInput.id = addOut.id;
      execInput.params = { a: 1, b: 2 };
      const execOut = new ExecSkillOutput();
      await skillAccess.execSkill(execInput, execOut, new SkillContext());

      expect(execOut.elapsed_ms).toBeDefined();
      expect(execOut.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });
  });

  describe('数据完整性', () => {
    it('SkillRecord 应包含完整的系统字段', async () => {
      const input = new AddSkillInput();
      input.data = makeSkillData({ skill_brief: '完整性测试' });
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());

      const skill = getOut.skill!;
      expect(skill.id).toBeTruthy();
      expect(typeof skill.created).toBe('number');
      expect(typeof skill.updated).toBe('number');
      expect(skill.created).toBeGreaterThan(0);
      expect(skill.updated).toBeGreaterThan(0);
      expect(typeof skill.skill_brief).toBe('string');
      expect(typeof skill.skill_md).toBe('string');
      expect(typeof skill.enable).toBe('boolean');
    });

    it('scripts/references/assets 未传时应为 undefined', async () => {
      const input = new AddSkillInput();
      input.data = { name: '最小值', skill_brief: '最小值测试', skill_md: 'result = 1' };
      const out = new AddSkillOutput();
      await skillAccess.addSkill(input, out, new SkillContext());

      const getInput = new GetSkillInput();
      getInput.id = out.id;
      const getOut = new GetSkillOutput();
      await skillAccess.soSkillById(getInput, getOut, new SkillContext());

      expect(getOut.skill!.scripts).toBeUndefined();
      expect(getOut.skill!.references).toBeUndefined();
      expect(getOut.skill!.assets).toBeUndefined();
    });
  });
});
