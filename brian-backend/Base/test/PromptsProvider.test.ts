import { Metrics } from '../shared/base/Metrics';
import { Report } from '../shared/base/Report';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { TraceSchemaInitializer } from '../TraceBase/infrastructure/TraceSchemaInitializer';
import { DBContext, CloseDBInput, CloseDBOutput } from '../RelationDBProvider';
import {
  PromptsAccess,
  PromptContext,
  AddPromptInput,
  AddPromptOutput,
  DelPromptInput,
  DelPromptOutput,
  UpdatePromptInput,
  UpdatePromptOutput,
  GetPromptInput,
  GetPromptOutput,
  SoPromptInput,
  SoPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  EnablePromptsInput,
  EnablePromptsOutput,
  ClosePromptInput,
  ClosePromptOutput,
  PROMPT_TEMPLATE_USAGE_TABLE,
} from '../PromptsProvider';
import { Operator, Logic } from '../shared/query';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from '../shared/errors';

function makePromptData(overrides?: Record<string, unknown>) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    prompt_template_title: `Test Prompt ${suffix}`,
    prompt_template_brief: `Brief for test prompt ${suffix}`,
    prompt_template: `请根据以下内容生成回复：\n\n## 主题\n{{topic}}\n\n## 上下文\n{{context}}`,
    ...overrides,
  };
}

describe('PromptsProvider', () => {
  let tempDir: string;
  let sqlitePath: string;
  let relationDb: RelationDBAccess;
  let promptsAccess: PromptsAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-prompts-test-'));
    sqlitePath = path.join(tempDir, 'test.db');

    relationDb = new RelationDBAccess({ dbPath: sqlitePath });
    await relationDb.initialize();
    new TraceSchemaInitializer(relationDb).init();

    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
  });

  afterEach(async () => {
    try {
      await promptsAccess.closePrompts(
        new ClosePromptInput(),
        new ClosePromptOutput(), new PromptContext(),
      );
    } catch {

    }
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

  describe('addPrompt', () => {
    it('应该成功新增一个 Prompt 模板', async () => {
      const input = new AddPromptInput();
      input.data = makePromptData();
      const output = new AddPromptOutput();

      const result = await promptsAccess.addPrompt(
        input,
        output, new PromptContext(),
      );
      expect(result).toBe(true);
      expect(output.id).toBeTruthy();
      expect(typeof output.id).toBe('string');
      expect(output.id.length).toBeGreaterThan(0);
    });

    it('新增后应该可以通过 soPromptById 查到', async () => {
      const data = makePromptData({
        prompt_template_title: 'UniqueAddPromptTitle',
      });
      const input = new AddPromptInput();
      input.data = data;
      const out = new AddPromptOutput();
      await promptsAccess.addPrompt(input, out, new PromptContext());

      const getInput = new GetPromptInput();
      getInput.id = out.id;
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());

      expect(getOut.prompt).toBeTruthy();
      expect(getOut.prompt!.prompt_template_title).toBe('UniqueAddPromptTitle');
      expect(getOut.prompt!.prompt_template).toBe(data.prompt_template);
    });

    it('enable 默认为 1', async () => {
      const input = new AddPromptInput();
      input.data = makePromptData();
      const out = new AddPromptOutput();
      await promptsAccess.addPrompt(input, out, new PromptContext());

      const getInput = new GetPromptInput();
      getInput.id = out.id;
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());

      expect(getOut.prompt!.enable).toBe(1);
    });

    it('新增时指定 enable: false 应该保存为 0', async () => {
      const input = new AddPromptInput();
      input.data = makePromptData({ enable: false });
      const out = new AddPromptOutput();
      await promptsAccess.addPrompt(input, out, new PromptContext());

      const getInput = new GetPromptInput();
      getInput.id = out.id;
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());

      expect(getOut.prompt!.enable).toBe(0);
    });

    it('缺少 prompt_template_title 应该抛出 ValidationError', async () => {
      const input = new AddPromptInput();
      input.data = makePromptData({ prompt_template_title: '' });
      const out = new AddPromptOutput();

      await expect(
        promptsAccess.addPrompt(input, out, new PromptContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('缺少 prompt_template 应该抛出 ValidationError', async () => {
      const input = new AddPromptInput();
      input.data = makePromptData({ prompt_template: '' });
      const out = new AddPromptOutput();

      await expect(
        promptsAccess.addPrompt(input, out, new PromptContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('系统字段 id / created / updated 应该自动填充', async () => {
      const input = new AddPromptInput();
      input.data = makePromptData();
      const out = new AddPromptOutput();
      const before = Date.now();
      await promptsAccess.addPrompt(input, out, new PromptContext());

      const getInput = new GetPromptInput();
      getInput.id = out.id;
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());

      const record = getOut.prompt!;
      expect(record.id).toBe(out.id);
      expect(record.created).toBeGreaterThanOrEqual(before);
      expect(record.updated).toBeGreaterThanOrEqual(before);
    });

    it('prompt_template_brief 为可选字段，可省略', async () => {
      const input = new AddPromptInput();
      input.data = {
        prompt_template_title: 'No Brief Prompt',
        prompt_template: '模板内容',
      };
      const out = new AddPromptOutput();
      await promptsAccess.addPrompt(input, out, new PromptContext());

      const getInput = new GetPromptInput();
      getInput.id = out.id;
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());

      expect(getOut.prompt!.prompt_template_brief).toBeNull();
    });
  });

  describe('delPrompt', () => {
    it('应该支持按单个 ID 删除', async () => {
      const addInput = new AddPromptInput();
      addInput.data = makePromptData();
      const addOut = new AddPromptOutput();
      await promptsAccess.addPrompt(addInput, addOut, new PromptContext());

      const delInput = new DelPromptInput();
      delInput.ids = [addOut.id];
      const delOut = new DelPromptOutput();
      const result = await promptsAccess.delPrompt(
        delInput,
        delOut, new PromptContext(),
      );

      expect(result).toBe(true);
      expect(delOut.affected_rows).toBe(1);

      const getInput = new GetPromptInput();
      getInput.id = addOut.id;
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());
      expect(getOut.prompt).toBeNull();
    });

    it('应该支持批量删除', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const addInput = new AddPromptInput();
        addInput.data = makePromptData({
          prompt_template_title: `BatchDelete${i}`,
        });
        const addOut = new AddPromptOutput();
        await promptsAccess.addPrompt(addInput, addOut, new PromptContext());
        ids.push(addOut.id);
      }

      const delInput = new DelPromptInput();
      delInput.ids = ids;
      const delOut = new DelPromptOutput();
      await promptsAccess.delPrompt(delInput, delOut, new PromptContext());
      expect(delOut.affected_rows).toBe(3);
    });

    it('应该支持按条件删除', async () => {
      const addInput = new AddPromptInput();
      addInput.data = makePromptData({
        prompt_template_title: 'CondDeletePrompts',
      });
      const addOut = new AddPromptOutput();
      await promptsAccess.addPrompt(addInput, addOut, new PromptContext());

      const delInput = new DelPromptInput();
      delInput.conditions = [
        {
          field: 'title',
          operator: Operator.EQ,
          value: 'CondDeletePrompts',
        },
      ];
      const delOut = new DelPromptOutput();
      await promptsAccess.delPrompt(delInput, delOut, new PromptContext());
      expect(delOut.affected_rows).toBe(1);
    });

    it('删除 Prompt 时应该清理 prompt_template_usage 关联记录', async () => {
      const addInput = new AddPromptInput();
      addInput.data = makePromptData({
        prompt_template: '清理测试模板，变量 {{var1}}',
      });
      const addOut = new AddPromptOutput();
      await promptsAccess.addPrompt(addInput, addOut, new PromptContext());

      const execInput = new ExecPromptInput();
      execInput.id = addOut.id;
      execInput.variables = { var1: 'test' };
      await promptsAccess.execPrompt(
        execInput,
        new ExecPromptOutput(), new PromptContext(),
      );

      const usageBefore = await relationDb.select(
        PROMPT_TEMPLATE_USAGE_TABLE,
        {
          conditions: [
            {
              field: 'prompt_template_id',
              operator: Operator.EQ,
              value: addOut.id,
            },
          ],
        },
      );
      expect(usageBefore.length).toBe(1);

      const delInput = new DelPromptInput();
      delInput.ids = [addOut.id];
      await promptsAccess.delPrompt(
        delInput,
        new DelPromptOutput(), new PromptContext(),
      );

      const usageAfter = await relationDb.select(
        PROMPT_TEMPLATE_USAGE_TABLE,
        {
          conditions: [
            {
              field: 'prompt_template_id',
              operator: Operator.EQ,
              value: addOut.id,
            },
          ],
        },
      );
      expect(usageAfter.length).toBe(0);
    });

    it('ids 与 conditions 都没传应该抛出 ValidationError', async () => {
      const delInput = new DelPromptInput();
      const delOut = new DelPromptOutput();

      await expect(
        promptsAccess.delPrompt(delInput, delOut, new PromptContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('删除不存在的记录，affected_rows 应为 0', async () => {
      const delInput = new DelPromptInput();
      delInput.ids = ['nonexistent'];
      const delOut = new DelPromptOutput();
      await promptsAccess.delPrompt(delInput, delOut, new PromptContext());
      expect(delOut.affected_rows).toBe(0);
    });
  });

  describe('updatePrompt', () => {
    let promptId: string;

    beforeEach(async () => {
      const input = new AddPromptInput();
      input.data = makePromptData({ prompt_template_title: 'ToUpdateTitle' });
      const out = new AddPromptOutput();
      await promptsAccess.addPrompt(input, out, new PromptContext());
      promptId = out.id;
    });

    it('应该支持按 ID 更新 prompt_template_title', async () => {
      const input = new UpdatePromptInput();
      input.id = promptId;
      input.data = { prompt_template_title: 'UpdatedTitle' };
      const out = new UpdatePromptOutput();
      const result = await promptsAccess.updatePrompt(
        input,
        out, new PromptContext(),
      );

      expect(result).toBe(true);
      expect(out.affected_rows).toBe(1);

      const getInput = new GetPromptInput();
      getInput.id = promptId;
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());
      expect(getOut.prompt!.prompt_template_title).toBe('UpdatedTitle');
    });

    it('应该支持按条件更新', async () => {
      const input = new UpdatePromptInput();
      input.conditions = [
        {
          field: 'title',
          operator: Operator.EQ,
          value: 'ToUpdateTitle',
        },
      ];
      input.data = { prompt_template_brief: 'UpdatedBrief' };
      const out = new UpdatePromptOutput();
      await promptsAccess.updatePrompt(input, out, new PromptContext());
      expect(out.affected_rows).toBe(1);
    });

    it('应该支持通过 updatePrompt 启用/禁用 Prompt', async () => {

      const updateInput1 = new UpdatePromptInput();
      updateInput1.id = promptId;
      updateInput1.data = { enable: false };
      await promptsAccess.updatePrompt(
        updateInput1,
        new UpdatePromptOutput(), new PromptContext(),
      );

      const getInput = new GetPromptInput();
      getInput.id = promptId;
      const getOut1 = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut1, new PromptContext());
      expect(getOut1.prompt!.enable).toBe(0);

      const updateInput2 = new UpdatePromptInput();
      updateInput2.id = promptId;
      updateInput2.data = { enable: true };
      await promptsAccess.updatePrompt(
        updateInput2,
        new UpdatePromptOutput(), new PromptContext(),
      );
      const getOut2 = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut2, new PromptContext());
      expect(getOut2.prompt!.enable).toBe(1);
    });

    it('id 与 conditions 都没传应该抛出 ValidationError', async () => {
      const input = new UpdatePromptInput();
      input.data = { prompt_template_title: 'NoId' };
      const out = new UpdatePromptOutput();

      await expect(
        promptsAccess.updatePrompt(input, out, new PromptContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('更新不存在的记录，affected_rows 应为 0', async () => {
      const input = new UpdatePromptInput();
      input.id = 'nonexistent';
      input.data = { prompt_template_title: 'Ghost' };
      const out = new UpdatePromptOutput();
      await promptsAccess.updatePrompt(input, out, new PromptContext());
      expect(out.affected_rows).toBe(0);
    });

    it('自动更新 updated 字段', async () => {
      const before = Date.now();

      const input = new UpdatePromptInput();
      input.id = promptId;
      input.data = { prompt_template: '更新后的模板内容' };
      const out = new UpdatePromptOutput();
      await promptsAccess.updatePrompt(input, out, new PromptContext());

      const getInput = new GetPromptInput();
      getInput.id = promptId;
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());

      expect(getOut.prompt!.updated).toBeGreaterThanOrEqual(before);
      expect(getOut.prompt!.prompt_template).toBe('更新后的模板内容');
    });

    it('不应该允许通过 data 更新 id 字段', async () => {
      const input = new UpdatePromptInput();
      input.id = promptId;
      input.data = { prompt_template_title: 'NewTitle' };
      const out = new UpdatePromptOutput();
      await promptsAccess.updatePrompt(input, out, new PromptContext());

      const getInput = new GetPromptInput();
      getInput.id = promptId;
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());

      expect(getOut.prompt!.id).toBe(promptId);
    });
  });

  describe('soPromptById', () => {
    let promptId: string;
    let promptTitle: string;

    beforeEach(async () => {
      const data = makePromptData({
        prompt_template_title: 'GetTargetTitle',
        prompt_template_brief: 'GetTargetBrief',
      });
      promptTitle = data.prompt_template_title as string;

      const input = new AddPromptInput();
      input.data = data;
      const out = new AddPromptOutput();
      await promptsAccess.addPrompt(input, out, new PromptContext());
      promptId = out.id;
    });

    it('应该支持按 ID 获取 Prompt', async () => {
      const getInput = new GetPromptInput();
      getInput.id = promptId;
      const getOut = new GetPromptOutput();
      const result = await promptsAccess.soPromptById(
        getInput,
        getOut, new PromptContext(),
      );

      expect(result).toBe(true);
      expect(getOut.prompt).toBeTruthy();
      expect(getOut.prompt!.prompt_template_title).toBe('GetTargetTitle');
      expect(getOut.prompt!.prompt_template_brief).toBe('GetTargetBrief');
    });

    it('应该支持按条件获取', async () => {
      const getInput = new GetPromptInput();
      getInput.conditions = [
        {
          field: 'brief',
          operator: Operator.EQ,
          value: 'GetTargetBrief',
        },
      ];
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());

      expect(getOut.prompt).toBeTruthy();
      expect(getOut.prompt!.prompt_template_title).toBe('GetTargetTitle');
    });

    it('不存在的 ID 应返回 null', async () => {
      const getInput = new GetPromptInput();
      getInput.id = 'nonexistent';
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());

      expect(getOut.prompt).toBeNull();
    });

    it('id 与 conditions 都没传应该抛出 ValidationError', async () => {
      const getInput = new GetPromptInput();
      const getOut = new GetPromptOutput();

      await expect(
        promptsAccess.soPromptById(getInput, getOut, new PromptContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('返回的 Prompt 应包含所有字段', async () => {
      const getInput = new GetPromptInput();
      getInput.id = promptId;
      const getOut = new GetPromptOutput();
      await promptsAccess.soPromptById(getInput, getOut, new PromptContext());

      const p = getOut.prompt!;
      expect(p.id).toBe(promptId);
      expect(p.created).toBeGreaterThan(0);
      expect(p.updated).toBeGreaterThan(0);
      expect(p.prompt_template_title).toBeTruthy();
      expect(p.prompt_template).toBeTruthy();
      expect(typeof p.enable).toBe('number');
    });
  });

  describe('soPrompt', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        const input = new AddPromptInput();
        input.data = makePromptData({
          prompt_template_title: `SearchPrompt${i}`,
          prompt_template_brief: `Brief${i} description`,
          prompt_template: `模板内容 ${i}，变量 {{var${i}}}`,
        });
        const out = new AddPromptOutput();
        await promptsAccess.addPrompt(input, out, new PromptContext());
      }
    });

    it('应该支持关键词搜索（匹配 prompt_template_title）', async () => {
      const soInput = new SoPromptInput();
      soInput.keyword = 'SearchPrompt3';
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBe(1);
      expect(soOut.list[0].prompt_template_title).toBe('SearchPrompt3');
    });

    it('关键词应该同时匹配 prompt_template_brief', async () => {
      const soInput = new SoPromptInput();
      soInput.keyword = 'Brief3';
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBe(1);
      expect(soOut.list[0].prompt_template_brief).toBe('Brief3 description');
    });

    it('应该支持条件过滤', async () => {
      const soInput = new SoPromptInput();
      soInput.conditions = [
        { field: 'enable', operator: Operator.EQ, value: 1 },
        { field: 'title', operator: Operator.LIKE, value: 'SearchPrompt%' },
      ];
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBe(5);
      expect(soOut.total).toBe(5);
    });

    it('应该支持按 created 降序排序', async () => {
      const soInput = new SoPromptInput();
      soInput.order_by = [{ field: 'created', direction: 'DESC' }];
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      for (let i = 1; i < soOut.list.length; i++) {
        expect(soOut.list[i].created).toBeLessThanOrEqual(
          soOut.list[i - 1].created,
        );
      }
    });

    it('应该支持按 prompt_template_title 升序排序', async () => {
      const soInput = new SoPromptInput();
      soInput.order_by = [{ field: 'title', direction: 'ASC' }];
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      for (let i = 1; i < soOut.list.length; i++) {
        expect(
          soOut.list[i].prompt_template_title >=
            soOut.list[i - 1].prompt_template_title,
        ).toBe(true);
      }
    });

    it('应该支持分页', async () => {
      const soInput = new SoPromptInput();
      soInput.page = { current: 1, size: 2 };
      soInput.order_by = [
        { field: 'title', direction: 'ASC' },
      ];
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBe(2);
      expect(soOut.total).toBeGreaterThanOrEqual(5);
    });

    it('第二页查询', async () => {
      const soInput = new SoPromptInput();
      soInput.page = { current: 2, size: 2 };
      soInput.order_by = [
        { field: 'title', direction: 'ASC' },
      ];
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBe(2);
      expect(soOut.total).toBeGreaterThanOrEqual(5);
    });

    it('关键词无匹配时应返回空列表', async () => {
      const soInput = new SoPromptInput();
      soInput.keyword = 'NonExistentKeywordXYZ';
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBe(0);
      expect(soOut.total).toBe(0);
    });

    it('LIKE 模糊匹配应正确工作（部分匹配）', async () => {
      const soInput = new SoPromptInput();
      soInput.keyword = 'SearchPrompt';
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBe(5);
    });

    it('条件与关键词可组合使用', async () => {
      const soInput = new SoPromptInput();
      soInput.keyword = 'Search';
      soInput.conditions = [
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ];
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBe(5);
      expect(soOut.total).toBe(5);
    });
  });

  describe('soPrompt（使用频率排序）', () => {
    let promptIds: string[] = [];

    beforeEach(async () => {
      promptIds = [];
      for (let i = 0; i < 3; i++) {
        const input = new AddPromptInput();
        input.data = makePromptData({
          prompt_template_title: `UsageSort${i}`,
          prompt_template: 'Test {{var}}',
        });
        const out = new AddPromptOutput();
        await promptsAccess.addPrompt(input, out, new PromptContext());
        promptIds.push(out.id);
      }

      for (let j = 0; j < 3; j++) {
        const execInput = new ExecPromptInput();
        execInput.id = promptIds[1];
        execInput.variables = { var: 'test' };
        await promptsAccess.execPrompt(
          execInput,
          new ExecPromptOutput(), new PromptContext(),
        );
      }
      const execInput2 = new ExecPromptInput();
      execInput2.id = promptIds[2];
      execInput2.variables = { var: 'test' };
      await promptsAccess.execPrompt(
        execInput2,
        new ExecPromptOutput(), new PromptContext(),
      );
    });

    it('应该支持按 usage_total_count 排序（总使用次数）', async () => {
      const soInput = new SoPromptInput();
      soInput.order_by = [{ field: 'usage_total_count', direction: 'DESC' }];
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBeGreaterThanOrEqual(3);

      const titles = soOut.list.map((p) => p.prompt_template_title);
      const idx1 = titles.indexOf('UsageSort1');
      const idx2 = titles.indexOf('UsageSort2');
      const idx0 = titles.indexOf('UsageSort0');
      expect(idx1).toBeLessThan(idx2);
      expect(idx2).toBeLessThan(idx0);
    });

    it('应该支持按 usage_today_count 排序', async () => {
      const soInput = new SoPromptInput();
      soInput.order_by = [{ field: 'usage_today_count', direction: 'DESC' }];
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBeGreaterThanOrEqual(1);
    });

    it('使用频率排序应支持与分页结合', async () => {
      const soInput = new SoPromptInput();
      soInput.order_by = [{ field: 'usage_total_count', direction: 'DESC' }];
      soInput.page = { current: 1, size: 2 };
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.list.length).toBe(2);
      expect(soOut.total).toBeGreaterThanOrEqual(3);
    });

    it('使用频率排序应返回正确的 total', async () => {
      const soInput = new SoPromptInput();
      soInput.order_by = [{ field: 'usage_total_count', direction: 'ASC' }];
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      expect(soOut.total).toBeGreaterThanOrEqual(3);
    });

    it('无使用记录的模板在使用频率排序中值为 0', async () => {
      const soInput = new SoPromptInput();
      soInput.conditions = [
        { field: 'title', operator: Operator.LIKE, value: 'UsageSort%' },
      ];
      soInput.order_by = [{ field: 'usage_total_count', direction: 'ASC' }];
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(soInput, soOut, new PromptContext());

      const firstTitle = soOut.list[0]?.prompt_template_title;
      expect(firstTitle).toBe('UsageSort0');
    });
  });

  describe('execPrompt', () => {
    let promptId: string;

    beforeEach(async () => {
      const input = new AddPromptInput();
      input.data = makePromptData({
        prompt_template:
          '请将以下内容翻译为{{target_lang}}：\n\n原文：{{source}}\n\n要求：{{requirement}}',
      });
      const out = new AddPromptOutput();
      await promptsAccess.addPrompt(input, out, new PromptContext());
      promptId = out.id;
    });

    it('应该成功渲染模板并替换所有变量', async () => {
      const execInput = new ExecPromptInput();
      execInput.id = promptId;
      execInput.variables = {
        target_lang: '英文',
        source: '你好，世界',
        requirement: '保持原意',
      };
      const execOut = new ExecPromptOutput();
      const result = await promptsAccess.execPrompt(
        execInput,
        execOut, new PromptContext(),
      );

      expect(result).toBe(true);
      expect(execOut.prompt).toContain('英文');
      expect(execOut.prompt).toContain('你好，世界');
      expect(execOut.prompt).toContain('保持原意');
      expect(execOut.prompt).not.toContain('{{target_lang}}');
      expect(execOut.prompt).not.toContain('{{source}}');
      expect(execOut.prompt).not.toContain('{{requirement}}');
    });

    it('应该支持多个相同变量的替换（全局匹配）', async () => {
      const addInput = new AddPromptInput();
      addInput.data = makePromptData({
        prompt_template: '名称：{{name}}，再次确认：{{name}}',
      });
      const addOut = new AddPromptOutput();
      await promptsAccess.addPrompt(addInput, addOut, new PromptContext());

      const execInput = new ExecPromptInput();
      execInput.id = addOut.id;
      execInput.variables = { name: 'Brian' };
      const execOut = new ExecPromptOutput();
      await promptsAccess.execPrompt(
        execInput,
        execOut, new PromptContext(),
      );

      expect(execOut.prompt.split('Brian').length).toBe(3);
    });

    it('变量值中的 $ 不应产生特殊替换', async () => {
      const execInput = new ExecPromptInput();
      execInput.id = promptId;
      execInput.variables = {
        target_lang: '$$$',
        source: '$100',
        requirement: 'test',
      };
      const execOut = new ExecPromptOutput();
      await promptsAccess.execPrompt(
        execInput,
        execOut, new PromptContext(),
      );

      expect(execOut.prompt).toContain('$$$');
      expect(execOut.prompt).toContain('$100');
    });

    it('调用成功后应记录 usage_count', async () => {
      const execInput = new ExecPromptInput();
      execInput.id = promptId;
      execInput.variables = {
        target_lang: 'en',
        source: 'test',
        requirement: 'keep',
      };
      await promptsAccess.execPrompt(
        execInput,
        new ExecPromptOutput(), new PromptContext(),
      );

      const usageRows = await relationDb.select(PROMPT_TEMPLATE_USAGE_TABLE, {
        conditions: [
          {
            field: 'prompt_template_id',
            operator: Operator.EQ,
            value: promptId,
          },
        ],
      });
      expect(usageRows.length).toBe(1);
      expect(usageRows[0].usage_count).toBe(1);
    });

    it('多次调用同一 Prompt 当天 usage_count 应累加', async () => {
      const execInput = new ExecPromptInput();
      execInput.id = promptId;
      execInput.variables = {
        target_lang: 'en',
        source: 'test',
        requirement: 'keep',
      };

      await promptsAccess.execPrompt(
        execInput,
        new ExecPromptOutput(), new PromptContext(),
      );
      await promptsAccess.execPrompt(
        execInput,
        new ExecPromptOutput(), new PromptContext(),
      );
      await promptsAccess.execPrompt(
        execInput,
        new ExecPromptOutput(), new PromptContext(),
      );

      const usageRows = await relationDb.select(PROMPT_TEMPLATE_USAGE_TABLE, {
        conditions: [
          {
            field: 'prompt_template_id',
            operator: Operator.EQ,
            value: promptId,
          },
        ],
      });
      expect(usageRows.length).toBe(1);
      expect(usageRows[0].usage_count).toBe(3);
    });

    it('缺少 id 应该抛出 ValidationError', async () => {
      const execInput = new ExecPromptInput();
      execInput.id = '';
      execInput.variables = { test: 'value' };
      const execOut = new ExecPromptOutput();

      await expect(
        promptsAccess.execPrompt(execInput, execOut, new PromptContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('缺少 variables 或非对象应该抛出 ValidationError', async () => {
      const execInput = new ExecPromptInput();
      execInput.id = promptId;
      execInput.variables = null as unknown as Record<string, unknown>;
      const execOut = new ExecPromptOutput();

      await expect(
        promptsAccess.execPrompt(execInput, execOut, new PromptContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('不存在的 Prompt ID 应该抛出 NotFoundError', async () => {
      const execInput = new ExecPromptInput();
      execInput.id = 'nonexistent';
      execInput.variables = { test: 'value' };
      const execOut = new ExecPromptOutput();

      await expect(
        promptsAccess.execPrompt(execInput, execOut, new PromptContext()),
      ).rejects.toThrow(NotFoundError);
    });

    it('禁用的 Prompt 抛出 ValidationError', async () => {

      await promptsAccess.updatePrompt(
        Object.assign(new UpdatePromptInput(), {
          id: promptId,
          data: { enable: false },
        }),
        new UpdatePromptOutput(), new PromptContext(),
      );

      const execInput = new ExecPromptInput();
      execInput.id = promptId;
      execInput.variables = {
        target_lang: 'en',
        source: 'test',
        requirement: 'keep',
      };
      const execOut = new ExecPromptOutput();

      await expect(
        promptsAccess.execPrompt(execInput, execOut, new PromptContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('模板中不存在的变量不会被替换', async () => {
      const execInput = new ExecPromptInput();
      execInput.id = promptId;
      execInput.variables = {
        target_lang: '英文',
        source: '你好',
        requirement: '保持原意',
        extra_var: '不应该出现',
      };
      const execOut = new ExecPromptOutput();
      await promptsAccess.execPrompt(
        execInput,
        execOut, new PromptContext(),
      );

      expect(execOut.prompt).not.toContain('extra_var');
      expect(execOut.prompt).toContain('英文');
    });
  });

  describe('enablePrompts', () => {
    it('禁用组件后所有操作应抛出 ComponentDisabledError', async () => {
      await promptsAccess.enablePrompts(
        Object.assign(new EnablePromptsInput(), { enable: false }),
        new EnablePromptsOutput(), new PromptContext(),
      );

      const input = new AddPromptInput();
      input.data = makePromptData();
      const out = new AddPromptOutput();

      await expect(
        promptsAccess.addPrompt(input, out, new PromptContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('重新启用后操作恢复正常', async () => {

      await promptsAccess.enablePrompts(
        Object.assign(new EnablePromptsInput(), { enable: false }),
        new EnablePromptsOutput(), new PromptContext(),
      );

      await promptsAccess.enablePrompts(
        Object.assign(new EnablePromptsInput(), { enable: true }),
        new EnablePromptsOutput(), new PromptContext(),
      );

      const input = new AddPromptInput();
      input.data = makePromptData();
      const out = new AddPromptOutput();
      const result = await promptsAccess.addPrompt(
        input,
        out, new PromptContext(),
      );
      expect(result).toBe(true);
      expect(out.id).toBeTruthy();
    });

    it('enable 状态应持久化到 prompts_config 表', async () => {

      await promptsAccess.enablePrompts(
        Object.assign(new EnablePromptsInput(), { enable: false }),
        new EnablePromptsOutput(), new PromptContext(),
      );

      const configRow = await relationDb.selectOne('prompts_config_record', [
        {
          field: 'config_key',
          operator: Operator.EQ,
          value: 'enabled',
        },
      ]);
      expect(configRow).toBeTruthy();
      expect(configRow!.config_value).toBe('false');
    });

    it('重复启用已启用的组件应无副作用', async () => {
      await promptsAccess.enablePrompts(
        Object.assign(new EnablePromptsInput(), { enable: true }),
        new EnablePromptsOutput(), new PromptContext(),
      );

      const input = new AddPromptInput();
      input.data = makePromptData();
      const out = new AddPromptOutput();
      const result = await promptsAccess.addPrompt(
        input,
        out, new PromptContext(),
      );
      expect(result).toBe(true);
    });

    it('初始化时应从 config 恢复 enable 状态', async () => {

      await promptsAccess.enablePrompts(
        Object.assign(new EnablePromptsInput(), { enable: false }),
        new EnablePromptsOutput(), new PromptContext(),
      );

      const newAccess = new PromptsAccess(relationDb);
      await newAccess.initialize();

      const input = new AddPromptInput();
      input.data = makePromptData();
      const out = new AddPromptOutput();

      await expect(
        newAccess.addPrompt(input, out, new PromptContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  describe('closePrompts', () => {
    it('closePrompts 后所有操作应抛出 DatabaseError', async () => {
      await promptsAccess.closePrompts(
        new ClosePromptInput(),
        new ClosePromptOutput(), new PromptContext(),
      );

      const input = new AddPromptInput();
      input.data = makePromptData();
      const out = new AddPromptOutput();

      await expect(
        promptsAccess.addPrompt(input, out, new PromptContext()),
      ).rejects.toThrow(DatabaseError);
    });

    it('closePrompts 后 enablePrompts 应抛出 DatabaseError', async () => {
      await promptsAccess.closePrompts(
        new ClosePromptInput(),
        new ClosePromptOutput(), new PromptContext(),
      );

      await expect(
        promptsAccess.enablePrompts(
          Object.assign(new EnablePromptsInput(), { enable: true }),
          new EnablePromptsOutput(), new PromptContext(),
        ),
      ).rejects.toThrow(DatabaseError);
    });

    it('先禁用再 closePrompts 也应生效', async () => {
      await promptsAccess.enablePrompts(
        Object.assign(new EnablePromptsInput(), { enable: false }),
        new EnablePromptsOutput(), new PromptContext(),
      );

      await promptsAccess.closePrompts(
        new ClosePromptInput(),
        new ClosePromptOutput(), new PromptContext(),
      );

      const input = new AddPromptInput();
      input.data = makePromptData();
      const out = new AddPromptOutput();

      await expect(
        promptsAccess.addPrompt(input, out, new PromptContext()),
      ).rejects.toThrow(DatabaseError);
    });

    it('closePrompts 可以重复调用且无副作用', async () => {
      await promptsAccess.closePrompts(
        new ClosePromptInput(),
        new ClosePromptOutput(), new PromptContext(),
      );
      await promptsAccess.closePrompts(
        new ClosePromptInput(),
        new ClosePromptOutput(), new PromptContext(),
      );

      const input = new AddPromptInput();
      input.data = makePromptData();
      const out = new AddPromptOutput();

      await expect(
        promptsAccess.addPrompt(input, out, new PromptContext()),
      ).rejects.toThrow(DatabaseError);
    });

    it('组件操作在 close 不可恢复后需要重新初始化', async () => {
      await promptsAccess.closePrompts(
        new ClosePromptInput(),
        new ClosePromptOutput(), new PromptContext(),
      );

      const newAccess = new PromptsAccess(relationDb);
      await newAccess.initialize();

      const input = new AddPromptInput();
      input.data = makePromptData();
      const out = new AddPromptOutput();
      const result = await newAccess.addPrompt(
        input,
        out, new PromptContext(),
      );
      expect(result).toBe(true);
      expect(out.id).toBeTruthy();
    });
  });
});
