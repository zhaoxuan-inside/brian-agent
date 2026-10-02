import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  SkillAccess,
  PromptsAccess,
  PromptCatalogAccess,
  type LLMAccess,
} from '@brian-agent/base';
import {
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
  SKILL_CORE_CONFIG_TABLE,
  SKILL_OPT_RULE_TABLE,
} from '../SkillCoreProvider';
import { SkillCoreService } from '../SkillCoreProvider/application/SkillCoreService';
import { GitHubSkillClient } from '../SkillCoreProvider/infrastructure/GitHubSkillClient';

const LIVE = process.env.BRIAN_LIVE_GITHUB === '1';

function stubLlmNeedTrue(keywords: string[]): LLMAccess {
  const response = JSON.stringify({ need: true, keywords, candidates: [] });
  let call = 0;
  return {
    execLLM: async (_i: unknown, o: { result?: string }) => {
      o.result = call++ === 0 ? response : '';
      return true;
    },
    embedLLM: async (_i: unknown, o: { embedding?: number[] }) => { o.embedding = [0.1]; return true; },
  } as unknown as LLMAccess;
}

describe.skipIf(!LIVE)('GitHub Skill 检索真机联测（BRIAN_LIVE_GITHUB=1）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let skillAccess: SkillAccess;
  let promptsAccess: PromptsAccess;
  let ctx: SkillCoreContext;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-github-live-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db') });
    await relationDb.initialize();
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
        "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
        "days" INTEGER NOT NULL, "min_usage_count" INTEGER NOT NULL
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

  it('matchSkill 瀑布第 3 层：真实 GitHub 检索 → SKILL.md 导入本地库', async () => {
    const github = new GitHubSkillClient();

    const t0 = Date.now();
    const hits = await github.searchSkills(['document', 'skills'], '');
    console.log(`[阶段A searchSkills] ${Date.now() - t0}ms, 命中 ${hits.length}:`, hits.map((h) => h.repo).join(', ') || '(空)');

    if (hits.length > 0) {
      const t1 = Date.now();
      const parsed = await github.fetchSkillMd(hits[0], '');
      console.log(`[阶段B fetchSkillMd] ${Date.now() - t1}ms, name=${parsed?.name ?? '(null)'} brief=${String(parsed?.skill_brief ?? '').slice(0, 60)}`);
      expect(parsed).not.toBeNull();
    }
    expect(hits.length).toBeGreaterThanOrEqual(1);

    const service = new SkillCoreService(relationDb, skillAccess, stubLlmNeedTrue(['document', 'skills']), promptsAccess, github);
    const input = new MatchSkillInput();
    input.agent_id = 'a1';
    input.context_id = 'c1';
    input.run_id = 'r1';
    input.task_content = 'find a skill for document handling';
    const t2 = Date.now();
    const out = new MatchSkillOutput();
    await service.matchSkill(input, out, ctx);
    console.log(`[阶段C matchSkill] ${Date.now() - t2}ms, 返回 ${out.skills.length} 个 Skill`);

    const soOut = new (await import('@brian-agent/base')).SoSkillOutput();
    await skillAccess.soSkill({ conditions: [] } as never, soOut, new (await import('@brian-agent/base')).SkillContext());
    console.log('[GitHub 联测] 本地库 Skill 数:', soOut.list.length);
    for (const s of soOut.list) {
      console.log(`[GitHub 联测] 导入: name=${s.name} brief=${String(s.skill_brief).slice(0, 80)}`);
    }

    expect(soOut.list.length).toBeGreaterThanOrEqual(1);
    expect(out.skills.length).toBeGreaterThanOrEqual(1);
    const imported = out.skills[0];
    expect(imported.skill_brief.trim().length).toBeGreaterThan(0);

    const dbRow = soOut.list.find((s) => s.id === imported.skill_id) ?? soOut.list[0];
    expect(String(dbRow.skill_md ?? '').trim().length).toBeGreaterThan(0);
  }, 90000);
});
