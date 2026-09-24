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

/** Agent 匹配模板（能力感知判定契约；替换旧"用途/签名字面相似"契约）
 *  两个落点：AGENT_MATCH_MAIN_ID = 生产 agent_library_config 引用的"Agent 匹配"（5ddc44a1）；
 *           AGENT_MATCH_FALLBACK_ID = soMatchPromptTemplateId 精确标题回退的"Agent 匹配评估"（2bb266b9）——
 *  同契约双行同步，杜绝 LIKE/EQ 命中点不同而拿到旧契约模板（契约漂移免责） */
const AGENT_MATCH_MAIN_ID = '5ddc44a1-b168-4894-8553-e64b167fcb73';
const AGENT_MATCH_FALLBACK_ID = '2bb266b9-0b2a-4739-b5ad-974bc9f16ed2';

/** Agent 匹配模板（能力感知判定契约；替换旧"用途/签名字面相似"契约） */
const AGENT_TEMPLATE = `<agent_match_protocol version="capability-aware-contract">
  <identity>
    <role>Agent 匹配评估专家</role>
    <purpose>按"任务所需能力 vs 候选 Agent 可执行能力"判定路由，而非用途文字的字面相似</purpose>
  </identity>

  <selection_input>
    <task_content><![CDATA[{{ task_content }}]]></task_content>
    <candidates>{{ candidates }}</candidates>
  </selection_input>

  <judgement_rules>
    <rule priority="1">先判任务所需的「能力类别」：host_exec（命令执行/资源查询：磁盘、CPU、内存、进程、网络）、data_fetch（外部数据/网页/接口）、plan_or_delegate（任务拆分/委派）、pure_language（纯语言应答、闲聊、创作）。</rule>
    <rule priority="2">候选的 capabilities（skills/mcps/bound_count）是其"可执行能力"的唯一凭据；purpose/task_signature 只是任务方向描述，不构成能力证据。</rule>
    <rule priority="3">硬规则：任务需要 host_exec 或 data_fetch，而候选 capabilities.bound_count=0（无任何绑定 Skill/MCP）→ 不得单凭"系统/状态/通用"字面相似给出 0.6 以上分数。</rule>
    <rule priority="4">purpose 为"覆盖通用领域/日常问答/自检/状态报告/问候"类泛化 Agent，对数据获取与命令执行类任务一律视为能力不足，score 不超过 0.4；若不存在能力相容者，agent_id 返回空字符串，由系统构建新 Agent。</rule>
    <rule priority="5">0.7+ 采纳分需"能力契合 + 方向契合"双满足。</rule>
  </judgement_rules>

  <output_contract>
    <instruction>仅输出一个合法 JSON 对象，不要任何其他文字、Markdown 围栏或 XML 标签。</instruction>
    <schema>{"agent_id": "选中的 agent_id；无合适 Agent 时为空字符串", "score": 0.0 到 1.0 的匹配得分, "reason": "所需能力类别 + 候选能力核对 + 打分理由"}</schema>
    <prohibitions>
      <rule>agent_id 必须来自 candidates 列表，禁止虚构</rule>
      <rule>score 必须为 0.0~1.0 数字</rule>
      <rule>无合适 Agent 时 agent_id 为空字符串，score 为 0.0</rule>
      <rule>禁止输出 JSON 之外的任何文本</rule>
    </prohibitions>
  </output_contract>
</agent_match_protocol>`;

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

const r3 = apply(AGENT_MATCH_MAIN_ID, 'Agent 匹配模板（生产 config 引用）', AGENT_TEMPLATE);
const r4 = apply(AGENT_MATCH_FALLBACK_ID, 'Agent 匹配评估模板（精确标题回退）', AGENT_TEMPLATE);

const r1 = apply('251fef0b-5082-4767-aaaa-f39c4d75d7f5', 'Skill 匹配模板', SKILL_TEMPLATE);
const r2 = apply('31c4d572-41db-407a-a694-891cd0ac475c', 'MCP 匹配模板', MCP_TEMPLATE);
db.pragma('wal_checkpoint(FULL)');
db.close();
console.log(`结果：skill=${r1}, mcp=${r2}, agent_main=${r3}, agent_fallback=${r4}`);
const failed = r1 === 'missing' || r2 === 'missing' || r3 === 'missing' || r4 === 'missing';
process.exit(failed ? 1 : 0);
