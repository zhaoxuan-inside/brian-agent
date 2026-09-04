/**
 * @fileoverview 内置 Prompt 目录（PromptCatalog）。
 *
 * 全系统内置 Prompt 模板的唯一真相源。所有内置 Prompt 使用稳定 ID，
 * 由 {@link PromptCatalogAccess.seed} 幂等写入 prompt_template 表，
 * 业务层通过 {@link PROMPT_IDS} 引用，经 {@link renderTemplate} 在内存兜底渲染。
 *
 * 统一变量命名（跨 Agent / Core / Orchestration / Application）：
 *   task_content / context_data / history / tools_json / soul /
 *   agent_name / domain / iteration / max_iterations / max_subtask_count /
 *   agent_results / candidates / agent_output / final_response / trace /
 *   preferences / threshold / available_llms / available_mcps / available_souls /
 *   skills / agent_id / context_id / interact_id /
 *   selection / context_before / context_after / question /
 *   direction_key / direction_name / conversation_sample
 */

/** 内置 Prompt 定义 */
export interface BuiltinPromptDef {
  /** 稳定 ID（写入 prompt_template.id） */
  id: string;
  /** 标题 */
  title: string;
  /** 摘要 */
  brief: string;
  /** 模板内容（含 {{变量}} 占位符） */
  template: string;
  /** 模板使用的变量（文档用途） */
  variables: string[];
}

/** 内置 Prompt 稳定 ID 常量 */
export const PROMPT_IDS = {
  think: 'builtin.think',
  reflect: 'builtin.reflect',
  answer: 'builtin.answer',
  writer: 'builtin.writer',
  planner: 'builtin.planner',
  evalWork: 'builtin.eval_work',
  evalWrite: 'builtin.eval_write',
  agentMatch: 'builtin.agent_match',
  skillMatch: 'builtin.skill_match',
  mcpMatch: 'builtin.mcp_match',
  llmMatch: 'builtin.llm_match',
  soulMatch: 'builtin.soul_match',
  strategySelector: 'strategy_selector_prompt',
  summary: 'builtin.summary',
  taskAnalysis: 'builtin.task_analysis',
  documentQuery: 'builtin.document_query',
  profileAnalysis: 'builtin.profile_analysis',
  intentUnderstanding: 'builtin.intent_understanding',
  llmAttrGen: 'builtin.llm_attr_gen',
  identity: 'builtin.identity',
} as const;

export type PromptId = (typeof PROMPT_IDS)[keyof typeof PROMPT_IDS];

/** 全部内置 Prompt 定义 */
export const BUILTIN_PROMPTS: BuiltinPromptDef[] = [
  {
    id: PROMPT_IDS.think,
    title: 'Worker Think 阶段',
    brief: 'WorkAgent 思考阶段：推理并决定下一步动作（NONE/SKILL/MCP）',
    variables: ['agent_name', 'soul', 'task_content', 'context_data', 'history', 'iteration', 'tools_json', 'domain'],
    template: [
      'System: {{soul}}',
      'Task: {{task_content}}',
      'Context: {{context_data}}',
      'History: {{history}}',
      'Tools: {{tools_json}}',
      'Iteration: {{iteration}}',
      'Reason step by step. If external tools are needed, set next_action.tool_type to SKILL, MCP or CDT with tool_id and params. CDT 为内置浏览器能力，tool_id 取 browser.operations 中的 id。Return JSON: {"reasoning":"...","next_action":{"tool_type":"NONE|SKILL|MCP|CDT","tool_id":"","params":{},"sub_steps":[]}}',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.reflect,
    title: 'Worker Reflect 阶段',
    brief: 'WorkAgent 反思阶段：评估进度并决定是否继续迭代',
    variables: ['agent_name', 'soul', 'task_content', 'context_data', 'history', 'iteration', 'max_iterations', 'tools_json', 'domain'],
    template: [
      'System: {{soul}}',
      'Task: {{task_content}}',
      'Context: {{context_data}}',
      'History: {{history}}',
      'Tools: {{tools_json}}',
      'Iteration: {{iteration}}/{{max_iterations}}',
      'Evaluate progress and decide whether to continue iterating.',
      'Set should_continue=false when ANY of the following holds:',
      '1. The task goal is already achieved with the information gathered so far;',
      '2. The missing information is NOT obtainable via the available tools (e.g. data beyond forecast/search range, or it requires user-provided parameters) — do not keep retrying the same tool, stop and produce the answer with what you have;',
      '3. The last tool call produced no new useful information (no progress);',
      '4. iteration is close to max_iterations — wrap up now.',
      'Only set should_continue=true when a concrete next tool action will genuinely advance the task.',
      'Return ONLY JSON: {"should_continue":true/false,"reflection":"..."}',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.answer,
    title: 'Worker Answer 阶段',
    brief: 'WorkAgent 回答阶段：基于任务、上下文、历史生成最终答案',
    variables: ['agent_name', 'soul', 'task_content', 'context_data', 'history', 'tools_json', 'domain'],
    template: [
      'System: {{soul}}',
      'Task: {{task_content}}',
      'Context: {{context_data}}',
      'Tools: {{tools_json}}',
      'History: {{history}}',
      'Generate the final answer.',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.writer,
    title: 'Writer 结果汇总',
    brief: 'WriterAgent 将各 WorkAgent 结果汇总为结构化内容块',
    variables: ['task_content', 'preferences', 'context_data', 'agent_results', 'soul'],
    template: [
      'User query: {{task_content}}',
      'Preferences: {{preferences}}',
      'Context:',
      '{{context_data}}',
      'Results:',
      '{{agent_results}}',
      'Generate a structured response as a JSON array of content blocks. Available block types:',
      '- "text_paragraph": plain text content',
      '- "heading": section title, meta: { "level": 2 }',
      '- "code_block": code snippet, meta: { "language": "python" }',
      '- "list_item": bullet point in a list',
      '- "artifact_preview": generated artifact or file',
      '- "error_fallback": error message',
      'Return ONLY valid JSON array, example:',
      '[{"type":"text_paragraph","content":"Hello"},{"type":"heading","content":"Code","meta":{"level":2}},{"type":"code_block","content":"print(1)","meta":{"language":"python"}}]',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.planner,
    title: 'Planner 任务拆解',
    brief: 'PlannerAgent 将复杂任务拆解为 Task DAG',
    variables: ['task_content', 'context_data', 'max_subtask_count', 'soul'],
    template: [
      'Task: {{task_content}}',
      'Context:',
      '{{context_data}}',
      'Max subtasks: {{max_subtask_count}}',
      '',
      'You are a task decomposition expert. Decompose the given task into a hierarchical DAG.',
      '',
      'Decomposition rules:',
      '1. Leaf subtasks must be concrete and directly executable by a single worker agent WITHOUT any missing user-specific parameters.',
      '2. A parent task summarizes/aggregates the results of all its child subtasks into a cohesive result.',
      '3. parent_task_id links each subtask to its parent; the root task has an empty parent_task_id.',
      '4. dependencies lists the child task_ids that must complete before this task can execute (empty for leaf tasks).',
      '5. edges express execution dependency: from child (runs first) to parent (runs after all children).',
      '6. If the task is simple enough to run directly, return a single leaf node with empty dependencies and empty edges.',
      '7. The total number of subtasks MUST NOT exceed Max subtasks; do NOT over-decompose.',
      '8. Subtasks MUST be mutually exclusive and non-overlapping; do NOT create multiple subtasks that essentially do the same thing (e.g. repeated "define scope/objective/framework" steps). Merge overlapping subtasks into one.',
      '9. Prefer a small number of concrete subtasks over a large number of fine-grained ones; only decompose when the task is genuinely complex.',
      '10. IMPORTANT - user-parameter identification: distinguish "execution/booking" tasks from "planning/recommendation" tasks. A subtask that actually books/orders/reserves/purchases real-world resources (e.g. 预订机票/火车票/酒店, 购买门票/保险, 下单) REQUIRES user-specific parameters (departure city, dates, budget, passenger count, contacts). Since these parameters are missing, do NOT include such subtasks in "nodes". Instead, put ONE concise clarification question into the "clarifications" array for each missing parameter group (e.g. {"question":"请问您从哪个城市出发？出行日期是哪几天？","domain":"交通预订"}).',
      '11. Even for planning/recommendation tasks, if the request is missing KEY parameters that materially change the result (出行日期/天数, 预算, 同行人数, 出发地, 目的地), do NOT silently assume them. Collect them via "clarifications" so the user can provide them upfront. Example: a "北京旅游规划" without dates/budget/party-size should ask for them instead of assuming "2 adults, mid budget".',
      '12. Only NON-KEY preferences (景点风格偏好, 餐饮口味, 住宿档次偏好) may be assumed with reasonable defaults. All KEY parameters above must be clarified when missing.',
      '13. Merge related questions; output at most 3 clarification questions, each covering one group of related parameters. If the user already provided the key parameters (in the task or context), do not ask again.',
      '',
      'Return ONLY valid JSON:',
      '{"nodes":[{"task_id":"1","parent_task_id":"","task_content":"...","task_complexity":30,"task_domain":"","priority":1,"dependencies":["2","3"]},{"task_id":"2","parent_task_id":"1","task_content":"...","task_complexity":40,"task_domain":"","priority":2,"dependencies":[]}],"edges":[{"from_task_id":"2","to_task_id":"1"}],"clarifications":[{"question":"...","domain":"..."}]}',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.evalWork,
    title: 'WorkAgent 评估',
    brief: 'EvolutorAgent 评估 WorkAgent 输出质量',
    variables: ['task_content', 'agent_output', 'trace'],
    template: [
      'Task: {{task_content}}',
      'Output: {{agent_output}}',
      'Trace: {{trace}}',
      'Evaluate the agent output. Return JSON: {"correctness":50,"completeness":50,"efficiency":50,"relevance":50,"overall":50,"suggestions":[]}',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.evalWrite,
    title: 'WriterAgent 评估',
    brief: 'EvolutorAgent 评估 WriterAgent 汇总质量',
    variables: ['task_content', 'final_response', 'agent_results'],
    template: [
      'User query: {{task_content}}',
      'Final response: {{final_response}}',
      'Agent results: {{agent_results}}',
      'Evaluate writer agent response. Return JSON: {"clarity":60,"informativeness":60,"user_alignment":60,"conciseness":60,"overall":60,"suggestions":[]}',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.agentMatch,
    title: 'Agent 匹配评估',
    brief: 'AgentLibrary 第二层匹配：为候选 Agent 打分并选出最佳者',
    variables: ['task_content', 'candidates'],
    template: [
      '你是一个智能 Agent 匹配评估专家。请评估用户的提问，并对候选 Agent 列表逐一打分，判断是否有能够完美或高度胜任该任务的现有 Agent。',
      '',
      '【用户提问/任务内容】:',
      '{{task_content}}',
      '',
      '【候选 Agent 列表 (包含用途描述 agent_purpose)】:',
      '{{candidates}}',
      '',
      '评估标准：',
      '1. 比较 Agent 的用途 (agent_purpose) 与用户当前任务领域的契合度；',
      '2. 如果存在能完美或高度胜任的 Agent，选择最符合的 agent_id，并给出 0.0 到 1.0 之间的匹配得分 score；',
      '3. 如果无任何能胜任的 Agent，将 agent_id 设为空字符串 ""，score 设为 0.0。',
      '',
      '请严格仅输出 JSON 格式结果：{"agent_id": "选中的agent_id", "score": 匹配得分, "reason": "打分与评估说明"}',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.skillMatch,
    title: 'Skill 匹配排序',
    brief: 'SkillCore 按相关性对候选 Skill 排序',
    variables: ['agent_id', 'skills'],
    template: [
      '你是一个 Skill 匹配助手。请根据以下可用 Skill 列表，按照相关性从高到低排序，',
      '输出 Skill 的 skill_brief 和 relevance（0~1 小数）。以 JSON 数组格式输出：',
      '[{"skill_brief": "...", "relevance": 0.95}]',
      '',
      '可用 Skill:',
      '{{skills}}',
      '',
      'Agent ID: {{agent_id}}',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.mcpMatch,
    title: 'MCP 匹配推荐',
    brief: 'MCPCore 为 Agent 推荐最相关的 MCP 工具',
    variables: ['agent_id', 'available_mcps'],
    template: [
      'You are an MCP tool recommender. Given the following agent and available MCP tools, rank the most relevant MCP tools for this agent\'s task. Return ONLY a JSON array of MCP IDs in order of relevance.',
      '',
      'Agent ID: {{agent_id}}',
      '',
      'Available MCP tools:',
      '{{available_mcps}}',
      '',
      'Return JSON array of MCP IDs only.',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.llmMatch,
    title: 'LLM 匹配选择',
    brief: 'LLMCore 在候选 LLM 中选出最合适的模型',
    variables: ['agent_id', 'context_id', 'interact_id', 'available_llms'],
    template: [
      'You are selecting the best LLM for an AI agent. Given the available LLMs below, select the most suitable one.',
      '',
      'Agent ID: {{agent_id}}',
      'Context ID: {{context_id}}',
      'Interaction ID: {{interact_id}}',
      '',
      'Available LLMs:',
      '{{available_llms}}',
      '',
      'Respond with ONLY the id of the selected LLM. Do not include any other text.',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.soulMatch,
    title: 'Soul 匹配选择',
    brief: 'SoulCore 在候选 Soul 中选出最合适的角色',
    variables: ['agent_id', 'context_id', 'interact_id', 'task_content', 'task_domain', 'available_souls'],
    template: [
      'You are selecting the best Soul (persona) for an AI agent. Given the task below and the available Souls, select the most suitable one.',
      '',
      'Agent ID: {{agent_id}}',
      'Context ID: {{context_id}}',
      'Interaction ID: {{interact_id}}',
      '',
      'Task domain: {{task_domain}}',
      'Task content: {{task_content}}',
      '',
      'Available Souls:',
      '{{available_souls}}',
      '',
      'Select the Soul whose usage/场景 most closely matches the task domain and content.',
      'If none of the available Souls fit the task, respond with ONLY "NONE".',
      'Otherwise respond with ONLY the id of the selected Soul. Do not include any other text.',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.strategySelector,
    title: 'Orchestration Strategy Selector',
    brief: '分析用户任务复杂度并选择 SIMPLE 或 PLANNING 编排策略',
    variables: ['task_content', 'threshold', 'context_data'],
    template: [
      'You are selecting the best orchestration strategy for a user task. Given the user task below, analyze its complexity and choose the appropriate strategy.',
      '',
      'Strategy threshold: complexity >= {{threshold}} → PLANNING (must decompose into subtasks), otherwise SIMPLE (single Agent execution).',
      '',
      '{{context_data}}User task: {{task_content}}',
      '',
      'Respond with ONLY the JSON object. Do not include any other text.',
      '',
      '{',
      '  "complexity": <0-100 integer>',
      '  "strategy": "SIMPLE" | "PLANNING"',
      '  "reason": "<brief explanation>"',
      '  "plan": [{"step": 1, "description": "..."}, ...]',
      '}',
      '',
      'Fields:',
      '- complexity: integer 0-100 indicating task complexity.',
      '- strategy: "SIMPLE" for simple queries, "PLANNING" for tasks requiring multi-step decomposition.',
      '- reason: brief explanation of the strategy choice.',
      '- plan: only for PLANNING, lists the decomposed subtasks in execution order.',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.summary,
    title: '系统响应摘要生成',
    brief: 'SummaryAgent 为系统响应内容生成摘要',
    variables: ['task_content', 'soul'],
    template: [
      '请为以下系统响应内容生成一段简洁、准确的摘要，保留关键信息与结论，去除冗余细节。',
      '',
      '内容：',
      '{{task_content}}',
      '',
      '摘要：',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.taskAnalysis,
    title: '任务分析',
    brief: 'AgentBuilder 分析任务复杂度、领域与签名',
    variables: ['task_content'],
    template: [
      'Analyze the following task and return its complexity, domain, and signature.',
      'Task: {{task_content}}',
      '',
      'Return ONLY JSON: {"complexity": <0-100 integer>, "domain": "<domain>", "signature": "<signature>"}',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.documentQuery,
    title: '文档阅读问答',
    brief: 'SelfLearning 基于文档上下文回答用户选中内容的问题',
    variables: ['selection', 'context_before', 'context_after', 'question'],
    template: [
      '请基于下面文档的上下文，回答用户关于选中内容的问题。请用中文回答。',
      '',
      '【选中内容的前文】',
      '{{context_before}}',
      '',
      '【选中的内容】',
      '{{selection}}',
      '',
      '【选中内容的后文】',
      '{{context_after}}',
      '',
      '【用户问题】',
      '{{question}}',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.profileAnalysis,
    title: '画像分析',
    brief: 'UserProfile 基于对话样本分析用户画像维度',
    variables: ['direction_key', 'direction_name', 'conversation_sample'],
    template: [
      'Analyze the user\'s "{{direction_name}}" ({{direction_key}}) based on these conversations:',
      '',
      '{{conversation_sample}}',
      '',
      'Return a JSON object with:',
      '{',
      '  "value": <the analyzed value - can be string, number, object, or array>,',
      '  "confidence": <number 0-1>,',
      '  "evidence": <array of evidence strings from the conversations>',
      '}',
      '',
      'Return ONLY valid JSON, no other text.',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.intentUnderstanding,
    title: '需求理解与意图比对',
    brief: 'IntentAgent 结合本次输入、时间线上下文、钉住信息和引用消息，理解真实需求并给出匹配度评分',
    variables: ['user_query', 'recent_history', 'pinned_info', 'citing_messages'],
    template: [
      '你是一个精通需求分析与意图识别的 AI 需求专家。请结合用户本次输入以及可用的上下文信息，综合分析并推断用户本次沟通的真实、完整的核心需求。',
      '',
      '【维度 1：用户本次输入】',
      '{{user_query}}',
      '{{#if recent_history}}',
      '',
      '【维度 2：基于时间的历史上下文】',
      '{{recent_history}}',
      '{{/if}}{{#if pinned_info}}',
      '',
      '【维度 3：钉住的固定信息】',
      '{{pinned_info}}',
      '{{/if}}{{#if citing_messages}}',
      '',
      '【维度 4：显式引用的消息】',
      '{{citing_messages}}',
      '{{/if}}',
      '',
      '请返回严格的 JSON 结构，不能包含任何 Markdown 标记或多余文字：',
      '{',
      '  "understood_requirement": "<改写为可直接交付执行 Agent 的、明确具体的任务描述，包含目标、范围与产出形式。禁止出现\"可能\"\"尚不明确\"\"需进一步确认\"等模糊表述。例如输入\"研究 Agent\"应输出\"请全面调研 AI Agent 的定义、核心架构、主流框架、应用场景与前沿挑战，输出一份结构化的技术研究报告\">",',
      '  "match_score": <0-100 整数，表示改写后需求与用户原始输入的匹配度/置信度评分>,',
      '  "reasoning": "<对分析推断过程和评分理由的简要说明>"',
      '}',
      '',
      '关键规则：',
      '1. understood_requirement 必须是可直接执行的具体任务描述，而非分析结论；',
      '2. 当用户输入极度模糊且无上下文可推断出具体任务时，match_score 应显著低于 80；',
      '3. 当用户输入虽简短但可合理推断出完整任务时，给出较高 match_score 并输出具体任务描述。',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.llmAttrGen,
    title: '模型属性生成',
    brief: 'LLMProvider 一键补全模型属性：生成简介与模型用途',
    variables: ['model_name', 'llm_type', 'provider_title'],
    template: [
      '你是一个模型属性生成助手。请根据给定的模型信息，为其生成「简介」和「模型用途」两段中文描述。',
      '',
      '【模型名称】',
      '{{model_name}}',
      '',
      '【模型类型】',
      '{{llm_type}}',
      '',
      '【提供商】',
      '{{provider_title}}',
      '',
      '请严格仅输出 JSON 格式结果，不能包含任何 Markdown 标记或多余文字：',
      '{',
      '  "llm_brief": "<一句话简介，说明模型是什么、擅长什么>",',
      '  "model_usage": "<模型用途描述，说明典型适用场景，用于模型动态选择，如：代码生成、长文本写作、数学推理>"',
      '}',
      '只输出必要内容，保持准确、完整、简洁，不输出多余说明。',
    ].join('\n'),
  },
  {
    id: PROMPT_IDS.identity,
    title: 'Brian 身份声明',
    brief: 'Runtime v2 主代理身份段：名称、角色、能力边界与沟通风格（始终位于 system 最前，身份问题由此回答）',
    variables: ['soul', 'task_directive'],
    template: [
      '# 身份',
      '',
      '你是 Brian，用户的智能个人助理。你具备记忆（信息与图谱）、反思与成长能力，并能调用已注入的工具完成任务。',
      '',
      '自我介绍规则（适用于「你是谁 / 你能做什么 / 介绍一下自己」类问题）：',
      '- 以「Brian」自称；',
      '- 只依据本「身份」段介绍，禁止罗列内部工具名称或系统实现细节；',
      '- 语气简洁自然，像正常人介绍自己，两到三句即可。',
      '',
      '{{#if soul}}',
      '# 人格',
      '',
      '{{soul}}',
      '',
      '{{/if}}',
      '# 任务',
      '',
      '{{task_directive}}',
      '',
      '通用规则：回答使用用户的语言，直接、简洁、可验证；需要工具时才调用工具，不需要时不调用；身份段与人格段冲突时以身份段为准。',
      '',
      '再次强调（最高优先级）：你的名字是 Brian。介绍自己时只说「我是 Brian，你的智能个人助理」并简述你能记忆、反思与帮你做事，两到三句话；绝不罗列工具清单或系统实现。',
    ].join('\n'),
  },
];

/** 按 ID 查找内置 Prompt 定义 */
export function getBuiltinPrompt(id: string): BuiltinPromptDef | undefined {
  return BUILTIN_PROMPTS.find((p) => p.id === id);
}

/** 按 ID 获取内置模板内容 */
export function getBuiltinTemplate(id: string): string | undefined {
  return getBuiltinPrompt(id)?.template;
}

/**
 * 处理 {{#if var}}...{{/if}} 条件块：当 var 为空（undefined / null / 空白字符串）时整块移除。
 * 供 renderTemplate 与 PromptsService.execPrompt 共用，避免空消息类型渲染出多余的空标题与占位内容。
 */
export function stripEmptyConditionalBlocks(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{\s*#if\s+([A-Za-z0-9_]+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g,
    (_full, key: string, body: string) => {
      const v = variables[key];
      const isEmpty = v === undefined || v === null || String(v).trim() === '';
      return isEmpty ? '' : body;
    },
  );
}

/**
 * 内存渲染模板（`{{变量}}` 替换），作为 DB 未就绪时的兜底。
 * 与 PromptsService.execPrompt 的替换语义一致（缺省变量替换为空字符串）。
 * 额外支持 {{#if var}}...{{/if}} 条件块。
 */
export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  const stripped = stripEmptyConditionalBlocks(template, variables);
  return stripped.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_full, key: string) => {
    const v = variables[key];
    return v === undefined || v === null ? '' : String(v);
  });
}
