# Visualization Application 测试用例

> 基于 [Visualization-PRD.md](../Visualization/Visualization-PRD.md) 生成，覆盖所有接口及 80%+ 场景。

---

## 测试约定

- 测试框架：vitest + supertest
- 独立测试环境：`beforeEach` 初始化临时 DB 及表结构
- 环境变量：`BRIAN_LOG_LEVEL=error`、`BRIAN_USE_SQLITE_GRAPH=true`
- 依赖 Mock：OrchestrationVisualization（visualizeAgentDAG/visualizeWorkFlow/getAgentNodeDetail）、AgentExecution（getTrace/getExecContext）、AgentLibrary（getAgent）、AgentContext（getContextByTrace/getContextDetail）、EvolutorAgent（getEvaluation）、PlannerAgent（getPlan）、InfoCore（lastNInfo/graphInfo/context）、各 Base Provider（LLM/Soul/Skill/MCP/Prompts/GraphDB/RelationDB）

---

## 1. 问答式消息可视化

### 1.1 获取增强消息列表 — getVisualizedMessages

**端点**：`GET /api/visualization/messages`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-VIS-001 | 按 session_id 查询 | session_id 有效 | HTTP 200，返回消息列表，每条含 info_id/info_creator_role/info/info_length/created/pin/citing_count/citing_info_ids/cited_info_ids/context_source/parent_info_ids |
| TC-VIS-002 | 按 work_id 查询 | work_id 有效 | HTTP 200，返回该 work 的消息 |
| TC-VIS-003 | 按 interact_id 查询 | interact_id 有效 | HTTP 200，返回该交互的消息 |
| TC-VIS-004 | 限定最近 N 条 | lastN=20 | 返回最近 20 条 |
| TC-VIS-005 | include_citing_info=true | 默认值 | 每条含 citing_info_ids 和 cited_info_ids |
| TC-VIS-006 | include_citing_info=false | 设置为 false | 不含引用关系字段 |
| TC-VIS-007 | include_context_source=true | 消息有上下文来源 | AGENT 消息含 context_source（如 "timeline"/"pinned"/"tag_relative" 等） |
| TC-VIS-008 | include_context_source=true（非 AGENT 消息） | USER 消息 | context_source=null |
| TC-VIS-009 | include_context_source=false | 默认值 | 不含 context_source |
| TC-VIS-010 | citing_count 正确 | 消息被 3 条消息引用 | citing_count=3 |
| TC-VIS-011 | 分页 | page_current + page_size | 分页正确 |
| TC-VIS-012 | 默认 lastN=50 | 不传 lastN | 返回最近 50 条 |
| TC-VIS-013 | 无参数查询 | 不传任何参数 | HTTP 200，messages=[], total=0（空结果） |
| TC-VIS-014 | 无消息 | 空会话 | messages=[], total=0 |
| TC-VIS-015 | info_length 正确 | 消息长度 500 | info_length=500 |

### 1.2 获取消息引用关系图 — getVisualizedMessageGraph

**端点**：`GET /api/visualization/message-graph`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-VIS-020 | 获取引用关系图 | session_id 有效 | HTTP 200，返回 session_id + graph（nodes + edges）+ metadata |
| TC-VIS-021 | nodes 属性完整 | 有消息节点 | 每条 node 含 info_id/info_creator_role/info_summary/created/pin/citing_count/cited_count/info_length |
| TC-VIS-022 | edges 属性完整 | 有引用关系 | 每条 edge 含 citing_info_id/cited_info_id/edge_type（CITATION/REPLY） |
| TC-VIS-023 | edge_type=CITATION | 引用关系（不同 work_id） | 边类型为 CITATION |
| TC-VIS-024 | edge_type=REPLY | 问答关系（同一 work_id） | 边类型为 REPLY |
| TC-VIS-025 | max_nodes 限制 | max_nodes=50 | 最多 50 个节点 |
| TC-VIS-026 | 默认 max_nodes=200 | 不传 | 最多 200 节点 |
| TC-VIS-027 | info_summary 截取 | 消息内容 > 50 字 | info_summary 为前 50 字 |
| TC-VIS-028 | session_id 缺失 | 不传 session_id | HTTP 400 |
| TC-VIS-029 | 无引用关系 | 空图 | nodes 含消息节点，edges=[] |
| TC-VIS-030 | metadata 正确 | 正常 | 含 total_nodes/total_edges/max_depth |

---

## 2. 系统执行过程可视化

### 2.1 获取 Agent DAG 可视化 — getVisualizedAgentDAG

**端点**：`GET /api/visualization/work/:work_id/dag`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-VIS-040 | 获取 DAG（解析 ID 引用） | resolve_content=true（默认） | HTTP 200，component_refs 中各 ID 解析为完整对象（strategy/llm/soul/skills/mcps/prompt_templates） |
| TC-VIS-041 | 获取 DAG（不解析） | resolve_content=false | HTTP 200，component_refs 中保留原始 ID 引用 |
| TC-VIS-042 | component_refs — strategy | 节点有 strategy_id | 解析为 { strategy_id, strategy_name } |
| TC-VIS-043 | component_refs — llm | 节点有 llm_id | 解析为 { llm_id, llm_title, llm_brief } |
| TC-VIS-044 | component_refs — soul | 节点有 soul_id | 解析为 { soul_id, soul_brief } |
| TC-VIS-045 | component_refs — skills | 节点有 skill_ids | 解析为 [{ skill_id, skill_brief }] |
| TC-VIS-046 | component_refs — mcps | 节点有 mcp_ids | 解析为 [{ mcp_id, mcp_title, mcp_brief }] |
| TC-VIS-047 | component_refs — prompt_templates | 节点有 prompt_template_ids | 解析为 { think: {...}, reflect: {...}, answer: {...} } |
| TC-VIS-048 | context_source_refs — pinned | 有钉住消息 | 含 count 和 samples（info_id + summary） |
| TC-VIS-049 | context_source_refs — timeline | 有时间线消息 | 含 count 和 samples |
| TC-VIS-050 | result_refs — evaluation | 节点有 eval_id | 解析为 { eval_id, overall, scores } |
| TC-VIS-051 | work_id 不存在 | work_id="nonexistent" | HTTP 404 |
| TC-VIS-052 | OrchestrationVisualization 返回错误 | 下层异常 | HTTP 500 |
| TC-VIS-053 | resolve_content 时下层资源 ID 不存在 | 某 skill_id 无效 | 对应字段为 null 或标记 "unknown" |
| TC-VIS-054 | 批量 ID 解析性能 | DAG 含 20+ Agent 节点 | 在合理时间内返回（< 5s） |

### 2.2 获取 Work 执行时间线 — getVisualizedWorkFlow

**端点**：`GET /api/visualization/work/:work_id/timeline`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-VIS-060 | 获取时间线 | work_id 有效 | HTTP 200，返回 workflow_timeline，各 phase 的 refs 解析为完整内容 |
| TC-VIS-061 | PLANNING phase | work 含规划阶段 | refs 中 plan_id 解析为 Task DAG 结构 |
| TC-VIS-062 | BUILD_AGENT_DAG phase | work 含构建阶段 | refs 中 agent_ids 解析为 Agent 简要信息（名称+类型） |
| TC-VIS-063 | EXECUTING phase | work 含执行阶段 | refs 中 agent_execution_ids 解析为执行摘要（status/elapsed_ms/iterations） |
| TC-VIS-064 | WRITING phase | work 含编写阶段 | refs 中 writer_agent_id 解析为 WriterAgent 信息 |
| TC-VIS-065 | EVALUATING phase | work 含评估阶段 | refs 中 eval_ids 解析为评估摘要列表 |
| TC-VIS-066 | work_id 不存在 | 无效 work_id | HTTP 404 |

### 2.3 获取 Agent 执行全链路 — getAgentTrace

**端点**：`GET /api/visualization/agent/:agent_id/trace`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-VIS-070 | 获取最新 trace | 不传 trace_id | HTTP 200，返回完整 trace：trace_id/agent_id/agent_name/agent_type/status/total_elapsed_ms/total_token_usage/iterations/steps/final_answer |
| TC-VIS-071 | 获取指定 trace | trace_id 指定 | HTTP 200，返回指定 trace |
| TC-VIS-072 | Think 步骤 | Agent 有 Think | step.phase=THINK，含 content/token_usage/elapsed_ms/timestamp |
| TC-VIS-073 | Act 步骤 | Agent 有 Act | step.phase=ACT，含 content + tool_calls（tool_type/tool_id/tool_name/params/result） |
| TC-VIS-074 | Reflect 步骤 | Agent 有 Reflect | step.phase=REFLECT，含 content |
| TC-VIS-075 | final_answer | Agent 有 Answer | phase=ANSWER，含 content/token_usage/elapsed_ms/timestamp |
| TC-VIS-076 | tool_calls 解析 — SKILL | tool_type=SKILL | 调用 SkillProvider.getSkill 解析为 Skill 名称 |
| TC-VIS-077 | tool_calls 解析 — MCP | tool_type=MCP | 调用 MCPProvider.getMcp 解析为 MCP 名称 |
| TC-VIS-078 | iterations 正确 | Agent 迭代 3 次 | iterations=3 |
| TC-VIS-079 | status=COMPLETED | Agent 执行成功 | status=COMPLETED |
| TC-VIS-080 | status=FAILED | Agent 执行失败 | status=FAILED |
| TC-VIS-081 | status=RUNNING | Agent 执行中 | status=RUNNING |
| TC-VIS-082 | agent_id 不存在 | 无效 agent_id | HTTP 404 |
| TC-VIS-083 | trace_id 不存在 | 无效 trace_id | HTTP 404 |
| TC-VIS-084 | 多 step（多轮迭代） | Agent 迭代 3 次，每轮含 Think+Act+Reflect | steps 包含 9 个 step，step 编号正确 |
| TC-VIS-085 | token_usage 统计 | 多步骤 | total_token_usage = 各步骤 token_usage 之和 |

---

## 3. 关联式消息可视化

### 3.1 获取消息关联 DAG — getVisualizedMessageDAG

**端点**：`GET /api/visualization/message-dag`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-VIS-095 | 获取完整 DAG | session_id 有效 | HTTP 200，返回 graph（nodes + edges）+ metadata |
| TC-VIS-096 | 按 work_id 限定范围 | work_id 指定 | 仅返回该 work 相关的节点和边 |
| TC-VIS-097 | include_question_answer_edges=true | 默认值 | 含 QUESTION_ANSWER 边 |
| TC-VIS-098 | include_question_answer_edges=false | 设为 false | 不含 QUESTION_ANSWER 边 |
| TC-VIS-099 | include_citation_edges=true | 默认值 | 含 CITATION 边 |
| TC-VIS-100 | include_citation_edges=false | 设为 false | 不含 CITATION 边 |
| TC-VIS-101 | 仅问答边 | citation_edges=false, question_answer_edges=true | 仅含 QUESTION_ANSWER 边 |
| TC-VIS-102 | 仅引用边 | citation_edges=true, question_answer_edges=false | 仅含 CITATION 边 |
| TC-VIS-103 | max_nodes 限制 | max_nodes=100 | 最多 100 节点 |
| TC-VIS-104 | 同 work_id 建立 QUESTION_ANSWER | 一次 work 含 REQUEST→RESPONSE | 两消息节点间边 edge_type=QUESTION_ANSWER |
| TC-VIS-105 | 引用边 CITATION | 一条消息引用另一条 | 边 edge_type=CITATION |
| TC-VIS-106 | nodes 属性完整 | 正常 | 每条含 info_id/info_creator_role/info_summary/created/pin/work_id/interact_id |
| TC-VIS-107 | metadata 正确 | 正常 | 含 total_nodes/total_edges/question_answer_edges/citation_edges |
| TC-VIS-108 | session_id 缺失 | 不传 session_id | HTTP 400 |
| TC-VIS-109 | 无消息 | 空会话 | nodes=[], edges=[] |
| TC-VIS-110 | 超大图性能 | session 含 500+ 消息 | 按 max_nodes 限制 + 优先返回最近节点 |
| TC-VIS-110-P | 超大图性能（500+ 消息） | session 含 500+ 消息 | 按 max_nodes=50 限制，按 recency 降序返回节点 |

---

## 4. 资源内容查询

### 4.1 通用资源查询 — getResource

**端点**：`GET /api/visualization/resource/:resource_type/:resource_id`

| 编号 | 测试场景 | resource_type | 前置条件 | 预期结果 |
|------|---------|--------------|---------|---------|
| TC-VIS-120 | 查询 Agent | agent | agent_id 有效 | HTTP 200，返回 Agent 元数据（名称/类型/策略/生命周期） |
| TC-VIS-121 | 查询 LLM | llm | llm_id 有效 | HTTP 200，返回 LLM 详情（名称/提供商/适用范围） |
| TC-VIS-122 | 查询 Soul | soul | soul_id 有效 | HTTP 200，返回 Soul 完整内容 |
| TC-VIS-123 | 查询 Skill | skill | skill_id 有效 | HTTP 200，返回 Skill（brief/work/scripts 等） |
| TC-VIS-124 | 查询 MCP | mcp | mcp_id 有效 | HTTP 200，返回 MCP 详情（名称/安装状态/命令） |
| TC-VIS-125 | 查询 Prompt | prompt | prompt_id 有效 | HTTP 200，返回 Prompt 模板完整内容 |
| TC-VIS-126 | 查询 Trace | trace | trace_id 有效 | HTTP 200，返回执行追踪全链路 |
| TC-VIS-127 | 查询 Info | info | info_id 有效 | HTTP 200，返回消息完整内容 |
| TC-VIS-128 | 查询 Eval | eval | eval_id 有效 | HTTP 200，返回评估详情 |
| TC-VIS-129 | 查询 Plan | plan | plan_id 有效 | HTTP 200，返回规划详情和 Task DAG |
| TC-VIS-130 | 查询 Context | context | context_id 有效 | HTTP 200，返回上下文快照详情 |
| TC-VIS-131 | resource_type 非法 | invalid_type | — | HTTP 400，列出支持的 resource_type |
| TC-VIS-132 | resource_id 不存在（各类型通用） | agent | agent_id="nonexistent" | HTTP 404 |
| TC-VIS-133 | resource_id 为空 | agent | resource_id="" | HTTP 400 |

---

## 5. 配置（委托 Config Application）

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-VIS-140 | Visualization 模块配置为内部方法 | 直接调用 service.configVisualization | 成功返回配置（内部方法） |
| TC-VIS-141 | 配置更新 — 最大节点数 | max_nodes_per_graph=300 | 成功更新并持久化 |
| TC-VIS-142 | 配置更新 — 摘要长度 | default_message_summary_length=80 | 成功更新 |
| TC-VIS-143 | 配置更新 — 默认解析 | resolve_content_by_default=false | 成功更新 |

---

## 覆盖率矩阵

| 功能模块 | 接口数 | 测试用例数 | 场景覆盖 |
|---------|--------|----------|---------|
| 增强消息列表 | 1 | 16 | 查询 + 引用 + 上下文来源 + 分页 + 空参数 |
| 消息引用关系图 | 1 | 11 | 节点+边 + 边类型 + 摘要 + max_nodes |
| Agent DAG 可视化 | 1 | 15 | ID 解析（5 类资源）+ 上下文来源 + 评估结果 + resolve_content |
| Work 执行时间线 | 1 | 7 | 5 个 phase 的 refs 解析 |
| Agent 执行全链路 | 1 | 17 | Think/Act/Reflect/Answer + 多轮迭代 + 状态 + token |
| 消息关联 DAG | 1 | 17 | 问答边 + 引用边 + 过滤 + 性能 |
| 资源内容查询 | 1 | 14 | 11 种资源类型 + 路由 + 404 |
| 配置委托 | — | 4 | 内部方法验证 + 配置持久化 |

**总计**：7 个 HTTP 端点，101 个测试用例，覆盖消息可视化、执行过程可视化、关联可视化、资源查询、配置管理等完整前端可视化需求。
