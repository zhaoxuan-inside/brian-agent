/**
 * 一次性修复脚本：组件匹配模板与代码契约同步（2026-09-24，事故 trace 95b8e237 根因闭环）。
 *
 * 背景：2026-09-22 组件匹配升级为 need/keywords/candidates 判定合并契约
 * （Core/shared/RankingParser.ts），但生产库 prompt_template 中的两份匹配模板
 * （Skill 匹配 / MCP 匹配）仍停留在旧契约 —— 旧契约输出经新版解析器必然落回
 * need=false（confirmed 未判定），负缓存短路 GitHub 导入与自动生成层，四层瀑布扩容失效。
 *
 * 脚本行为：
 * - 幂等：已为新契约（检测 marker need-and-candidates-contract）时跳过，重跑安全；
 * - 仅更新 prompt_template（两行）：模板文本 + updated 时间戳。
 *
 * 用法：node scripts/fix-matching-prompts.mjs
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', 'data', 'brian.db');

const CONTRACT_MARKER = 'need-and-candidates-contract';

/** Skill 匹配模板（need/keywords/candidates 判定合并契约） */
const SKILL_TEMPLATE = `<skill_selection_protocol version="need-and-candidates-contract">
  <identity>
    <role>Skill 匹配引擎</role>
    <purpose>判定当前任务是否需要技能能力，并从候选 Skill 中选出最贴合者</purpose>
  </identity>

  <selection_input>
    <agent_id>{{ agent_id }}</agent_id>
    <context_id>{{ context_id }}</context_id>
    <run_id>{{ run_id }}</run_id>
    <task_content>{{ task_content }}</task_content>
    <candidates>{{ skills }}</candidates>
  </selection_input>

  <judgement_rules>
    <rule priority="1">need 只回答「该任务是否需要外部能力、外部事实或命令执行」（如：查数据、算数、检索资料、执行系统操作、生成图片/文档等）。不要以"候选列表里有没有匹配的"来判定 need —— 候选匹配度交给 candidates 表达。</rule>
    <rule priority="2">纯对话/创作/简答类任务（闲聊、写诗、改写润色、概念解释且不需要事实校准）判 need=false。</rule>
    <rule priority="3">从任务中提炼 1~5 个英文检索关键词（供外部市场检索；need=false 时可留空）。</rule>
  </judgement_rules>

  <output_contract>
    <format>{"need": true, "keywords": ["disk","space"], "candidates": [{"id": "<候选skill_id>", "score": 85}]}</format>
    <instruction>仅输出上述 JSON 对象，不要任何解释文本；candidates 按 score 降序，score 为 0-100 百分制整数；无关候选不输出。</instruction>
  </output_contract>
</skill_selection_protocol>`;

/** MCP 匹配模板（need/keywords/candidates 判定合并契约；替换旧中文排名散文模板） */
const MCP_TEMPLATE = `<mcp_selection_protocol version="need-and-candidates-contract">
  <identity>
    <role>MCP 工具匹配引擎</role>
    <purpose>判定当前任务是否需要外部工具通道（MCP），并从候选 MCP 中选出最合适者并按相关性排序</purpose>
  </identity>

  <selection_input>
    <agent_id>{{ agent_id }}</agent_id>
    <context_id>{{ context_id }}</context_id>
    <run_id>{{ run_id }}</run_id>
    <task_content>{{ task_content }}</task_content>
    <candidates>{{ available_mcps }}</candidates>
  </selection_input>

  <judgement_rules>
    <rule priority="1">need 只回答「该任务是否需要外部工具/通道能力」（数据查询、文件系统、浏览器自动化、网络请求等）。不要以"候选列表匹配度"判定 need —— 候选匹配度交给 candidates。</rule>
    <rule priority="2">从任务提炼 1~5 个英文检索关键词（例：filesystem、git、database；need=false 时留空）。</rule>
  </judgement_rules>

  <output_contract>
    <format>{"need": true, "keywords": ["filesystem"], "candidates": [{"id": "<候选mcp_id>", "score": 85}]}</format>
    <instruction>仅输出该 JSON 对象，不要任何解释文本；candidates 仅列 score 达 85 分以上（百分制）的候选；不虚构候选之外的 id。</instruction>
  </output_contract>
</mcp_selection_protocol>`;

const db = new Database(dbPath, { timeout: 10_000 });
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');

function apply(templateId, brief, content) {
  const row = db.prepare(`SELECT prompt_template FROM prompt_template WHERE id = ?`).get(templateId);
  if (!row) {
    console.log(`[skip] prompt_template ${templateId} 不存在（跳过，不插入）`);
    return 'missing';
  }
  if (String(row.prompt_template).includes(CONTRACT_MARKER)) {
    console.log(`[skip] ${brief} 已是新契约（幂等跳过）`);
    return 'already';
  }
  const now = Date.now();
  db.prepare(
    `UPDATE prompt_template SET prompt_template = ?, updated = ? WHERE id = ?`,
  ).run(content, now, templateId);
  console.log(`[updated] ${brief}（id=${templateId}）`);
  return 'updated';
}

const r1 = apply('251fef0b-5082-4767-aaaa-f39c4d75d7f5', 'Skill 匹配模板', SKILL_TEMPLATE);
const r2 = apply('31c4d572-41db-407a-a694-891cd0ac475c', 'MCP 匹配模板', MCP_TEMPLATE);
db.pragma('wal_checkpoint(FULL)');
db.close();
console.log(`结果：skill=${r1}, mcp=${r2}`);
const failed = r1 === 'missing' || r2 === 'missing';
process.exit(failed ? 1 : 0);
