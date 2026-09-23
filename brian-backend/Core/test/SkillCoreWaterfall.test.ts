import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  SkillAccess,
  LLMAccess,
  PromptsAccess,
  IdGenerator,
  AddPromptInput,
  AddPromptOutput,
  PromptContext,
  type LLMAccess as LLMAccessType,
} from '@brian-agent/base';
import {
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
  ConfigSkillCoreInput,
  ConfigSkillCoreOutput,
  SKILL_CORE_CONFIG_TABLE,
  SKILL_OPT_RULE_TABLE,
  SKILL_USAGE_TABLE,
  type GitHubSkillClient,
  type ParsedSkillMd,
} from '../SkillCoreProvider';
import { SkillCoreService } from '../SkillCoreProvider/application/SkillCoreService';

const ALL_SKILL_CORE_TABLES = [SKILL_CORE_CONFIG_TABLE, SKILL_OPT_RULE_TABLE, SKILL_USAGE_TABLE];

/** 构造 execLLM 按调用序返回固定文本的 LLM stub（embedLLM 返回固定向量） */
function stubLlm(responses: string[]): LLMAccessType {
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
  } as unknown as LLMAccessType;
}

/** 构造 GitHub 客户端 stub */
function stubGithub(hits: unknown[], parsed: ParsedSkillMd | null): GitHubSkillClient {
  return {
    searchSkills: vi.fn().mockResolvedValue(hits),
    fetchSkillMd: vi.fn().mockResolvedValue(parsed),
  } as unknown as GitHubSkillClient;
}

describe('SkillCoreService 四层瀑布（need 判定合并 / 负缓存 / GitHub / 完整自建）', () => {
  let tempDir: string;
  let dbPath: string;
  let relationDb: RelationDBAccess;
  let skillAccess: SkillAccess;
  let promptsAccess: PromptsAccess;
  let ctx: SkillCoreContext;

  /** 组装被测服务（LLM/GitHub stub 注入） */
  function buildService(llm: LLMAccessType, github?: GitHubSkillClient): SkillCoreService {
    return new SkillCoreService(relationDb, skillAccess, llm, promptsAccess, github);
  }

  function matchInput(agentId: string, taskContent: string): MatchSkillInput {
    const input = new MatchSkillInput();
    input.agent_id = agentId;
    input.context_id = 'c1';
    input.run_id = 'r1';
    input.task_content = taskContent;
    return input;
  }

  /** 种子化判定合并契约的匹配模板，并设为 config 的 prompt_template_id（绕开 LIKE 回退歧义） */
  async function seedMatchTemplate(llmText: string): Promise<void> {
    const addInput = new AddPromptInput();
    addInput.data = {
      prompt_template_title: '瀑布测试匹配模板',
      prompt_template: 'task: {{task_content}} skills: {{skills}}',
    };
    const addOutput = new AddPromptOutput();
    await promptsAccess.addPrompt(addInput, addOutput, new PromptContext());
    await relationDb.delete(SKILL_CORE_CONFIG_TABLE, []);
    await relationDb.insert(SKILL_CORE_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: IdGenerator.now() },
      { field: 'updated', value: IdGenerator.now() },
      { field: 'regen_rate', value: 0 },
      { field: 'prompt_template_id', value: addOutput.id },
    ]);
    void llmText;
  }

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-skill-falls-'));
    dbPath = path.join(tempDir, 'test.db');
    relationDb = new RelationDBAccess({ dbPath });
    await relationDb.initialize();
    // 预建 Core 表（不经 SkillCoreAccess 初始化器；列结构与 SkillCoreSchemaInitializer 一致）
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
    ctx = new SkillCoreContext();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('need=false → 返回空 + 负缓存（第二次调用零 LLM）', async () => {
    await seedMatchTemplate('');
    const execLlm = vi.fn(async (_i: unknown, o: { result?: string }) => { o.result = '{"need": false, "keywords": [], "candidates": []}'; return true; });
    const llm = { execLLM: execLlm, embedLLM: async (_i: unknown, o: { embedding?: number[] }) => { o.embedding = [0.1]; return true; } } as unknown as LLMAccessType;
    const service = buildService(llm, stubGithub([], null));

    const out1 = new MatchSkillOutput();
    await service.matchSkill(matchInput('a1', '你好'), out1, ctx);
    expect(out1.skills).toEqual([]);

    const out2 = new MatchSkillOutput();
    await service.matchSkill(matchInput('a1', '你好'), out2, ctx);
    expect(out2.skills).toEqual([]);
    // 排序 LLM 仅首次调用（第二次负缓存命中）
    expect(execLlm).toHaveBeenCalledTimes(1);
  });

  it('本地命中：need=true 且候选过阈值 → 返回本地 Skill', async () => {
    await seedMatchTemplate('');
    const addOut = new (await import('@brian-agent/base')).AddSkillOutput();
    await skillAccess.addSkill({ data: { name: 'weather', skill_brief: '天气查询技能', skill_md: '# weather', enable: true } } as never, addOut, new (await import('@brian-agent/base')).SkillContext());
    const llm = stubLlm([`{"need": true, "keywords": ["weather"], "candidates": [{"id": "${addOut.id}", "score": 95}]}`]);
    const service = buildService(llm, stubGithub([], null));

    const out = new MatchSkillOutput();
    await service.matchSkill(matchInput('a1', '查一下北京天气'), out, ctx);
    expect(out.skills).toHaveLength(1);
    expect(out.skills[0].skill_id).toBe(addOut.id);
  });

  it('GitHub 层：need=true 本地无果 → 检索并导入（enable=true，含 keywords 传递）', async () => {
    await seedMatchTemplate('');
    const parsed: ParsedSkillMd = { name: 'gh-skill', skill_brief: 'from github', skill_md: '# gh' };
    const github = stubGithub([{ repo: 'o/r', path: 'SKILL.md', branch: 'main' }], parsed);
    const llm = stubLlm(['{"need": true, "keywords": ["weather"], "candidates": []}']);
    const service = buildService(llm, github);

    const out = new MatchSkillOutput();
    await service.matchSkill(matchInput('a1', '查天气'), out, ctx);
    expect(out.skills).toHaveLength(1);
    expect(out.skills[0].skill_brief).toBe('from github');
    expect(github.searchSkills).toHaveBeenCalledWith(['weather'], '');
    // 导入的 Skill 落库且启用
    const soOut = new (await import('@brian-agent/base')).SoSkillOutput();
    await skillAccess.soSkill({ conditions: [{ field: 'name', operator: '=', value: 'gh-skill' }] } as never, soOut, new (await import('@brian-agent/base')).SkillContext());
    expect(soOut.list).toHaveLength(1);
    expect(soOut.list[0].enable).toBe(true);
  });

  it('自建层：GitHub 未命中且 auto_generate 开启 → 完整自建（含 scripts/references）', async () => {
    await seedMatchTemplate('');
    const github = stubGithub([], null);
    const generated = '{"name": "gen-skill", "skill_brief": "generated", "skill_md": "# gen", "scripts": [{"name": "main.js", "content": "return params"}], "references": [{"name": "notes.md", "content": "note"}]}';
    const llm = stubLlm(['{"need": true, "keywords": ["gen"], "candidates": []}', generated]);
    const service = buildService(llm, github);

    const out = new MatchSkillOutput();
    await service.matchSkill(matchInput('a1', '生成一个技能'), out, ctx);
    expect(out.skills).toHaveLength(1);
    expect(out.skills[0].skill_brief).toBe('generated');
    // 自建结果完整落库（scripts/references 均写入）
    const soOut = new (await import('@brian-agent/base')).SoSkillOutput();
    await skillAccess.soSkill({ conditions: [{ field: 'name', operator: '=', value: 'gen-skill' }] } as never, soOut, new (await import('@brian-agent/base')).SkillContext());
    expect(soOut.list).toHaveLength(1);
    expect(soOut.list[0].scripts?.[0]?.name).toBe('main.js');
    expect(soOut.list[0].references?.[0]?.name).toBe('notes.md');
  });

  it('auto_generate_enabled=false → 自建层跳过，返回空', async () => {
    await seedMatchTemplate('');
    const configInput = new ConfigSkillCoreInput();
    configInput.auto_generate_enabled = false;
    const configOut = new ConfigSkillCoreOutput();
    const bootstrap = buildService(stubLlm(['{"need": true, "keywords": [], "candidates": []}']), stubGithub([], null));
    await bootstrap.configSkillCore(configInput, configOut, ctx);
    expect(configOut.auto_generate_enabled).toBe(false);

    const service = buildService(stubLlm(['{"need": true, "keywords": [], "candidates": []}']), stubGithub([], null));
    const out = new MatchSkillOutput();
    await service.matchSkill(matchInput('a1', '任意任务'), out, ctx);
    expect(out.skills).toEqual([]);
  });

  it('github_search_enabled=false → 跳过 GitHub 层直接自建', async () => {
    await seedMatchTemplate('');
    const github = stubGithub([], null);
    const generated = '{"name": "direct-gen", "skill_brief": "g", "skill_md": "# g"}';
    const llm = stubLlm(['{"need": true, "keywords": ["x"], "candidates": []}', generated]);
    const service = buildService(llm, github);
    const configInput = new ConfigSkillCoreInput();
    configInput.github_search_enabled = false;
    await service.configSkillCore(configInput, new ConfigSkillCoreOutput(), ctx);

    const out = new MatchSkillOutput();
    await service.matchSkill(matchInput('a1', '任意任务'), out, ctx);
    expect(github.searchSkills).not.toHaveBeenCalled();
    expect(out.skills).toHaveLength(1);
  });

  it('LLM 输出异常（乱码）→ need=false 保守降级，不触发外部获取', async () => {
    await seedMatchTemplate('');
    const github = stubGithub([], null);
    const service = buildService(stubLlm(['这不是 JSON']), github);
    const out = new MatchSkillOutput();
    await service.matchSkill(matchInput('a1', '任意任务'), out, ctx);
    expect(out.skills).toEqual([]);
    expect(github.searchSkills).not.toHaveBeenCalled();
  });
});
