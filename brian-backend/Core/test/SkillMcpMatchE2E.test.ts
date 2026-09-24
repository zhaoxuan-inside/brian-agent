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
import type { MCPAccess } from '@brian-agent/base';
import {
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
  SKILL_CORE_CONFIG_TABLE,
  SKILL_OPT_RULE_TABLE,
  SKILL_USAGE_TABLE,
  type GitHubSkillClient,
  type ParsedSkillMd,
} from '../SkillCoreProvider';
import { SkillCoreService } from '../SkillCoreProvider/application/SkillCoreService';
import {
  McpCoreContext,
  MatchMcpInput,
  MatchMcpOutput,
  MCP_CORE_CONFIG_TABLE,
  AGENT_MCP_USAGE_TABLE,
} from '../MCPCoreProvider';
import { MCPCoreService } from '../MCPCoreProvider/application/MCPCoreService';

/**
 * Skill / MCP 匹配链路端到端验证（真实组件编排，仅 stub LLM 与 GitHub / MCPAccess 传输侧）：
 * PromptCatalog 种子化 → 模板标题回退（LIKE '%Skill 匹配%' / '%MCP%匹配%' / '%MCP 市场%'）→
 * execPrompt 变量渲染（task_content 真实进入 prompt）→ RankingParser 契约解析 → 瀑布分流。
 */

/** 捕获 prompt 的 LLM stub（按调用序返回固定文本；prompts.length / execLlm 调用数即 LLM 调用数） */
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

/** GitHub 客户端 stub（searchSkills 命中清单 + fetchSkillMd 解析结果） */
function stubGithub(hits: unknown[], parsed: ParsedSkillMd | null): GitHubSkillClient {
  return {
    searchSkills: vi.fn().mockResolvedValue(hits),
    fetchSkillMd: vi.fn().mockResolvedValue(parsed),
  } as unknown as GitHubSkillClient;
}

/** 断言渲染后的 prompt 无残留占位符（模板变量全部由服务传入） */
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
    // 预建 Core 表（列结构与 SkillCoreSchemaInitializer 一致，与 SkillCoreWaterfall 测试相同）
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
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_USAGE_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "agent_id" TEXT NOT NULL,
        "skill_id" TEXT NOT NULL,
        "usage_date" TEXT NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 1
      )
    `);
    skillAccess = new SkillAccess(relationDb);
    await skillAccess.initialize();
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    // 真实种子化：PromptCatalog 全量 builtin 模板落库（含升级后的 Skill 匹配排序）
    await new PromptCatalogAccess(relationDb).seed();
    ctx = new SkillCoreContext();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('闲聊任务：回退命中 builtin Skill 匹配排序 → task_content 渲染进 prompt → need=false 负缓存', async () => {
    const { llm, prompts, execLlm } = makeLlm(['{"need": false, "keywords": [], "candidates": []}']);
    const github = stubGithub([], null);
    const service = new SkillCoreService(relationDb, skillAccess, llm, promptsAccess, github);

    const out1 = new MatchSkillOutput();
    await service.matchSkill(matchInput('你好，今天心情不错'), out1, ctx);
    expect(out1.skills).toEqual([]);
    // config.prompt_template_id 为空 → LIKE 回退命中种子 builtin 模板（正文特征断言）
    expect(prompts[0]).toContain('Skill 匹配评估助手');
    expect(prompts[0]).toContain('今天心情不错');
    expectNoPlaceholder(prompts[0]);
    expect(github.searchSkills).not.toHaveBeenCalled();

    // ===== 2026-09-24 语义升级（trace 3eea3bea 根治）：负缓存不再永久零 LLM ——
    // 重复出现即强制重判（重复即沉淀的行为信号），重判仍 need=false 则写回负缓存（间歇重试）
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
    await service.matchSkill(matchInput('查一下北京天气'), out, ctx);
    expect(out.skills).toHaveLength(1);
    expect(out.skills[0].skill_id).toBe(addOut.id);
    expect(out.skills[0].relevance).toBeCloseTo(0.96);
    expect(prompts[0]).toContain('Skill 匹配评估助手');
    expect(prompts[0]).toContain('weather-skill');
    expect(prompts[0]).toContain('查一下北京天气');
    expectNoPlaceholder(prompts[0]);
  });

  it('回退防劫持：用户同标题模板（is_system=0）存在时仍优先 builtin 契约模板', async () => {
    // 用户自建旧契约模板（标题含"Skill 匹配"，模拟真实库取证场景）
    const userInput = new (await import('@brian-agent/base')).AddPromptInput();
    userInput.data = {
      prompt_template_title: '我的 Skill 匹配规则',
      prompt_template: '旧契约：请输出 [{"skill_brief": "...", "relevance": 0.9}]，task={{task_content}}',
    };
    const userOutput = new (await import('@brian-agent/base')).AddPromptOutput();
    await promptsAccess.addPrompt(userInput, userOutput, new (await import('@brian-agent/base')).PromptContext());

    const { llm, prompts } = makeLlm(['{"need": false, "keywords": [], "candidates": []}']);
    const service = new SkillCoreService(relationDb, skillAccess, llm, promptsAccess, stubGithub([], null));
    const out = new MatchSkillOutput();
    await service.matchSkill(matchInput('随便聊聊'), out, ctx);
    expect(out.skills).toEqual([]);
    // 回退选中 builtin（正文特征），而非同标题用户模板
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
    // keywords 透传给 GitHub 客户端（token 为空串：未配置 github_token）
    expect(github.searchSkills).toHaveBeenCalledWith(['html', 'report'], '');
    expectNoPlaceholder(prompts[0]);

    const soOut = new SoSkillOutput();
    await skillAccess.soSkill({ conditions: [{ field: 'name', operator: '=', value: 'html-report' }] } as never, soOut, new SkillContext());
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
    await skillAccess.soSkill({ conditions: [{ field: 'name', operator: '=', value: 'gen-skill' }] } as never, soOut, new SkillContext());
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

  /** MCPAccess stub：本地无可用 MCP + 单提供商市场清单 + 安装/启动计数 */
  function stubMcpAccess(): { access: MCPAccess; calls: Record<string, number> } {
    const calls = { install: 0, start: 0 };
    const access = {
      soMcp: async (_i: unknown, o: SoMcpOutput) => { o.list = []; return true; },
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
    // 预建 Core 表（列结构与 MCPCoreSchemaInitializer 一致，与 MCPCoreWaterfall 测试相同）
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
    // 真实种子化：含 MCP 匹配推荐 与 MCP 市场匹配 两张 builtin 模板
    await new PromptCatalogAccess(relationDb).seed();
    ctx = new McpCoreContext();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('闲聊任务：回退命中 builtin MCP 匹配推荐 → task_content 渲染 → need=false 负缓存零市场调用', async () => {
    const { llm, prompts, execLlm } = makeLlm(['{"need": false, "keywords": [], "candidates": []}']);
    const { access, calls } = stubMcpAccess();
    const service = new MCPCoreService(relationDb, access, llm, promptsAccess);

    const out1 = new MatchMcpOutput();
    await service.matchMCP(matchInput('讲个笑话'), out1, ctx);
    expect(out1.mcp_ids).toEqual([]);
    // config.prompt_template_id 为空 → LIKE '%MCP%匹配%' 回退命中种子 builtin 模板
    expect(prompts[0]).toContain('MCP 工具匹配评估助手');
    expect(prompts[0]).toContain('讲个笑话');
    expectNoPlaceholder(prompts[0]);
    expect(calls.install).toBe(0);

    // 第二次同任务：负缓存命中，零 LLM
    const out2 = new MatchMcpOutput();
    await service.matchMCP(matchInput('讲个笑话'), out2, ctx);
    expect(out2.mcp_ids).toEqual([]);
    expect(execLlm).toHaveBeenCalledTimes(1);
  });

  it('任务需要外部工具：need=true 本地无命中 → 市场模板选型 → installMcp + startMcp 闭环', async () => {
    const { llm, prompts } = makeLlm([
      '{"need": true, "keywords": ["web"], "candidates": []}',
      '[{"id": "cache-9", "score": 93}]',
    ]);
    const { access, calls } = stubMcpAccess();
    const service = new MCPCoreService(relationDb, access, llm, promptsAccess);

    const out = new MatchMcpOutput();
    await service.matchMCP(matchInput('搜索最新的 AI 新闻'), out, ctx);

    // 第 2 层判定 prompt：builtin MCP 匹配推荐 + 任务内容
    expect(prompts[0]).toContain('MCP 工具匹配评估助手');
    expect(prompts[0]).toContain('搜索最新的 AI 新闻');
    expectNoPlaceholder(prompts[0]);
    // 第 3 层市场选型 prompt：builtin MCP 市场匹配 + 市场候选 + 任务内容
    expect(prompts[1]).toContain('MCP 工具选型评估助手');
    expect(prompts[1]).toContain('search-mcp');
    expect(prompts[1]).toContain('搜索最新的 AI 新闻');
    expectNoPlaceholder(prompts[1]);
    // 安装 + 启动闭环，返回新安装的 mcp id
    expect(calls.install).toBe(1);
    expect(calls.start).toBe(1);
    expect(out.mcp_ids).toEqual(['inst-9']);
  });
});
