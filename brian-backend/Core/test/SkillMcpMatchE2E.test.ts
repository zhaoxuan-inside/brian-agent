import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  SkillAccess,
  PromptsAccess,
  PromptCatalogAccess,
  AddSkillOutput,
  SkillContext,
  SoSkillOutput,
  SoMcpProviderInput,
  SoMcpProviderOutput,
  ListMcpInput,
  ListMcpOutput,
  InstallMcpInput,
  InstallMcpOutput,
  StartMcpInput,
  StartMcpOutput,
  SoMcpOutput,
  type LLMAccess,
} from '@brian-agent/base';
import { TraceSchemaInitializer } from '@brian-agent/base';
import type { MCPAccess } from '@brian-agent/base';
import {
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
  SKILL_CORE_CONFIG_TABLE,
  SKILL_OPT_RULE_TABLE,
  type GitHubSkillClient,
  type ParsedSkillMd,
} from '../SkillCoreProvider';
import { SkillCoreService } from '../SkillCoreProvider/application/SkillCoreService';
import {
  McpCoreContext,
  MatchMcpInput,
  MatchMcpOutput,
  ConfigMcpCoreInput,
  ConfigMcpCoreOutput,
  MCP_CORE_CONFIG_TABLE,
} from '../MCPCoreProvider';
import { MCPCoreService } from '../MCPCoreProvider/application/MCPCoreService';

function makeLlm(responses: string[]): { llm: LLMAccess; prompts: string[]; execLlm: ReturnType<typeof vi.fn> } {
  const prompts: string[] = [];
  let call = 0;
  const execLlm = vi.fn(async (input: unknown, output: { result?: string }) => {
    prompts.push((input as { prompt?: string }).prompt ?? '');
    output.result = responses[Math.min(call++, responses.length - 1)];
    return true;
  });
  const llm = {
    execLLM: execLlm,
    embedLLM: async (_i: unknown, o: { embedding?: number[] }) => { o.embedding = [0.1, 0.2, 0.3]; return true; },
  } as unknown as LLMAccess;
  return { llm, prompts, execLlm };
}

function stubGithub(hits: unknown[], parsed: ParsedSkillMd | null): GitHubSkillClient {
  return {
    searchSkills: vi.fn().mockResolvedValue(hits),
    fetchSkillMd: vi.fn().mockResolvedValue(parsed),
  } as unknown as GitHubSkillClient;
}

function expectNoPlaceholder(prompt: string): void {
  expect(prompt).not.toContain('{{');
}

describe('Skill 匹配链路（真实 builtin 模板种子 + 标题回退）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let skillAccess: SkillAccess;
  let promptsAccess: PromptsAccess;
  let ctx: SkillCoreContext;

  function matchInput(taskContent: string): MatchSkillInput {
    const input = new MatchSkillInput();
    input.agent_id = 'a1';
    input.context_id = 'c1';
    input.run_id = 'r1';
    input.task_content = taskContent;
    return input;
  }

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-skill-e2e-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db') });
    await relationDb.initialize();
    new TraceSchemaInitializer(relationDb).init();

    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_CORE_CONFIG_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "regen_rate" INTEGER NOT NULL DEFAULT 75,
        "prompt_template_id" TEXT NOT NULL DEFAULT '',
        "github_token" TEXT NOT NULL DEFAULT '',
        "github_search_enabled" INTEGER NOT NULL DEFAULT 1,
        "auto_generate_enabled" INTEGER NOT NULL DEFAULT 1
      )
    `);
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_OPT_RULE_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "days" INTEGER NOT NULL,
        "min_usage_count" INTEGER NOT NULL
      )
    `);
    skillAccess = new SkillAccess(relationDb);
    await skillAccess.initialize();
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();

    await new PromptCatalogAccess(relationDb).seed();
    ctx = new SkillCoreContext();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch {  }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {  }
  });

  it('闲聊任务：回退命中 builtin Skill 匹配排序 → task_content 渲染进 prompt → need=false 负缓存', async () => {
    const { llm, prompts, execLlm } = makeLlm(['{"need": false, "keywords": [], "candidates": []}']);
    const github = stubGithub([], null);
    const service = new SkillCoreService(relationDb, skillAccess, llm, promptsAccess, github);

    const out1 = new MatchSkillOutput();
    await service.matchSkill(matchInput('你好，今天心情不错'), out1, ctx);
    expect(out1.skills).toEqual([]);

    expect(prompts[0]).toContain('Skill 匹配评估助手');
    expect(prompts[0]).toContain('今天心情不错');
    expectNoPlaceholder(prompts[0]);
    expect(github.searchSkills).not.toHaveBeenCalled();

    const out2 = new MatchSkillOutput();
    await service.matchSkill(matchInput('你好，今天心情不错'), out2, ctx);
    expect(out2.skills).toEqual([]);
    expect(execLlm).toHaveBeenCalledTimes(2);
  });

  it('本地命中：need=true + 候选过阈值 → 返回本地 Skill（prompt 含候选 brief 与任务）', async () => {
    const addOut = new AddSkillOutput();
    await skillAccess.addSkill({ data: { name: 'weather-skill', skill_brief: '查询天气并用中文总结', skill_md: '# weather', enable: true } } as never, addOut, new SkillContext());
    const { llm, prompts } = makeLlm([`{"need": true, "keywords": ["weather"], "candidates": [{"id": "${addOut.id}", "score": 96}]}`]);
    const service = new SkillCoreService(relationDb, skillAccess, llm, promptsAccess, stubGithub([], null));

    const out = new MatchSkillOutput();
    const forcedInput = matchInput('查一下北京天气');
    forcedInput.bypass_cache = true;
    await service.matchSkill(forcedInput, out, ctx);
    expect(out.skills).toHaveLength(1);
    expect(out.skills[0].skill_id).toBe(addOut.id);
    expect(out.detail).toBe('election_skill_t1');
    expect(prompts.length).toBe(0); // R8 统一选举：T1 阶梯命中直接采纳，零 LLM 调用（裁判链见下一用例）
  });

  it('回退防劫持：用户同标题模板（is_system=0）存在时仍优先 builtin 契约模板', async () => {

    const userInput = new (await import('@brian-agent/base')).AddPromptInput();
    userInput.data = {
      prompt_template_title: '我的 Skill 匹配规则',
      prompt_template: '旧契约：请输出 [{"brief": "...", "relevance": 0.9}]，task={{task_content}}',
    };
    const userOutput = new (await import('@brian-agent/base')).AddPromptOutput();
    await promptsAccess.addPrompt(userInput, userOutput, new (await import('@brian-agent/base')).PromptContext());

    const { llm, prompts } = makeLlm(['{"need": false, "keywords": [], "candidates": []}']);
    const service = new SkillCoreService(relationDb, skillAccess, llm, promptsAccess, stubGithub([], null));
    const out = new MatchSkillOutput();
    await service.matchSkill(matchInput('随便聊聊'), out, ctx);
    expect(out.skills).toEqual([]);

    expect(prompts[0]).toContain('Skill 匹配评估助手');
    expect(prompts[0]).not.toContain('旧契约');
    expectNoPlaceholder(prompts[0]);
  });

  it('GitHub 导入：keywords 来自 LLM 输出 → searchSkills → frontmatter 解析入库 enable=true', async () => {
    const github = stubGithub([{ repo: 'o/r', path: 'SKILL.md', branch: 'main' }], { name: 'html-report', skill_brief: '生成 HTML 报告', skill_md: '# html report' });
    const { llm, prompts } = makeLlm(['{"need": true, "keywords": ["html", "report"], "candidates": []}']);
    const service = new SkillCoreService(relationDb, skillAccess, llm, promptsAccess, github);

    const out = new MatchSkillOutput();
    await service.matchSkill(matchInput('生成一份周报页面'), out, ctx);
    expect(out.skills).toHaveLength(1);
    expect(out.skills[0].skill_brief).toBe('生成 HTML 报告');

    expect(github.searchSkills).toHaveBeenCalledWith(['html', 'report'], '');
    expectNoPlaceholder(prompts[0]);

    const soOut = new SoSkillOutput();
    await skillAccess.soSkill({ conditions: [{ field: 'title', operator: '=', value: 'html-report' }] } as never, soOut, new SkillContext());
    expect(soOut.list).toHaveLength(1);
    expect(soOut.list[0].enable).toBe(true);
  });

  it('完整自建：GitHub 未命中 → 生成含 scripts/references 的 Skill 并落库 enable=true', async () => {
    const github = stubGithub([], null);
    const generated = '{"name": "gen-skill", "skill_brief": "generated", "skill_md": "# gen", "scripts": [{"name": "main.js", "content": "return params"}], "references": [{"name": "notes.md", "content": "note"}]}';
    const { llm, prompts } = makeLlm(['{"need": true, "keywords": ["gen"], "candidates": []}', generated]);
    const service = new SkillCoreService(relationDb, skillAccess, llm, promptsAccess, github);

    const out = new MatchSkillOutput();
    await service.matchSkill(matchInput('生成一个技能'), out, ctx);
    expect(out.skills).toHaveLength(1);
    expect(out.skills[0].skill_brief).toBe('generated');
    expect(github.searchSkills).toHaveBeenCalledWith(['gen'], '');

    const soOut = new SoSkillOutput();
    await skillAccess.soSkill({ conditions: [{ field: 'title', operator: '=', value: 'gen-skill' }] } as never, soOut, new SkillContext());
    expect(soOut.list).toHaveLength(1);
    expect(soOut.list[0].enable).toBe(true);
    expect(soOut.list[0].scripts?.[0]?.name).toBe('main.js');
    expect(soOut.list[0].references?.[0]?.name).toBe('notes.md');
    void prompts;
  });
});

describe('MCP 匹配链路（真实 builtin 模板种子 + 标题回退）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let promptsAccess: PromptsAccess;
  let ctx: McpCoreContext;

  function stubMcpAccess(installedList: any[] = []): { access: MCPAccess; calls: Record<string, number> } {
    const calls = { install: 0, start: 0 };
    const access = {
      soMcp: async (_i: unknown, o: SoMcpOutput) => { o.list = installedList; return true; },
      soMcpProvider: async (_i: SoMcpProviderInput, o: SoMcpProviderOutput) => {
        o.list = [{ id: 'prov-1', provider_code: 'github', mcp_provider_url: 'https://market.example', enable: true } as never];
        return true;
      },
      listMcp: async (_i: ListMcpInput, o: ListMcpOutput) => {
        o.list = [{ id: 'cache-9', mcp_provider_id: 'prov-1', mcp_title: 'search-mcp', mcp_brief: '联网搜索' }] as never[];
        return true;
      },
      installMcp: async (_i: InstallMcpInput, o: InstallMcpOutput) => { calls.install++; o.id = 'inst-9'; return true; },
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-mcp-e2e-'));
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
        "score_threshold" INTEGER NOT NULL DEFAULT 90,
        "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8,
        "match_cache_ttl_ms" INTEGER NOT NULL DEFAULT 600000,
        "match_cache_capacity" INTEGER NOT NULL DEFAULT 500,
        "market_install_enabled" INTEGER NOT NULL DEFAULT 1
      )
    `);
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();

    await new PromptCatalogAccess(relationDb).seed();
    ctx = new McpCoreContext();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch {  }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {  }
  });

  it('闲聊任务：语义路由未达阈值 → 返回空并写入负缓存（零 LLM 调用）', async () => {
    const { llm, execLlm } = makeLlm(['{"need": false, "keywords": [], "candidates": []}']);
    llm.embedLLM = async (i: any, o: any) => {
      o.embedding = (i.input && i.input.includes('笑话')) ? [1, 0, 0] : [0, 1, 0];
      return true;
    };
    const { access, calls } = stubMcpAccess([
      { id: 'mcp-1', mcp_title: 'weather', mcp_brief: '面向气象查询，输出天气报告。', enable: 1 },
    ]);
    const service = new MCPCoreService(relationDb, access, llm, promptsAccess);

    const out1 = new MatchMcpOutput();
    await service.matchMCP(matchInput('讲个笑话'), out1, ctx);
    expect(out1.mcp_ids).toEqual([]);
    expect(out1.detail).toBe('mcp_exhausted');
    expect(calls.install).toBe(0);
    expect(execLlm).toHaveBeenCalledTimes(0);

    const out2 = new MatchMcpOutput();
    await service.matchMCP(matchInput('讲个笑话'), out2, ctx);
    expect(out2.mcp_ids).toEqual([]);
    expect(out2.detail).toBe('mcp_exhausted');
    expect(execLlm).toHaveBeenCalledTimes(0);
  });

  it('任务与已安装 MCP 匹配：BM25 与向量两级过滤命中已安装 MCP（零 LLM 调用）', async () => {
    const { llm, execLlm } = makeLlm([]);
    llm.embedLLM = async (i: any, o: any) => {
      o.embedding = (i.input.includes('AI') || i.input.includes('新闻') || i.input.includes('搜索')) ? [1, 0, 0] : [0, 1, 0];
      return true;
    };
    const { access } = stubMcpAccess([
      { id: 'inst-news', mcp_title: 'AI新闻搜索', mcp_brief: '面向全网资讯检索，接收AI与新闻查询，检索最新文章，输出新闻列表。', enable: 1 },
    ]);
    const service = new MCPCoreService(relationDb, access, llm, promptsAccess);

    await service.configMCPCore(
      { score_threshold: 20, vector_similarity_threshold: 0.6 } as ConfigMcpCoreInput,
      new ConfigMcpCoreOutput(),
      ctx,
    );

    const out = new MatchMcpOutput();
    await service.matchMCP(matchInput('搜索最新的 AI 新闻'), out, ctx);

    expect(out.mcp_ids).toEqual(['inst-news']);
    expect(out.detail).toBe('election_mcp_t1');
    expect(execLlm).toHaveBeenCalledTimes(0);
  });
});
