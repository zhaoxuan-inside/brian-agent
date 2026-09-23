import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  PromptsAccess,
  IdGenerator,
  AddPromptInput,
  AddPromptOutput,
  PromptContext,
  SoMcpProviderInput,
  SoMcpProviderOutput,
  ListMcpInput,
  ListMcpOutput,
  InstallMcpInput,
  InstallMcpOutput,
  StartMcpInput,
  StartMcpOutput,
  SoMcpInput,
  SoMcpOutput,
  GetMcpDetailsInput,
} from '@brian-agent/base';
import type { MCPAccess } from '@brian-agent/base';
import {
  McpCoreContext,
  MatchMcpInput,
  MatchMcpOutput,
  ConfigMcpCoreInput,
  ConfigMcpCoreOutput,
  MCP_CORE_CONFIG_TABLE,
  AGENT_MCP_USAGE_TABLE,
} from '../MCPCoreProvider';
import { MCPCoreService } from '../MCPCoreProvider/application/MCPCoreService';

describe('MCPCoreService 四层瀑布（need 判定合并 / 负缓存 / 提供商市场获取）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let promptsAccess: PromptsAccess;
  let ctx: McpCoreContext;

  function stubLlm(responses: string[]): any {
    let call = 0;
    return {
      execLLM: async (_input: unknown, output: { result?: string }) => {
        output.result = responses[Math.min(call++, responses.length - 1)];
        return true;
      },
      embedLLM: async (_input: unknown, output: { embedding?: number[] }) => {
        output.embedding = [0.1, 0.2, 0.3];
        return true;
      },
    };
  }

  /** MCPAccess stub：本地无可用 MCP + 单提供商市场清单 + 安装/启动记录 */
  function stubMcpAccess(opts: { installId?: string; marketEmpty?: boolean } = {}): { access: MCPAccess; calls: Record<string, number> } {
    const calls = { install: 0, start: 0 };
    const access = {
      soMcp: async (_i: unknown, o: SoMcpOutput) => { o.list = []; return true; },
      soMcpProvider: async (_i: SoMcpProviderInput, o: SoMcpProviderOutput) => {
        o.list = opts.marketEmpty ? [] : [{ id: 'prov-1', provider_code: 'github', mcp_provider_url: 'https://market.example', enable: true } as any];
        return true;
      },
      listMcp: async (_i: ListMcpInput, o: ListMcpOutput) => {
        o.list = opts.marketEmpty ? [] : [
          { id: 'cache-1', mcp_provider_id: 'prov-1', mcp_title: 'weather-mcp', mcp_brief: '天气查询工具' },
        ] as any[];
        return true;
      },
      installMcp: async (_i: InstallMcpInput, o: InstallMcpOutput) => { calls.install++; o.id = opts.installId ?? 'installed-1'; return true; },
      startMcp: async (_i: StartMcpInput, _o: StartMcpOutput) => { calls.start++; return true; },
      getMcp: async (_i: unknown, o: { mcp: unknown }) => { o.mcp = null; return true; },
    } as unknown as MCPAccess;
    return { access, calls };
  }

  function matchInput(taskContent: string): MatchMcpInput {
    const input = new MatchMcpInput();
    input.agent_id = 'a1';
    input.context_id = 'c1';
    input.run_id = 'r1';
    input.task_content = taskContent;
    return input;
  }

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-mcp-falls-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db') });
    await relationDb.initialize();
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${MCP_CORE_CONFIG_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "regen_rate" INTEGER NOT NULL DEFAULT 75,
        "similarity_threshold" REAL NOT NULL DEFAULT 0.7,
        "prompt_template_id" TEXT NOT NULL DEFAULT '',
        "score_threshold" INTEGER NOT NULL DEFAULT 90,
        "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8,
        "match_cache_ttl_ms" INTEGER NOT NULL DEFAULT 600000,
        "match_cache_capacity" INTEGER NOT NULL DEFAULT 500,
        "market_install_enabled" INTEGER NOT NULL DEFAULT 1
      )
    `);
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${AGENT_MCP_USAGE_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "agent_id" TEXT NOT NULL,
        "mcp_id" TEXT NOT NULL,
        "usage_date" TEXT NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 1
      )
    `);
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    ctx = new McpCoreContext();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  /** 种子化一条 Prompt 模板（市场模板 LIKE '%MCP 市场%' 回退 anyRow 兜底用） */
  async function seedTemplate(): Promise<void> {
    const addInput = new AddPromptInput();
    addInput.data = {
      prompt_template_title: 'Test 市场模板',
      prompt_template: 'task: {{task_content}} mcps: {{available_mcps}}',
    };
    const addOutput = new AddPromptOutput();
    await promptsAccess.addPrompt(addInput, addOutput, new PromptContext());
    return;
  }

  it('need=false → 返回空 + 负缓存（第二次调用零 LLM）', async () => {
    await seedTemplate();
    const execLlm = vi.fn(async (_i: unknown, o: { result?: string }) => { o.result = '{"need": false, "keywords": [], "candidates": []}'; return true; });
    const llm = { execLLM: execLlm, embedLLM: async (_i: unknown, o: { embedding?: number[] }) => { o.embedding = [0.1]; return true; } };
    const { access: mcpAccess } = stubMcpAccess();
    const service = new MCPCoreService(relationDb, mcpAccess, llm, promptsAccess);

    const out1 = new MatchMcpOutput();
    await service.matchMCP(matchInput('你好'), out1, ctx);
    expect(out1.mcp_ids).toEqual([]);

    const out2 = new MatchMcpOutput();
    await service.matchMCP(matchInput('你好'), out2, ctx);
    expect(out2.mcp_ids).toEqual([]);
    expect(execLlm).toHaveBeenCalledTimes(1);
  });

  it('市场层：need=true 本地无命中 → listMcp 汇总候选 → LLM 选型 → installMcp + startMcp', async () => {
    await seedTemplate();
    const execLlm = vi.fn(async (_i: unknown, o: { result?: string }) => { o.result = '[{"id": "cache-1", "score": 95}]'; return true; });
    const llm = { execLLM: execLlm, embedLLM: async (_i: unknown, o: { embedding?: number[] }) => { o.embedding = [0.1]; return true; } };
    const { access: mcpAccess, calls } = stubMcpAccess();
    const service = new MCPCoreService(relationDb, mcpAccess, llm, promptsAccess);

    const out = new MatchMcpOutput();
    await service.matchMCP(matchInput('需要查天气'), out, ctx);
    expect(out.mcp_ids).toEqual(['installed-1']);
    expect(calls.install).toBe(1);
    expect(calls.start).toBe(1);
  });

  it('market_install_enabled=false → 市场层跳过，返回空', async () => {
    await seedTemplate();
    const configInput = new ConfigMcpCoreInput();
    configInput.market_install_enabled = false;
    const bootstrap = new MCPCoreService(relationDb, stubMcpAccess().access, stubLlm(['{"need": false, "keywords": [], "candidates": []}']), promptsAccess);
    await bootstrap.configMCPCore(configInput, new ConfigMcpCoreOutput(), ctx);

    const execLlm = vi.fn(async (_i: unknown, o: { result?: string }) => { o.result = '{"need": true, "keywords": [], "candidates": []}'; return true; });
    const llm = { execLLM: execLlm, embedLLM: async (_i: unknown, o: { embedding?: number[] }) => { o.embedding = [0.1]; return true; } };
    const { access: mcpAccess, calls } = stubMcpAccess();
    const service = new MCPCoreService(relationDb, mcpAccess, llm, promptsAccess);

    const out = new MatchMcpOutput();
    await service.matchMCP(matchInput('需要查天气'), out, ctx);
    expect(out.mcp_ids).toEqual([]);
    expect(calls.install).toBe(0);
  });

  it('市场清单为空 → 返回空（不抛错）', async () => {
    await seedTemplate();
    const llm = stubLlm(['{"need": true, "keywords": [], "candidates": []}']);
    const { access: mcpAccess } = stubMcpAccess({ marketEmpty: true });
    const service = new MCPCoreService(relationDb, mcpAccess, llm, promptsAccess);

    const out = new MatchMcpOutput();
    await service.matchMCP(matchInput('需要查天气'), out, ctx);
    expect(out.mcp_ids).toEqual([]);
  });
});
