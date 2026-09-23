import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  RelationDBAccess,
  PromptsAccess,
  LLMAccess,
  MCPAccess,
  ExecMcpInput,
  ExecMcpOutput,
  McpContext,
  type LLMAccess as LLMAccessType,
} from '@brian-agent/base';
import {
  McpCoreContext,
  MatchMcpInput,
  MatchMcpOutput,
} from '../MCPCoreProvider';
import { MCPCoreAccess } from '../MCPCoreProvider';

/**
 * MCPCore 全真链路联测（opt-in：BRIAN_LIVE_MCPCORE=1）：
 * 拷贝真实业务库 → 真实 MCPCoreAccess + 真实 LLM → matchMCP("在 GitHub 上查找当前 star 最多的模型仓库")
 * 四层瀑布 → github provider（npm registry 市场）清单 → LLM 市场选型 @modelcontextprotocol/server-github →
 * installMcp（npm install -g）+ startMcp（stdio）→ execMcp search_repositories → GitHub star 最多的模型仓库。
 *
 * 注意：需清代理环境变量运行（代理对 GitHub 域不通，直连正常，见 [2026-09-22q]）。
 */

const LIVE = process.env.BRIAN_LIVE_MCPCORE === '1';
const REAL_DB = path.resolve(__dirname, '../../data/brian.db');

/** LLM 调用追踪（打印 caller / max_tokens / 原始输出） */
function traceLlm(llm: LLMAccessType): LLMAccessType {
  let seq = 0;
  return new Proxy(llm, {
    get(target, prop, receiver) {
      if (prop !== 'execLLM' && prop !== 'embedLLM') return Reflect.get(target, prop, receiver);
      const method = prop as string;
      return async (input: unknown, output: { result?: string; embedding?: number[] }, ctx?: unknown) => {
        const fn = target as unknown as Record<string, (i: unknown, o: unknown, c: unknown) => Promise<boolean>>;
        const ok = await fn[method](input, output, ctx);
        if (method === 'execLLM') {
          const n = ++seq;
          console.log(`[LLM#${n}] caller=${(input as { caller?: string }).caller ?? '?'} max_tokens=${(input as { max_tokens?: number }).max_tokens ?? '?'}`);
          console.log(`[LLM#${n} result]`, String(output.result ?? '').slice(0, 500));
        }
        return ok;
      };
    },
  });
}

describe.skipIf(!LIVE)('MCPCore 全真瀑布：GitHub MCP 市场获取 + star 最多模型检索（BRIAN_LIVE_MCPCORE=1）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let mcpAccess: MCPAccess;
  let mcpCore: MCPCoreAccess;
  const taskId = `demo-${Date.now()}`;

  beforeAll(async () => {
    if (!fs.existsSync(REAL_DB)) throw new Error(`真实库不存在: ${REAL_DB}`);
    tempDir = fs.mkdtempSync('/tmp/opencode/mcpcore-github-');
    for (const suffix of ['', '-wal', '-shm']) {
      const src = REAL_DB + suffix;
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tempDir, 'brian.db') + suffix);
    }
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'brian.db') });
    await relationDb.initialize();
    const promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    mcpAccess = new MCPAccess(relationDb);
    const llmAccess = new LLMAccess(relationDb, undefined, promptsAccess);
    await llmAccess.initialize();
    mcpCore = new MCPCoreAccess(relationDb, mcpAccess, traceLlm(llmAccess), promptsAccess);
    // 副本内清空显式模板配置（真实库指向用户旧契约模板，见 [2026-09-22r]）；真实库不改动
    await relationDb.update('mcp_core_config', [
      { field: 'prompt_template_id', value: '' },
      { field: 'updated', value: Date.now() },
    ], []);
  }, 120000);

  afterAll(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('matchMCP 瀑布 → 市场安装 GitHub MCP → execMcp 检索 star 最多的模型仓库', async () => {
    // ===== 调用 MCPCore：四层瀑布匹配 + 市场获取 =====
    const input = new MatchMcpInput();
    input.agent_id = 'demo-agent';
    input.context_id = taskId;
    input.run_id = taskId;
    input.task_content = '在 GitHub 上查找当前 star 最多的模型仓库，需要 GitHub API 检索能力';
    const output = new MatchMcpOutput();
    const t0 = Date.now();
    const ok = await mcpCore.matchMCP(input, output, new McpCoreContext());
    console.log(`[matchMCP] ok=${ok} 耗时 ${Date.now() - t0}ms, mcp_ids=${JSON.stringify(output.mcp_ids)}`);
    expect(ok).toBe(true);
    expect(output.mcp_ids.length).toBeGreaterThanOrEqual(1);

    const mcpId = output.mcp_ids[0];
    console.log(`[安装完成] mcp_install id=${mcpId}`);

    // ===== execMcp：调用 GitHub MCP 的 search_repositories =====
    const execInput = new ExecMcpInput();
    execInput.id = mcpId;
    execInput.tool_name = 'search_repositories';
    execInput.params = { query: 'model sort:stars', perPage: 5 };
    const execOutput = new ExecMcpOutput();
    const t1 = Date.now();
    const execOk = await mcpAccess.execMcp(execInput, execOutput, new McpContext());
    console.log(`[execMcp] ok=${execOk} 耗时 ${Date.now() - t1}ms`);
    expect(execOk).toBe(true);

    const resultText = JSON.stringify(execOutput.result ?? {});
    console.log('[GitHub MCP 检索结果]', resultText.slice(0, 1200));
    const resultObj = execOutput.result as Record<string, unknown>;
    expect(resultObj?.['error']).toBeUndefined();
    const content = resultObj?.['content'] as Array<{ type?: string; text?: string }> | undefined;
    expect(Array.isArray(content)).toBe(true);
    const firstText = String(content?.[0]?.text ?? '');
    expect(firstText.length).toBeGreaterThan(0);
    console.log('[MCP 工具文本输出前 800 字]', firstText.slice(0, 800));
    // 仓库名与 star 数出现在结果中（top1 即当前 star 最多的 model 相关仓库）
    expect(firstText).toMatch(/full_name|name/);
  }, 300000);
});
