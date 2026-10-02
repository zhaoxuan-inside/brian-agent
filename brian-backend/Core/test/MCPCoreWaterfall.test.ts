import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  PromptsAccess,
  IdGenerator,
  SoMcpInput,
  SoMcpOutput,
} from '@brian-agent/base';
import { TraceSchemaInitializer } from '@brian-agent/base';
import type { MCPAccess } from '@brian-agent/base';
import {
  McpCoreContext,
  MatchMcpInput,
  MatchMcpOutput,
  ConfigMcpCoreInput,
  ConfigMcpCoreOutput,
  MCP_CORE_CONFIG_TABLE,
} from '../MCPCoreProvider';
import { MCPCoreService } from '../MCPCoreProvider/application/MCPCoreService';

describe('MCPCoreService 两级漏斗匹配（所有安装MCP候选 + BM25过滤 + 向量过滤，免 LLM）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let promptsAccess: PromptsAccess;
  let ctx: McpCoreContext;

  function stubMcpAccess(installedMcps: any[] = []): { access: MCPAccess } {
    const access = {
      soMcp: async (_i: unknown, o: SoMcpOutput) => { o.list = installedMcps; return true; },
      getMcp: async (_i: unknown, o: { mcp: unknown }) => { o.mcp = null; return true; },
    } as unknown as MCPAccess;
    return { access };
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
    new TraceSchemaInitializer(relationDb).init();
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${MCP_CORE_CONFIG_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "regen_rate" INTEGER NOT NULL DEFAULT 75,
        "similarity_threshold" REAL NOT NULL DEFAULT 0.7,
        "prompt_template_id" TEXT NOT NULL DEFAULT '',
        "score_threshold" INTEGER NOT NULL DEFAULT 20,
        "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.6,
        "match_cache_ttl_ms" INTEGER NOT NULL DEFAULT 600000,
        "match_cache_capacity" INTEGER NOT NULL DEFAULT 500,
        "market_install_enabled" INTEGER NOT NULL DEFAULT 1
      )
    `);
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    ctx = new McpCoreContext();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch {  }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {  }
  });

  it('候选集通过 BM25 与向量两级过滤成功匹配已安装 MCP（零 LLM 调用）', async () => {
    const execLlm = vi.fn();
    const embedLlm = vi.fn(async (i: any, o: { embedding?: number[] }) => {
      o.embedding = i.input.includes('weather') ? [1, 0, 0] : [0, 1, 0];
      return true;
    });
    const llm = { execLLM: execLlm, embedLLM: embedLlm };
    const { access: mcpAccess } = stubMcpAccess([
      { id: 'mcp-weather', mcp_title: 'weather', mcp_brief: '面向气象查询，接收城市名称，查询天气数据，输出天气报告。', enable: 1 },
      { id: 'mcp-memory', mcp_title: 'memory', mcp_brief: '面向长期记忆管理，接收会话关键事实与实体关系，构建知识图谱，输出关联记忆。', enable: 1 },
    ]);
    const service = new MCPCoreService(relationDb, mcpAccess, llm as any, promptsAccess);
    await service.configMCPCore(
      { regen_rate: 0, score_threshold: 20, vector_similarity_threshold: 0.6 } as ConfigMcpCoreInput,
      new ConfigMcpCoreOutput(),
      ctx,
    );

    const out1 = new MatchMcpOutput();
    await service.matchMCP(matchInput('weather query'), out1, ctx);
    expect(out1.mcp_ids).toEqual(['mcp-weather']);
    expect(out1.detail).toBe('election_mcp_t1');
    expect(execLlm).toHaveBeenCalledTimes(0);

    // 第二次调用直接命中正向缓存
    const out2 = new MatchMcpOutput();
    await service.matchMCP(matchInput('weather query'), out2, ctx);
    expect(out2.mcp_ids).toEqual(['mcp-weather']);
    expect(out2.detail).toBe('election_mcp_reuse');
    expect(execLlm).toHaveBeenCalledTimes(0);
  });

  it('语义路由器评分低于阈值剔除候选集 → 返回空并记录负缓存（零 LLM 调用）', async () => {
    const execLlm = vi.fn();
    const embedLlm = vi.fn(async (i: any, o: { embedding?: number[] }) => {
      o.embedding = (i.input && i.input.includes('笑话')) ? [1, 0, 0] : [0, 1, 0];
      return true;
    });
    const llm = { execLLM: execLlm, embedLLM: embedLlm };
    const { access: mcpAccess } = stubMcpAccess([
      { id: 'mcp-subway', mcp_title: 'SubwayInfo', mcp_brief: '面向城市交通查询，接收纽约地铁线路与车站名称，实时查询运行状态，输出到站提醒。', enable: 1 },
    ]);
    const service = new MCPCoreService(relationDb, mcpAccess, llm as any, promptsAccess);

    const out1 = new MatchMcpOutput();
    await service.matchMCP(matchInput('你好，讲个笑话'), out1, ctx);
    expect(out1.mcp_ids).toEqual([]);
    expect(out1.detail).toBe('mcp_exhausted');
    expect(execLlm).toHaveBeenCalledTimes(0);

    // 第二次调用直接命中负缓存
    const out2 = new MatchMcpOutput();
    await service.matchMCP(matchInput('你好，讲个笑话'), out2, ctx);
    expect(out2.mcp_ids).toEqual([]);
    expect(out2.detail).toBe('mcp_exhausted');
    expect(execLlm).toHaveBeenCalledTimes(0);
  });

  it('候选集为空时直接返回空并记录负缓存', async () => {
    const execLlm = vi.fn();
    const llm = { execLLM: execLlm, embedLLM: async (_i: any, o: any) => { o.embedding = [0.1]; return true; } };
    const { access: mcpAccess } = stubMcpAccess([]);
    const service = new MCPCoreService(relationDb, mcpAccess, llm as any, promptsAccess);

    const out = new MatchMcpOutput();
    await service.matchMCP(matchInput('需要查天气'), out, ctx);
    expect(out.mcp_ids).toEqual([]);
    expect(out.detail).toBe('mcp_exhausted');
    expect(execLlm).toHaveBeenCalledTimes(0);
  });
});
