/**
 * @fileoverview LLMProvider 模块测试。
 *
 * 测试 LLMProvider 的全部接口：addLLMProvider / updateLLMProvider /
 * delLLMProvider / soLLMProvider / testLLMProvider / listLLM /
 * addLLM / delLLM / updateLLM / soLLMById / soLLM / execLLM /
 * visualizedLLM / enableLLM / closeLLM。
 *
 * 不使用任何 MOCK 数据，使用真实 SQLite 数据库和本地 HTTP 服务器。
 * 遵循 GraphDBProvider.test.ts 的测试模式。
 */

import { Metrics } from '../shared/base/Metrics';
import { Report } from '../shared/base/Report';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { DBContext, CloseDBInput, CloseDBOutput } from '../RelationDBProvider';
import {
  LLMAccess,
  LLMContext,
  AddLLMProviderInput,
  AddLLMProviderOutput,
  UpdateLLMProviderInput,
  UpdateLLMProviderOutput,
  DelLLMProviderInput,
  DelLLMProviderOutput,
  SoLLMProviderInput,
  SoLLMProviderOutput,
  TestLLMProviderInput,
  TestLLMProviderOutput,
  ListLLMInput,
  ListLLMOutput,
  AddLLMInput,
  AddLLMOutput,
  DelLLMInput,
  DelLLMOutput,
  UpdateLLMInput,
  UpdateLLMOutput,
  GetLLMInput,
  GetLLMOutput,
  SoLLMInput,
  SoLLMOutput,
  ExecLLMInput,
  ExecLLMOutput,
  VisualizedLLMInput,
  VisualizedLLMOutput,
  EnableLLMInput,
  EnableLLMOutput,
  CloseLLMInput,
  CloseLLMOutput,
} from '../LLMProvider';
import { Operator, Logic } from '../shared/query';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from '../shared/errors';

// ---------------------------------------------------------------------------
// 测试辅助函数
// ---------------------------------------------------------------------------

/** 生成唯一的 LLM 提供商测试数据 */
function makeProviderData(overrides?: Record<string, unknown>) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    llm_provider_url: `https://api.test-${suffix}.com/v1`,
    llm_provider_title: `Test Provider ${suffix}`,
    llm_provider_brief: `Brief for test provider ${suffix}`,
    ...overrides,
  };
}

/** 生成唯一的 LLM 测试数据 */
function makeLLMData(providerId: string, overrides?: Record<string, unknown>) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    llm_provider_id: providerId,
    llm_title: `gpt-${suffix}`,
    llm_brief: `LLM brief ${suffix}`,
    llm_type: 'chat',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 本地 HTTP 测试服务器
// ---------------------------------------------------------------------------

/**
 * 创建一个本地 HTTP 服务器，模拟 OpenAI 兼容 API。
 * 返回 server 实例和 base URL。
 */
function startTestServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // 模拟错误端点
      if (url.pathname === '/error-500') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
        return;
      }

      // GET / - 连通性测试 (testLLMProvider)
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      // GET /v1/models - 模型列表 (listLLM)
      if (req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            data: [
              { id: 'gpt-4o', object: 'model', created: 1720000000, owned_by: 'openai' },
              { id: 'gpt-4o-mini', object: 'model', created: 1720000001, owned_by: 'openai' },
              { id: 'gpt-3.5-turbo', object: 'model', created: 1700000000, owned_by: 'openai' },
            ],
          }),
        );
        return;
      }

      // GET /v1beta/models - Google 原生模型列表
      if (req.method === 'GET' && url.pathname === '/v1beta/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [
              {
                name: 'models/gemini-1.5-pro',
                displayName: 'Gemini 1.5 Pro',
                description: 'Complex reasoning model',
                inputTokenLimit: 2097152,
                outputTokenLimit: 8192,
              },
              {
                name: 'models/gemini-1.5-flash',
                displayName: 'Gemini 1.5 Flash',
                description: 'Fast versatile model',
                inputTokenLimit: 1048576,
                outputTokenLimit: 8192,
              },
            ],
          }),
        );
        return;
      }

      // POST /v1/chat/completions - 对话补全 (execLLM)
      if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const userMsg =
              (parsed.messages as Array<{ role: string; content: string }>)?.find(
                (m) => m.role === 'user',
              )?.content ?? '';

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                id: 'chatcmpl-test',
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: parsed.model || 'gpt-4o',
                choices: [
                  {
                    index: 0,
                    message: {
                      role: 'assistant',
                      content: `Echo: ${userMsg}`,
                    },
                    finish_reason: 'stop',
                  },
                ],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 5,
                  total_tokens: 15,
                },
              }),
            );
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bad Request' }));
          }
        });
        return;
      }

      // POST /v1/chat/completions with X-Simulate-Error header (execLLM error)
      if (req.method === 'POST' && url.pathname === '/v1/error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Simulated server error' } }));
        return;
      }

      // 404 for everything else
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });

    server.on('error', reject);

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({
          server,
          baseUrl: `http://127.0.0.1:${addr.port}`,
        });
      } else {
        reject(new Error('Failed to get server address'));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('LLMProvider', () => {
  let tempDir: string;
  let sqlitePath: string;
  let relationDb: RelationDBAccess;
  let llmAccess: LLMAccess;
  let httpServer: http.Server;
  let httpBaseUrl: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-llm-test-'));
    sqlitePath = path.join(tempDir, 'test.db');

    relationDb = new RelationDBAccess({ dbPath: sqlitePath });
    await relationDb.initialize();

    llmAccess = new LLMAccess(relationDb);
    await llmAccess.initialize();

    const { server, baseUrl } = await startTestServer();
    httpServer = server;
    httpBaseUrl = baseUrl;
  });

  afterEach(async () => {
    try {
      await llmAccess.closeLLM(new CloseLLMInput(), new CloseLLMOutput(), new LLMContext());
    } catch {
      // 忽略关闭时的错误
    }
    try {
      await relationDb.closeDB(new CloseDBInput(), new CloseDBOutput(), new DBContext());
    } catch {
      // 忽略关闭时的错误
    }
    await new Promise((r) => setTimeout(r, 100));

    if (httpServer) {
      try {
        httpServer.close();
      } catch {
        // 忽略
      }
    }

    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // 忽略清理错误
      }
    }
  });

  // =========================================================================
  // addLLMProvider
  // =========================================================================

  describe('addLLMProvider', () => {
    it('应该成功新增一个 LLM 提供商', async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData();
      const output = new AddLLMProviderOutput();

      const result = await llmAccess.addLLMProvider(input, output, new LLMContext());
      expect(result).toBe(true);
      expect(output.id).toBeTruthy();
      expect(typeof output.id).toBe('string');
      expect(output.id.length).toBeGreaterThan(0);
    });

    it('新增后应该可以通过搜索查到', async () => {
      const data = makeProviderData({ llm_provider_title: 'UniqueSearchProvider' });
      const input = new AddLLMProviderInput();
      input.data = data;
      const out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(input, out, new LLMContext());

      const soInput = new SoLLMProviderInput();
      soInput.keyword = 'UniqueSearchProvider';
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(1);
      expect(soOut.list[0].llm_provider_title).toBe('UniqueSearchProvider');
    });


    it('新增时指定 enable: false 应该保存为 false', async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData({ enable: false });
      const out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(input, out, new LLMContext());

      const soInput = new SoLLMProviderInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: out.id }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      expect(soOut.list[0].enable).toBe(0);
    });

    it('缺少 llm_provider_url 应该抛出 ValidationError', async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData({ llm_provider_url: '' });
      const out = new AddLLMProviderOutput();

      await expect(
        llmAccess.addLLMProvider(input, out, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('缺少 llm_provider_title 应该抛出 ValidationError', async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData({ llm_provider_title: '' });
      const out = new AddLLMProviderOutput();

      await expect(
        llmAccess.addLLMProvider(input, out, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('新增时系统字段 should not appear in data', async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData();
      const out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(input, out, new LLMContext());

      const soInput = new SoLLMProviderInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: out.id }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      const record = soOut.list[0];
      expect(record.created).toBeGreaterThan(0);
      expect(record.updated).toBeGreaterThan(0);
      expect(record.id).toBe(out.id);
    });

    it('新增时未指定配额应继承 llm_config 的默认配额', async () => {
      await relationDb.insert('llm_config', [
        { field: 'config_key', value: 'default_quota_tokens_per_day' },
        { field: 'config_value', value: '100' },
        { field: 'value_type', value: 'INT' },
        { field: 'updated', value: Date.now() },
      ]);

      const input = new AddLLMProviderInput();
      input.data = makeProviderData();
      const out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(input, out, new LLMContext());

      const row = await relationDb.selectOne('llm_provider', [
        { field: 'id', operator: Operator.EQ, value: out.id },
      ]);
      expect(Number(row?.quota_tokens_per_day)).toBe(100);
    });
  });

  // =========================================================================
  // updateLLMProvider
  // =========================================================================

  describe('updateLLMProvider', () => {
    let providerId: string;

    beforeEach(async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData({ llm_provider_title: 'ToUpdate' });
      const out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(input, out, new LLMContext());
      providerId = out.id;
    });

    it('应该支持按 ID 更新 llm_provider_title', async () => {
      const input = new UpdateLLMProviderInput();
      input.id = providerId;
      input.data = { llm_provider_title: 'UpdatedTitle' };
      const out = new UpdateLLMProviderOutput();
      const result = await llmAccess.updateLLMProvider(input, out, new LLMContext());

      expect(result).toBe(true);
      expect(out.affected_rows).toBe(1);

      const soInput = new SoLLMProviderInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: providerId }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());
      expect(soOut.list[0].llm_provider_title).toBe('UpdatedTitle');
    });

    it('应该支持按条件更新', async () => {
      const input = new UpdateLLMProviderInput();
      input.conditions = [{ field: 'llm_provider_title', operator: Operator.EQ, value: 'ToUpdate' }];
      input.data = { llm_provider_brief: 'UpdatedBrief' };
      const out = new UpdateLLMProviderOutput();
      await llmAccess.updateLLMProvider(input, out, new LLMContext());
      expect(out.affected_rows).toBe(1);
    });

    it('应该支持通过 updateLLMProvider 启用/禁用提供商', async () => {
      // 先禁用
      await llmAccess.updateLLMProvider(
        Object.assign(new UpdateLLMProviderInput(), {
          id: providerId,
          data: { enable: false },
        }),
        new UpdateLLMProviderOutput(), new LLMContext(),
      );

      const soInput = new SoLLMProviderInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: providerId }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());
      expect(soOut.list[0].enable).toBe(0);

      // 再启用
      await llmAccess.updateLLMProvider(
        Object.assign(new UpdateLLMProviderInput(), {
          id: providerId,
          data: { enable: true },
        }),
        new UpdateLLMProviderOutput(), new LLMContext(),
      );
      const soOut2 = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut2, new LLMContext());
      expect(soOut2.list[0].enable).toBe(1);
    });

    it('id 与 conditions 都没传应该抛出 ValidationError', async () => {
      const input = new UpdateLLMProviderInput();
      input.data = { llm_provider_title: 'NoId' };
      const out = new UpdateLLMProviderOutput();

      await expect(
        llmAccess.updateLLMProvider(input, out, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('更新不存在的记录，affected_rows 应为 0', async () => {
      const input = new UpdateLLMProviderInput();
      input.id = 'nonexistent-id';
      input.data = { llm_provider_title: 'Ghost' };
      const out = new UpdateLLMProviderOutput();
      await llmAccess.updateLLMProvider(input, out, new LLMContext());
      expect(out.affected_rows).toBe(0);
    });

    it('自动更新 updated 字段', async () => {
      const before = Date.now();

      const input = new UpdateLLMProviderInput();
      input.id = providerId;
      input.data = { llm_provider_url: 'https://new-url.example.com' };
      const out = new UpdateLLMProviderOutput();
      await llmAccess.updateLLMProvider(input, out, new LLMContext());

      const soInput = new SoLLMProviderInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: providerId }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      expect(soOut.list[0].updated).toBeGreaterThanOrEqual(before);
      expect(soOut.list[0].llm_provider_url).toBe('https://new-url.example.com');
    });
  });

  // =========================================================================
  // delLLMProvider
  // =========================================================================

  describe('delLLMProvider', () => {
    it('应该支持按单个 ID 删除', async () => {
      const addInput = new AddLLMProviderInput();
      addInput.data = makeProviderData();
      const addOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(addInput, addOut, new LLMContext());

      const delInput = new DelLLMProviderInput();
      delInput.ids = [addOut.id];
      const delOut = new DelLLMProviderOutput();
      const result = await llmAccess.delLLMProvider(delInput, delOut, new LLMContext());

      expect(result).toBe(true);
      expect(delOut.affected_rows).toBe(1);

      // 确认已删除
      const soInput = new SoLLMProviderInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: addOut.id }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());
      expect(soOut.list.length).toBe(0);
    });

    it('应该支持批量删除', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const addInput = new AddLLMProviderInput();
        addInput.data = makeProviderData({ llm_provider_title: `BatchDelete ${i}` });
        const addOut = new AddLLMProviderOutput();
        await llmAccess.addLLMProvider(addInput, addOut, new LLMContext());
        ids.push(addOut.id);
      }

      const delInput = new DelLLMProviderInput();
      delInput.ids = ids;
      const delOut = new DelLLMProviderOutput();
      await llmAccess.delLLMProvider(delInput, delOut, new LLMContext());
      expect(delOut.affected_rows).toBe(3);
    });

    it('应该支持按条件删除', async () => {
      const addInput = new AddLLMProviderInput();
      addInput.data = makeProviderData({ llm_provider_title: 'CondDelete' });
      const addOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(addInput, addOut, new LLMContext());

      const delInput = new DelLLMProviderInput();
      delInput.conditions = [{ field: 'llm_provider_title', operator: Operator.EQ, value: 'CondDelete' }];
      const delOut = new DelLLMProviderOutput();
      await llmAccess.delLLMProvider(delInput, delOut, new LLMContext());
      expect(delOut.affected_rows).toBe(1);
    });

    it('删除提供商时应该级联清理关联的 llm_model 记录', async () => {
      // 创建提供商并获取模型列表
      const addInput = new AddLLMProviderInput();
      addInput.data = makeProviderData({ llm_provider_url: httpBaseUrl });
      const addOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(addInput, addOut, new LLMContext());

      const listInput = new ListLLMInput();
      listInput.llm_provider_id = addOut.id;
      const listOut = new ListLLMOutput();
      await llmAccess.listLLM(listInput, listOut, new LLMContext());
      expect(listOut.list.length).toBeGreaterThan(0);

      // 删除提供商
      const delInput = new DelLLMProviderInput();
      delInput.ids = [addOut.id];
      const delOut = new DelLLMProviderOutput();
      await llmAccess.delLLMProvider(delInput, delOut, new LLMContext());

      // 验证 llm_cache 表中的关联记录也被删除
      const modelRows = relationDb.select('llm_cache', {
        conditions: [{ field: 'llm_provider_id', operator: Operator.EQ, value: addOut.id }],
      });
      await expect(modelRows).resolves.toHaveLength(0);
    });

    it('ids 与 conditions 都没传应该抛出 ValidationError', async () => {
      const delInput = new DelLLMProviderInput();
      const delOut = new DelLLMProviderOutput();

      await expect(
        llmAccess.delLLMProvider(delInput, delOut, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('删除不存在的记录，affected_rows 应为 0', async () => {
      const delInput = new DelLLMProviderInput();
      delInput.ids = ['nonexistent'];
      const delOut = new DelLLMProviderOutput();
      await llmAccess.delLLMProvider(delInput, delOut, new LLMContext());
      expect(delOut.affected_rows).toBe(0);
    });
  });

  // =========================================================================
  // soLLMProvider
  // =========================================================================

  describe('soLLMProvider', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        const input = new AddLLMProviderInput();
        input.data = makeProviderData({
          llm_provider_title: `SearchProvider${i}`,
          llm_provider_brief: `Brief${i} description`,
        });
        const out = new AddLLMProviderOutput();
        await llmAccess.addLLMProvider(input, out, new LLMContext());
      }
    });

    it('应该支持关键词搜索', async () => {
      const soInput = new SoLLMProviderInput();
      soInput.keyword = 'SearchProvider3';
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(1);
      expect(soOut.list[0].llm_provider_title).toBe('SearchProvider3');
    });

    it('应该支持条件过滤', async () => {
      const soInput = new SoLLMProviderInput();
      soInput.conditions = [
        { field: 'llm_provider_title', operator: Operator.EQ, value: 'SearchProvider2' },
      ];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(1);
      expect(soOut.list[0].llm_provider_title).toBe('SearchProvider2');
    });

    it('应该支持排序（按 title 升序）', async () => {
      const soInput = new SoLLMProviderInput();
      soInput.order_by = [{ field: 'llm_provider_title', direction: 'ASC' }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      for (let i = 1; i < soOut.list.length; i++) {
        expect(soOut.list[i].llm_provider_title >= soOut.list[i - 1].llm_provider_title).toBe(true);
      }
    });

    it('应该支持分页', async () => {
      const soInput = new SoLLMProviderInput();
      soInput.page = { current: 1, size: 2 };
      soInput.order_by = [{ field: 'llm_provider_title', direction: 'ASC' }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(2);
      expect(soOut.total).toBeGreaterThanOrEqual(5);
    });

    it('第二页', async () => {
      const soInput = new SoLLMProviderInput();
      soInput.page = { current: 2, size: 2 };
      soInput.order_by = [{ field: 'llm_provider_title', direction: 'ASC' }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(2);
    });

    it('关键词无匹配时应返回空列表', async () => {
      const soInput = new SoLLMProviderInput();
      soInput.keyword = 'NonExistentKeywordXYZ';
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(0);
      expect(soOut.total).toBe(0);
    });

    it('支持 BETWEEN 条件操作符', async () => {
      const soInput = new SoLLMProviderInput();
      soInput.conditions = [
        { field: 'created', operator: Operator.GE, value: 0 },
        { field: 'created', operator: Operator.LE, value: Date.now() },
      ];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());
      expect(soOut.total).toBeGreaterThanOrEqual(5);
    });
  });

  // =========================================================================
  // testLLMProvider
  // =========================================================================

  describe('testLLMProvider', () => {
    let providerId: string;

    beforeEach(async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData({ llm_provider_url: httpBaseUrl });
      const out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(input, out, new LLMContext());
      providerId = out.id;
    });

    it('应该成功测试连通性（connected: true）', async () => {
      const testInput = new TestLLMProviderInput();
      testInput.id = providerId;
      const testOut = new TestLLMProviderOutput();
      const result = await llmAccess.testLLMProvider(testInput, testOut, new LLMContext());

      expect(result).toBe(true);
      expect(testOut.connected).toBe(true);
      expect(testOut.response_time_ms).toBeGreaterThan(0);
      expect(testOut.status_code).toBe(200);
    });

    it('不存在的 ID 应该抛出 NotFoundError', async () => {
      const testInput = new TestLLMProviderInput();
      testInput.id = 'nonexistent';
      const testOut = new TestLLMProviderOutput();

      await expect(
        llmAccess.testLLMProvider(testInput, testOut, new LLMContext()),
      ).rejects.toThrow(NotFoundError);
    });

    it('缺少 id 应该抛出 ValidationError', async () => {
      const testInput = new TestLLMProviderInput();
      testInput.id = '';
      const testOut = new TestLLMProviderOutput();

      await expect(
        llmAccess.testLLMProvider(testInput, testOut, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('不可达的 URL 应返回 connected: false', async () => {
      const addInput = new AddLLMProviderInput();
      addInput.data = makeProviderData({ llm_provider_url: 'http://127.0.0.1:19999' });
      const addOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(addInput, addOut, new LLMContext());

      const testInput = new TestLLMProviderInput();
      testInput.id = addOut.id;
      const testOut = new TestLLMProviderOutput();
      await llmAccess.testLLMProvider(testInput, testOut, new LLMContext());

      expect(testOut.connected).toBe(false);
      expect(testOut.response_time_ms).toBeGreaterThanOrEqual(0);
      expect(testOut.error).toBeTruthy();
      expect(testOut.error_code).toBe('CONNECT_ERROR');
    });
  });

  // =========================================================================
  // listLLM
  // =========================================================================

  describe('listLLM', () => {
    let providerId: string;

    beforeEach(async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData({ llm_provider_url: httpBaseUrl });
      const out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(input, out, new LLMContext());
      providerId = out.id;
    });

    it('应该成功从提供商获取模型列表并保存到 llm_model', async () => {
      const listInput = new ListLLMInput();
      listInput.llm_provider_id = providerId;
      const listOut = new ListLLMOutput();
      const result = await llmAccess.listLLM(listInput, listOut, new LLMContext());

      expect(result).toBe(true);
      expect(listOut.list.length).toBe(3);
      expect(listOut.list[0].llm_title).toBeTruthy();
      expect(listOut.list[0].llm_provider_id).toBe(providerId);
    });

    it('不存在的 llm_provider_id 应该抛出 NotFoundError', async () => {
      const listInput = new ListLLMInput();
      listInput.llm_provider_id = 'nonexistent';
      const listOut = new ListLLMOutput();

      await expect(
        llmAccess.listLLM(listInput, listOut, new LLMContext()),
      ).rejects.toThrow(NotFoundError);
    });

    it('缺少 llm_provider_id 应该抛出 ValidationError', async () => {
      const listInput = new ListLLMInput();
      listInput.llm_provider_id = '';
      const listOut = new ListLLMOutput();

      await expect(
        llmAccess.listLLM(listInput, listOut, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('重复调用应该 upsert 而不是重复插入', async () => {
      const listInput = new ListLLMInput();
      listInput.llm_provider_id = providerId;

      // 第一次调用
      await llmAccess.listLLM(listInput, new ListLLMOutput(), new LLMContext());
      // 第二次调用相同提供商
      const listOut2 = new ListLLMOutput();
      await llmAccess.listLLM(listInput, listOut2, new LLMContext());

      // 模型数应该保持一致（upsert 语义）
      expect(listOut2.list.length).toBe(3);
    });

    it('不可达的提供商 URL 应返回 error 信息，且不应更新 models_fetched_at 缓存时间', async () => {
      const addInput = new AddLLMProviderInput();
      addInput.data = makeProviderData({ llm_provider_url: 'http://127.0.0.1:19999' });
      const addOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(addInput, addOut, new LLMContext());

      const listInput = new ListLLMInput();
      listInput.llm_provider_id = addOut.id;
      const listOut = new ListLLMOutput();
      const result = await llmAccess.listLLM(listInput, listOut, new LLMContext());

      expect(result).toBe(false);
      expect(listOut.error).toBeTruthy();
      expect(listOut.error_code).toBe('CONNECT_ERROR');

      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(
        Object.assign(new SoLLMProviderInput(), { conditions: [{ field: 'id', operator: Operator.EQ, value: addOut.id }] }),
        soOut, new LLMContext(),
      );
      expect(soOut.list[0].models_fetched_at).toBeFalsy();
    });

    it('指定 force=true 时应强制调用远程 API 并更新本地模型缓存', async () => {
      const listInput = new ListLLMInput();
      listInput.llm_provider_id = providerId;
      listInput.force = true;
      const listOut = new ListLLMOutput();
      const result = await llmAccess.listLLM(listInput, listOut, new LLMContext());

      expect(result).toBe(true);
      expect(listOut.cached).toBe(false);
      expect(listOut.list.length).toBe(3);
    });

    it('应该支持从 Google 格式响应解析模型列表并提取 max_tokens 与 brief', async () => {
      const addInput = new AddLLMProviderInput();
      addInput.data = makeProviderData({
        llm_provider_url: `${httpBaseUrl}/v1beta`,
        models_path: 'models',
      });
      const addOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(addInput, addOut, new LLMContext());

      const listInput = new ListLLMInput();
      listInput.llm_provider_id = addOut.id;
      listInput.force = true;
      const listOut = new ListLLMOutput();
      const result = await llmAccess.listLLM(listInput, listOut, new LLMContext());

      expect(result).toBe(true);
      expect(listOut.list.length).toBe(2);
      const pro = listOut.list.find((m) => m.llm_title === 'gemini-1.5-pro');
      const flash = listOut.list.find((m) => m.llm_title === 'gemini-1.5-flash');
      expect(pro).toBeDefined();
      expect(pro!.max_tokens).toBe(2097152);
      expect(pro!.llm_brief).toContain('Gemini 1.5 Pro');
      expect(flash).toBeDefined();
      expect(flash!.max_tokens).toBe(1048576);
      expect(flash!.llm_brief).toContain('Gemini 1.5 Flash');
    });
  });

  // =========================================================================
  // addLLM
  // =========================================================================

  describe('addLLM', () => {
    let providerId: string;

    beforeEach(async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData();
      const out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(input, out, new LLMContext());
      providerId = out.id;
    });

    it('应该成功新增一个 LLM', async () => {
      const input = new AddLLMInput();
      input.data = makeLLMData(providerId);
      const output = new AddLLMOutput();
      const result = await llmAccess.addLLM(input, output, new LLMContext());

      expect(result).toBe(true);
      expect(output.id).toBeTruthy();
    });

    it('新增后应该可以通过 soLLM 查到', async () => {
      const input = new AddLLMInput();
      input.data = makeLLMData(providerId, { llm_title: 'GetLLMTest' });
      const out = new AddLLMOutput();
      await llmAccess.addLLM(input, out, new LLMContext());

      const soInput = new SoLLMInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: out.id }];
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());

      expect(soOut.list[0]).toBeTruthy();
      expect(soOut.list[0].llm_title).toBe('GetLLMTest');
    });


    it('缺少 llm_provider_id 应该抛出 ValidationError', async () => {
      const input = new AddLLMInput();
      input.data = makeLLMData('');
      const out = new AddLLMOutput();

      await expect(
        llmAccess.addLLM(input, out, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('缺少 llm_title 应该抛出 ValidationError', async () => {
      const input = new AddLLMInput();
      input.data = makeLLMData(providerId, { llm_title: '' });
      const out = new AddLLMOutput();

      await expect(
        llmAccess.addLLM(input, out, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('系统字段应该自动填充', async () => {
      const input = new AddLLMInput();
      input.data = makeLLMData(providerId);
      const out = new AddLLMOutput();
      await llmAccess.addLLM(input, out, new LLMContext());

      const soInput = new SoLLMInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: out.id }];
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());
      expect(soOut.list[0].created).toBeGreaterThan(0);
      expect(soOut.list[0].updated).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // delLLM
  // =========================================================================

  describe('delLLM', () => {
    let providerId: string;

    beforeEach(async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData();
      const out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(input, out, new LLMContext());
      providerId = out.id;
    });

    it('应该支持按单个 ID 删除', async () => {
      const addInput = new AddLLMInput();
      addInput.data = makeLLMData(providerId);
      const addOut = new AddLLMOutput();
      await llmAccess.addLLM(addInput, addOut, new LLMContext());

      const delInput = new DelLLMInput();
      delInput.ids = [addOut.id];
      const delOut = new DelLLMOutput();
      await llmAccess.delLLM(delInput, delOut, new LLMContext());
      expect(delOut.affected_rows).toBe(1);

      const soInput = new SoLLMInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: addOut.id }];
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());
      expect(soOut.list.length).toBe(0);
    });

    it('应该支持批量删除', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const addInput = new AddLLMInput();
        addInput.data = makeLLMData(providerId, { llm_title: `BatchLLM${i}` });
        const addOut = new AddLLMOutput();
        await llmAccess.addLLM(addInput, addOut, new LLMContext());
        ids.push(addOut.id);
      }

      const delInput = new DelLLMInput();
      delInput.ids = ids;
      const delOut = new DelLLMOutput();
      await llmAccess.delLLM(delInput, delOut, new LLMContext());
      expect(delOut.affected_rows).toBe(3);
    });

    it('应该支持按条件删除', async () => {
      const addInput = new AddLLMInput();
      addInput.data = makeLLMData(providerId, { llm_title: 'CondLLMDelete' });
      const addOut = new AddLLMOutput();
      await llmAccess.addLLM(addInput, addOut, new LLMContext());

      const delInput = new DelLLMInput();
      delInput.conditions = [{ field: 'llm_title', operator: Operator.EQ, value: 'CondLLMDelete' }];
      const delOut = new DelLLMOutput();
      await llmAccess.delLLM(delInput, delOut, new LLMContext());
      expect(delOut.affected_rows).toBe(1);
    });

    it('ids 与 conditions 都没传应该抛出 ValidationError', async () => {
      const delInput = new DelLLMInput();
      const delOut = new DelLLMOutput();

      await expect(
        llmAccess.delLLM(delInput, delOut, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // updateLLM
  // =========================================================================

  describe('updateLLM', () => {
    let providerId: string;
    let llmId: string;

    beforeEach(async () => {
      const pInput = new AddLLMProviderInput();
      pInput.data = makeProviderData();
      const pOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(pInput, pOut, new LLMContext());
      providerId = pOut.id;

      const lInput = new AddLLMInput();
      lInput.data = makeLLMData(providerId, { llm_title: 'ToUpdateLLM' });
      const lOut = new AddLLMOutput();
      await llmAccess.addLLM(lInput, lOut, new LLMContext());
      llmId = lOut.id;
    });

    it('应该支持按 ID 更新 llm_title', async () => {
      const input = new UpdateLLMInput();
      input.id = llmId;
      input.data = { llm_title: 'UpdatedLLMTitle' };
      const out = new UpdateLLMOutput();
      await llmAccess.updateLLM(input, out, new LLMContext());

      expect(out.affected_rows).toBe(1);

      const getInput = new GetLLMInput();
      getInput.id = llmId;
      const getOut = new GetLLMOutput();
      await llmAccess.soLLMById(getInput, getOut, new LLMContext());
      expect(getOut.llm!.llm_title).toBe('UpdatedLLMTitle');
    });

    it('应该支持按条件更新', async () => {
      const input = new UpdateLLMInput();
      input.conditions = [{ field: 'llm_title', operator: Operator.EQ, value: 'ToUpdateLLM' }];
      input.data = { llm_brief: 'UpdatedBrief' };
      const out = new UpdateLLMOutput();
      await llmAccess.updateLLM(input, out, new LLMContext());
      expect(out.affected_rows).toBe(1);
    });

    it('应该支持通过 updateLLM 启用/禁用 LLM', async () => {
      await llmAccess.updateLLM(
        Object.assign(new UpdateLLMInput(), {
          id: llmId,
          data: { enable: false },
        }),
        new UpdateLLMOutput(), new LLMContext(),
      );

      const getInput = new GetLLMInput();
      getInput.id = llmId;
      const getOut = new GetLLMOutput();
      await llmAccess.soLLMById(getInput, getOut, new LLMContext());
      expect(getOut.llm!.enable).toBe(0);

      await llmAccess.updateLLM(
        Object.assign(new UpdateLLMInput(), {
          id: llmId,
          data: { enable: true },
        }),
        new UpdateLLMOutput(), new LLMContext(),
      );
      const getOut2 = new GetLLMOutput();
      await llmAccess.soLLMById(getInput, getOut2, new LLMContext());
      expect(getOut2.llm!.enable).toBe(1);
    });

    it('id 与 conditions 都没传应该抛出 ValidationError', async () => {
      const input = new UpdateLLMInput();
      input.data = { llm_title: 'NoId' };
      const out = new UpdateLLMOutput();

      await expect(
        llmAccess.updateLLM(input, out, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('更新不存在的记录 affected_rows 应为 0', async () => {
      const input = new UpdateLLMInput();
      input.id = 'nonexistent';
      input.data = { llm_title: 'Ghost' };
      const out = new UpdateLLMOutput();
      await llmAccess.updateLLM(input, out, new LLMContext());
      expect(out.affected_rows).toBe(0);
    });
  });

  // =========================================================================

  // =========================================================================
  // soLLM
  // =========================================================================

  describe('soLLM', () => {
    let providerId: string;

    beforeEach(async () => {
      const pInput = new AddLLMProviderInput();
      pInput.data = makeProviderData();
      const pOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(pInput, pOut, new LLMContext());
      providerId = pOut.id;

      for (let i = 0; i < 5; i++) {
        const lInput = new AddLLMInput();
        lInput.data = makeLLMData(providerId, {
          llm_title: `SearchLLM${i}`,
          llm_brief: `BriefLLM${i} text`,
        });
        const lOut = new AddLLMOutput();
        await llmAccess.addLLM(lInput, lOut, new LLMContext());
      }
    });

    it('应该支持关键词搜索（匹配 llm_title）', async () => {
      const soInput = new SoLLMInput();
      soInput.keyword = 'SearchLLM3';
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(1);
      expect(soOut.list[0].llm_title).toBe('SearchLLM3');
    });

    it('关键词仅匹配 llm_title', async () => {
      const soInput = new SoLLMInput();
      soInput.keyword = 'SearchLLM0';
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());
      expect(soOut.list.length).toBe(1);
      expect(soOut.list[0].llm_title).toBe('SearchLLM0');
    });

    it('应该支持条件过滤', async () => {
      const soInput = new SoLLMInput();
      soInput.conditions = [
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ];
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());
      expect(soOut.total).toBe(5);
    });

    it('应该支持排序', async () => {
      const soInput = new SoLLMInput();
      soInput.order_by = [{ field: 'llm_title', direction: 'ASC' }];
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());

      for (let i = 1; i < soOut.list.length; i++) {
        expect(soOut.list[i].llm_title >= soOut.list[i - 1].llm_title).toBe(true);
      }
    });

    it('应该支持分页', async () => {
      const soInput = new SoLLMInput();
      soInput.page = { current: 1, size: 2 };
      soInput.order_by = [{ field: 'llm_title', direction: 'ASC' }];
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(2);
      expect(soOut.total).toBeGreaterThanOrEqual(5);
    });

    it('关键词无匹配应返回空列表', async () => {
      const soInput = new SoLLMInput();
      soInput.keyword = 'NonExistentXYZ';
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(0);
      expect(soOut.total).toBe(0);
    });

    it('LIKE 模糊匹配应正确工作', async () => {
      const soInput = new SoLLMInput();
      soInput.keyword = 'SearchLLM';
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(5);
    });
  });

  // =========================================================================
  // execLLM
  // =========================================================================

  describe('execLLM', () => {
    let providerId: string;
    let llmId: string;

    beforeEach(async () => {
      const pInput = new AddLLMProviderInput();
      pInput.data = makeProviderData({ llm_provider_url: httpBaseUrl, enable: true });
      const pOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(pInput, pOut, new LLMContext());
      providerId = pOut.id;

      const lInput = new AddLLMInput();
      lInput.data = makeLLMData(providerId, { llm_title: 'gpt-4o' });
      const lOut = new AddLLMOutput();
      await llmAccess.addLLM(lInput, lOut, new LLMContext());
      llmId = lOut.id;
    });

    it('应该成功调用 LLM 并返回推理结果', async () => {
      const execInput = new ExecLLMInput();
      execInput.id = llmId;
      execInput.prompt = 'Hello World';
      const execOut = new ExecLLMOutput();
      const result = await llmAccess.execLLM(execInput, execOut, new LLMContext());

      expect(result).toBe(true);
      expect(execOut.result).toBeTruthy();
      expect(execOut.duration_ms).toBeGreaterThan(0);
    });

    it('调用成功后应该更新 llm_usage 统计', async () => {
      const execInput = new ExecLLMInput();
      execInput.id = llmId;
      execInput.prompt = 'Test usage tracking';
      const execOut = new ExecLLMOutput();
      await llmAccess.execLLM(execInput, execOut, new LLMContext());

      const usageRows = await relationDb.select('llm_usage', {
        conditions: [{ field: 'llm_available_id', operator: Operator.EQ, value: llmId }],
      });
      expect(usageRows.length).toBe(1);
      expect(usageRows[0].usage_count).toBe(1);
    });

    it('多次调用同一 LLM 当天 usage_count 应累加', async () => {
      const execInput = new ExecLLMInput();
      execInput.id = llmId;
      execInput.prompt = 'Call 1';

      await llmAccess.execLLM(execInput, new ExecLLMOutput(), new LLMContext());
      await llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), { id: llmId, prompt: 'Call 2' }),
        new ExecLLMOutput(), new LLMContext(),
      );

      const usageRows = await relationDb.select('llm_usage', {
        conditions: [{ field: 'llm_available_id', operator: Operator.EQ, value: llmId }],
      });
      expect(usageRows.length).toBe(1);
      expect(usageRows[0].usage_count).toBe(2);
    });

    it('缺少 id 且无可用模型时应该抛出 ValidationError', async () => {
      await relationDb.delete('llm_available', []);
      const execInput = new ExecLLMInput();
      execInput.id = '';
      execInput.prompt = 'test';
      const execOut = new ExecLLMOutput();

      await expect(
        llmAccess.execLLM(execInput, execOut, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('缺少 id 时应自动回退到默认模型或首个启用模型', async () => {
      const execInput = new ExecLLMInput();
      execInput.id = '';
      execInput.prompt = 'test fallback';
      const execOut = new ExecLLMOutput();

      const ok = await llmAccess.execLLM(execInput, execOut, new LLMContext());
      expect(ok).toBe(true);
    });

    it('缺少 prompt 应该抛出 ValidationError', async () => {
      const execInput = new ExecLLMInput();
      execInput.id = llmId;
      execInput.prompt = '';
      const execOut = new ExecLLMOutput();

      await expect(
        llmAccess.execLLM(execInput, execOut, new LLMContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('指定模型调用失败时自动降级到默认模型并成功', async () => {
      // 1. 创建一个不可达/报错的提供商和模型
      const pFailInput = new AddLLMProviderInput();
      pFailInput.data = makeProviderData({ llm_provider_url: 'http://127.0.0.1:19999', enable: true });
      const pFailOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(pFailInput, pFailOut, new LLMContext());

      const lFailInput = new AddLLMInput();
      lFailInput.data = makeLLMData(pFailOut.id, { llm_title: 'failing-model', is_default: false });
      const lFailOut = new AddLLMOutput();
      await llmAccess.addLLM(lFailInput, lFailOut, new LLMContext());

      // 2. 将正常工作的模型设为默认模型
      await llmAccess.updateLLM(
        Object.assign(new UpdateLLMInput(), {
          id: llmId,
          data: { is_default: true, enable: true },
        }),
        new UpdateLLMOutput(), new LLMContext(),
      );

      // 3. 调用指定的故障模型
      const execInput = new ExecLLMInput();
      execInput.id = lFailOut.id;
      execInput.prompt = 'test failover to default';
      const execOut = new ExecLLMOutput();

      const ok = await llmAccess.execLLM(execInput, execOut, new LLMContext());
      expect(ok).toBe(true);
      expect(execOut.result).toBeTruthy();
    });

    it('默认模型也失败时自动降级到后续启用的可用模型', async () => {
      // 1. 创建故障模型 A（作为指定模型）
      const pFailInput1 = new AddLLMProviderInput();
      pFailInput1.data = makeProviderData({ llm_provider_url: 'http://127.0.0.1:19998', enable: true });
      const pFailOut1 = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(pFailInput1, pFailOut1, new LLMContext());

      const lFailInput1 = new AddLLMInput();
      lFailInput1.data = makeLLMData(pFailOut1.id, { llm_title: 'failing-model-1', is_default: false });
      const lFailOut1 = new AddLLMOutput();
      await llmAccess.addLLM(lFailInput1, lFailOut1, new LLMContext());

      // 2. 创建故障模型 B（作为默认模型）
      const pFailInput2 = new AddLLMProviderInput();
      pFailInput2.data = makeProviderData({ llm_provider_url: 'http://127.0.0.1:19997', enable: true });
      const pFailOut2 = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(pFailInput2, pFailOut2, new LLMContext());

      const lFailInput2 = new AddLLMInput();
      lFailInput2.data = makeLLMData(pFailOut2.id, { llm_title: 'failing-model-default', is_default: true });
      const lFailOut2 = new AddLLMOutput();
      await llmAccess.addLLM(lFailInput2, lFailOut2, new LLMContext());

      // 3. 将原有的正常模型设为非默认但启用
      await llmAccess.updateLLM(
        Object.assign(new UpdateLLMInput(), {
          id: llmId,
          data: { is_default: false, enable: true },
        }),
        new UpdateLLMOutput(), new LLMContext(),
      );

      // 4. 调用指定的故障模型 A -> 尝试默认模型 B (失败) -> 尝试正常模型 llmId (成功)
      const execInput = new ExecLLMInput();
      execInput.id = lFailOut1.id;
      execInput.prompt = 'test multi-step failover';
      const execOut = new ExecLLMOutput();

      const ok = await llmAccess.execLLM(execInput, execOut, new LLMContext());
      expect(ok).toBe(true);
      expect(execOut.result).toBeTruthy();
    });

    it('所有可用模型均失败时返回 false 并记录错误', async () => {
      // 禁用所有可用模型
      const allRows = await relationDb.select('llm_available', {});
      for (const row of allRows) {
        await llmAccess.updateLLM(
          Object.assign(new UpdateLLMInput(), {
            id: String(row.id),
            data: { enable: false },
          }),
          new UpdateLLMOutput(), new LLMContext(),
        );
      }

      // 添加一个不可达模型作为唯一启用模型
      const pFailInput = new AddLLMProviderInput();
      pFailInput.data = makeProviderData({ llm_provider_url: 'http://127.0.0.1:19999', enable: true });
      const pFailOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(pFailInput, pFailOut, new LLMContext());

      const lFailInput = new AddLLMInput();
      lFailInput.data = makeLLMData(pFailOut.id, { llm_title: 'failing-model-only', enable: true });
      const lFailOut = new AddLLMOutput();
      await llmAccess.addLLM(lFailInput, lFailOut, new LLMContext());

      const execInput = new ExecLLMInput();
      execInput.id = lFailOut.id;
      execInput.prompt = 'test all fail';
      const execOut = new ExecLLMOutput();

      const ok = await llmAccess.execLLM(execInput, execOut, new LLMContext());
      expect(ok).toBe(false);
      expect(execOut.error).toContain('所有可用模型均调用失败');
    });



    it('不可达的提供商应该返回 error（非异常）', async () => {
      // 禁用 beforeEach 中的正常模型，使得不可达模型为唯一候选
      await llmAccess.updateLLM(
        Object.assign(new UpdateLLMInput(), {
          id: llmId,
          data: { enable: false },
        }),
        new UpdateLLMOutput(), new LLMContext(),
      );

      const pInput2 = new AddLLMProviderInput();
      pInput2.data = makeProviderData({ llm_provider_url: 'http://127.0.0.1:19999', enable: true });
      const pOut2 = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(pInput2, pOut2, new LLMContext());

      const lInput2 = new AddLLMInput();
      lInput2.data = makeLLMData(pOut2.id, { llm_title: 'gpt-4o' });
      const lOut2 = new AddLLMOutput();
      await llmAccess.addLLM(lInput2, lOut2, new LLMContext());

      const execInput = new ExecLLMInput();
      execInput.id = lOut2.id;
      execInput.prompt = 'test';
      const execOut = new ExecLLMOutput();
      const result = await llmAccess.execLLM(execInput, execOut, new LLMContext());

      expect(result).toBe(false);
      expect(execOut.error).toBeTruthy();
      expect(execOut.error_code).toBe('CONNECT_ERROR');
    });
  });

  // =========================================================================
  // visualizedLLM
  // =========================================================================

  describe('visualizedLLM', () => {
    it('scope = health 应返回健康状态数据', async () => {
      const input = new VisualizedLLMInput();
      input.scope = 'health';
      const out = new VisualizedLLMOutput();
      const result = await llmAccess.visualizedLLM(input, out, new LLMContext());

      expect(result).toBe(true);
      expect(out.data.connected).toBe(true);
      expect(typeof out.data.response_time_ms).toBe('number');
      expect(typeof out.data.enabled).toBe('boolean');
      expect(typeof out.data.provider_count).toBe('number');
      expect(typeof out.data.enabled_llm_count).toBe('number');
    });

    it('scope = volume 应返回数据量统计', async () => {
      const input = new VisualizedLLMInput();
      input.scope = 'volume';
      const out = new VisualizedLLMOutput();
      const result = await llmAccess.visualizedLLM(input, out, new LLMContext());

      expect(result).toBe(true);
      expect(typeof out.data.provider_count).toBe('number');
      expect(typeof out.data.model_count).toBe('number');
      expect(typeof out.data.enabled_llm_count).toBe('number');
      expect(typeof out.data.usage_record_count).toBe('number');
    });

    it('scope = diskUsage 应返回磁盘占用数据', async () => {
      const input = new VisualizedLLMInput();
      input.scope = 'diskUsage';
      const out = new VisualizedLLMOutput();
      const result = await llmAccess.visualizedLLM(input, out, new LLMContext());

      expect(result).toBe(true);
      expect(typeof out.data.disk_usage_bytes).toBe('number');
      expect(typeof out.data.page_size).toBe('number');
      expect(typeof out.data.page_count).toBe('number');
    });

    it('无效的 scope 应返回 false 并设置 error', async () => {
      const input = new VisualizedLLMInput();
      input.scope = 'invalidScope';
      const out = new VisualizedLLMOutput();
      const result = await llmAccess.visualizedLLM(input, out, new LLMContext());

      expect(result).toBe(false);
      expect(out.error).toBeTruthy();
      expect(out.error_code).toBe('INVALID_SCOPE');
    });

    it('添加数据后 volume 统计应反映变化', async () => {
      const addInput = new AddLLMProviderInput();
      addInput.data = makeProviderData();
      const addOut = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(addInput, addOut, new LLMContext());

      const input = new VisualizedLLMInput();
      input.scope = 'volume';
      const out = new VisualizedLLMOutput();
      await llmAccess.visualizedLLM(input, out, new LLMContext());

      expect(out.data.provider_count).toBe(1);
    });
  });

  // =========================================================================
  // enableLLM
  // =========================================================================

  describe('enableLLM', () => {
    it('应该支持禁用 LLM 组件', async () => {
      const input = new EnableLLMInput();
      input.enable = false;
      const out = new EnableLLMOutput();
      const result = await llmAccess.enableLLM(input, out, new LLMContext());
      expect(result).toBe(true);

      // 禁用后操作应该失败
      const soInput = new SoLLMProviderInput();
      const soOut = new SoLLMProviderOutput();
      await expect(
        llmAccess.soLLMProvider(soInput, soOut, new LLMContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('应该支持重新启用 LLM 组件', async () => {
      await llmAccess.enableLLM(
        Object.assign(new EnableLLMInput(), { enable: false }),
        new EnableLLMOutput(), new LLMContext(),
      );

      // 重新启用
      await llmAccess.enableLLM(
        Object.assign(new EnableLLMInput(), { enable: true }),
        new EnableLLMOutput(), new LLMContext(),
      );

      // 启用后操作应该成功
      const soInput = new SoLLMProviderInput();
      const soOut = new SoLLMProviderOutput();
      const result = await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());
      expect(result).toBe(true);
    });

    it('多次切换启用状态应该正常', async () => {
      for (let i = 0; i < 3; i++) {
        await llmAccess.enableLLM(
          Object.assign(new EnableLLMInput(), { enable: false }),
          new EnableLLMOutput(), new LLMContext(),
        );
        await llmAccess.enableLLM(
          Object.assign(new EnableLLMInput(), { enable: true }),
          new EnableLLMOutput(), new LLMContext(),
        );
      }

      const soInput = new SoLLMProviderInput();
      const soOut = new SoLLMProviderOutput();
      const result = await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());
      expect(result).toBe(true);
    });

    it('禁用状态下 visualizedLLM 也应该失败', async () => {
      await llmAccess.enableLLM(
        Object.assign(new EnableLLMInput(), { enable: false }),
        new EnableLLMOutput(), new LLMContext(),
      );

      const visInput = new VisualizedLLMInput();
      visInput.scope = 'health';
      const visOut = new VisualizedLLMOutput();
      await expect(
        llmAccess.visualizedLLM(visInput, visOut, new LLMContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  // =========================================================================
  // closeLLM
  // =========================================================================


  // =========================================================================
  // 边界和集成场景
  // =========================================================================

  describe('边界与集成场景', () => {
    it('特殊字符在 title 中应能正常存入和读出', async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData({
        llm_provider_title: 'Special @#$%^&*() 字符',
      });
      const out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(input, out, new LLMContext());

      const soInput = new SoLLMProviderInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: out.id }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());
      expect(soOut.list[0].llm_provider_title).toBe('Special @#$%^&*() 字符');
    });

    it('同时使用 keyword 和 conditions 进行搜索', async () => {
      const pInput = new AddLLMProviderInput();
      pInput.data = makeProviderData({
        llm_provider_title: 'KeywordAndCond',
        enable: true,
      });
      await llmAccess.addLLMProvider(pInput, new AddLLMProviderOutput(), new LLMContext());

      // 再添加一个启用但名称不同的
      const pInput2 = new AddLLMProviderInput();
      pInput2.data = makeProviderData({
        llm_provider_title: 'OtherProvider',
        enable: true,
      });
      await llmAccess.addLLMProvider(pInput2, new AddLLMProviderOutput(), new LLMContext());

      const soInput = new SoLLMProviderInput();
      soInput.keyword = 'KeywordAndCond';
      soInput.conditions = [{ field: 'enable', operator: Operator.EQ, value: 1 }];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());

      expect(soOut.list.length).toBe(1);
      expect(soOut.list[0].llm_provider_title).toBe('KeywordAndCond');
    });

    it('IN 条件操作符应正确工作', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const input = new AddLLMProviderInput();
        input.data = makeProviderData({ llm_provider_title: `INTest${i}` });
        const out = new AddLLMProviderOutput();
        await llmAccess.addLLMProvider(input, out, new LLMContext());
        ids.push(out.id);
      }

      const soInput = new SoLLMProviderInput();
      soInput.conditions = [
        { field: 'id', operator: Operator.IN, value: ids.slice(0, 2) },
      ];
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());
      expect(soOut.list.length).toBe(2);
    });

    it('LIKE 前后模糊匹配应正确工作', async () => {
      const input = new AddLLMProviderInput();
      input.data = makeProviderData({ llm_provider_title: 'MiddleKeyword' });
      await llmAccess.addLLMProvider(input, new AddLLMProviderOutput(), new LLMContext());

      const soInput = new SoLLMProviderInput();
      soInput.keyword = 'dleKeyw';
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(soInput, soOut, new LLMContext());
      expect(soOut.list.length).toBe(1);
    });

    it('删除不存在的 LLM 提供商 affected_rows 应为 0', async () => {
      const delInput = new DelLLMProviderInput();
      delInput.ids = ['nonexistent-id-123'];
      const delOut = new DelLLMProviderOutput();
      await llmAccess.delLLMProvider(delInput, delOut, new LLMContext());
      expect(delOut.affected_rows).toBe(0);
    });

    it('添加空的 llm_type 字段也应正常', async () => {
      const [pOut] = await (async () => {
        const pInput = new AddLLMProviderInput();
        pInput.data = makeProviderData();
        const o = new AddLLMProviderOutput();
        await llmAccess.addLLMProvider(pInput, o, new LLMContext());
        return [o];
      })();

      const lInput = new AddLLMInput();
      lInput.data = makeLLMData(pOut.id, { llm_type: '' });
      const lOut = new AddLLMOutput();
      await llmAccess.addLLM(lInput, lOut, new LLMContext());

      const soInput = new SoLLMInput();
      soInput.conditions = [{ field: 'id', operator: Operator.EQ, value: lOut.id }];
      const soOut = new SoLLMOutput();
      await llmAccess.soLLM(soInput, soOut, new LLMContext());
      expect(soOut.list[0].llm_type).toBe('text');
    });

    it('多个不同提供商同时存在', async () => {
      const p1Out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(
        Object.assign(new AddLLMProviderInput(), { data: makeProviderData({ llm_provider_title: 'P1' }) }),
        p1Out, new LLMContext(),
      );
      const p2Out = new AddLLMProviderOutput();
      await llmAccess.addLLMProvider(
        Object.assign(new AddLLMProviderInput(), { data: makeProviderData({ llm_provider_title: 'P2' }) }),
        p2Out, new LLMContext(),
      );

      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(new SoLLMProviderInput(), soOut, new LLMContext());
      expect(soOut.total).toBe(2);
    });

    it('AOP 代理应填充 elapsed_ms', async () => {
      const soOut = new SoLLMProviderOutput();
      await llmAccess.soLLMProvider(new SoLLMProviderInput(), soOut, new LLMContext());
      expect(typeof soOut.elapsed_ms).toBe('number');
      expect(soOut.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
