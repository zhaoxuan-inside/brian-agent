# Visualization Application

## 1. 设计目标

1. 对下层（Orchestration 层、Agent 层、Core 层）可视化能力进行封装和扩展，提供面向前端渲染的完整可视化数据；
2. 提供问答式消息可视化数据：消息内容、引用关系、时间信息、钉住状态等；
3. 提供系统执行过程可视化数据：Agent DAG 图、每个 Agent 执行的完整信息（依赖上下文、使用组件、执行结果）；
4. 提供关联式消息可视化数据：消息之间的引用关系 DAG 图、问答关系图；
5. 提供统一的资源内容查询入口，前端通过 ID 引用获取各资源（Agent、LLM、Soul、Skill、MCP、Prompt、Trace、Info）的完整内容。

## 2. 模块职责

Visualization Application 是系统可视化数据的统一封装层，位于 Application 层。它主要作为 Orchestration 层可视化能力（OrchestrationVisualization）的上层封装，同时补充 Orchestration 层不直接提供的可视化数据（如消息列表、资源内容查询），将 ID 引用解析为完整内容后返回给前端。

### 与 Chat Application 的分工

| 功能 | Chat Application | Visualization Application |
|------|-----------------|--------------------------|
| Agent DAG 图 | 透传 OrchestrationVisualization 数据 | 提供更丰富的扩展数据（含完整资源内容） |
| Work 时间线 | 透传 OrchestrationVisualization 数据 | 提供更丰富的扩展数据 |
| 消息历史列表 | 提供 | 提供增强版（含引用关系、上下文分类） |
| 消息引用关系图 | 提供 | 提供增强版 |
| 资源内容查询 | 不提供 | 提供（根据 ID 查询任意资源完整内容） |
| 执行过程全链路展开 | 不提供 | 提供（按 trace_id 展开 Think/Act/Reflect/Answer） |

### 依赖关系

| 依赖层级 | 模块 | 调用接口 | 用途 |
|---------|------|---------|------|
| Orchestration | OrchestrationVisualization | visualizeAgentDAG | 获取 Agent DAG 结构 |
| Orchestration | OrchestrationVisualization | visualizeWorkFlow | 获取 Work 流程时间线 |
| Orchestration | OrchestrationVisualization | getAgentNodeDetail | 获取单个 Agent 节点详情 |
| Agent | AgentExecution | getTrace | 获取执行追踪全链路（Think/Act/Reflect/Answer） |
| Agent | AgentExecution | getExecContext | 获取执行上下文来源分类 |
| Agent | AgentLibrary | getAgent | 获取 Agent 元数据 |
| Agent | AgentContext | getContextByTrace | 获取上下文快照 |
| Agent | AgentContext | getContextDetail | 获取上下文详情（info_id 列表） |
| Agent | EvolutorAgent | getEvaluation | 获取评估记录 |
| Agent | PlannerAgent | getPlan | 获取 Plan 和 Task DAG |
| Core | InfoCore | lastNInfo | 获取 info 内容 |
| Core | InfoCore | graphInfo | 获取消息引用图结构 |
| Core | InfoCore | context | 获取上下文数据 |
| Base | LLMProvider | getLLM / soLLM | 获取 LLM 详情 |
| Base | SoulProvider | getSoul / soSoul | 获取 Soul 详情 |
| Base | SkillProvider | getSkill / soSkill | 获取 Skill 详情 |
| Base | MCPProvider | getMcp / soMcp | 获取 MCP 详情 |
| Base | PromptsProvider | getPrompt / soPrompt | 获取 Prompt 模板详情 |
| Base | GraphDBProvider | selectGraph / getGraphNeighbors | 获取 Tag 图数据 |
| Base | RelationDBProvider | selectDB | 查询各类记录 |
| Base | LogProvider | debug / info / warn / error | 日志记录 |

## 3. 功能设计

### 3.1. 问答式消息可视化

#### 3.1.1. 获取增强消息列表（getVisualizedMessages）

**功能**：获取指定会话/工作的消息列表，附加引用关系、上下文来源等增强信息

**URL**：`GET /api/visualization/messages`

**入参（Query String）**：
- session_id（STRING，可选）
- work_id（STRING，可选）
- interact_id（STRING，可选）
- lastN（INT，可选）：最近 N 条，默认 50
- include_citing_info（BOOLEAN，可选）：是否包含引用关系，默认 true
- include_context_source（BOOLEAN，可选）：是否包含上下文来源标注，默认 false（仅 Agent 产生的消息）
- page_current（INT，可选）
- page_size（INT，可选）

**输出**：
```json
{
  "messages": [
    {
      "info_id": "info_uuid",
      "info_creator_role": "USER",
      "info": "用户消息内容",
      "info_length": 100,
      "created": "2026-07-30T10:00:00.000Z",
      "pin": false,
      "citing_count": 3,
      "citing_info_ids": ["info_uuid_1", "info_uuid_2"],
      "cited_info_ids": ["info_uuid_3"],
      "context_source": null,
      "parent_info_ids": []
    },
    {
      "info_id": "info_uuid_2",
      "info_creator_role": "AGENT",
      "info": "Agent 输出内容",
      "info_length": 500,
      "created": "2026-07-30T10:00:05.000Z",
      "pin": true,
      "citing_count": 1,
      "citing_info_ids": [],
      "cited_info_ids": [],
      "context_source": "timeline",
      "parent_info_ids": ["info_uuid"]
    }
  ],
  "total": 100
}
```

**处理流程**：

1. 调用 InfoCore.lastNInfo 查询消息列表；
2. 对每条消息，调用 RelationDBProvider.selectDB 查询 `info_graph` 表获取引用关系（citing_info_ids 和 cited_info_ids）；
3. 统计被引用次数（citing_count）；
4. 若 include_context_source=true 且消息为 AGENT 角色，查询 AgentContext 获取该消息的上下文来源；
5. 分页返回；

#### 3.1.2. 获取消息引用关系图（getVisualizedMessageGraph）

**功能**：获取会话内消息的引用关系图（节点+边），包含节点增强信息

**URL**：`GET /api/visualization/message-graph`

**入参（Query String）**：
- session_id（STRING，必选）
- max_nodes（INT，可选）：最大节点数，默认 200

**输出**：
```json
{
  "session_id": "session_uuid",
  "graph": {
    "nodes": [
      {
        "info_id": "info_uuid",
        "info_creator_role": "USER",
        "info_summary": "用户消息摘要（前50字）",
        "created": "2026-07-30T10:00:00.000Z",
        "pin": false,
        "citing_count": 3,
        "cited_count": 1,
        "info_length": 100
      }
    ],
    "edges": [
      {
        "citing_info_id": "info_uuid_2",
        "cited_info_id": "info_uuid",
        "edge_type": "CITATION"
      },
      {
        "citing_info_id": "info_uuid_3",
        "cited_info_id": "info_uuid",
        "edge_type": "REPLY"
      }
    ]
  },
  "metadata": {
    "total_nodes": 50,
    "total_edges": 35,
    "max_depth": 3
  }
}
```

**处理流程**：

1. 调用 InfoCore.graphInfo 获取消息引用关系图结构；
2. 对每个节点，补充 info_summary（截取前 50 字）、citing_count、cited_count；
3. 边类型区分：直接问答关系标注为 REPLY（来自同一 work_id），引用关系标注为 CITATION；
4. 按 max_nodes 限制节点数，优先保留最近的节点；

### 3.2. 系统执行过程可视化

#### 3.2.1. 获取 Agent DAG 可视化（getVisualizedAgentDAG）

**功能**：获取一次 work 的 Agent DAG 完整可视化数据，**将 OrchestrationVisualization 的 ID 引用解析为完整内容**

**URL**：`GET /api/visualization/work/:work_id/dag`

**入参**：
- work_id（Path Param，必选）
- resolve_content（BOOLEAN，可选）：是否将 ID 引用解析为完整内容，默认 true

**输出**：

结构同 OrchestrationVisualization.visualizeAgentDAG 返回的 agent_dag_structure，但当 resolve_content=true 时：

- `component_refs` 中的 ID 引用被解析为完整对象：
  ```json
  {
    "strategy": { "strategy_id": "...", "strategy_name": "CoT" },
    "llm": { "llm_id": "...", "llm_title": "GPT-4o", "llm_brief": "..." },
    "soul": { "soul_id": "...", "soul_brief": "专业的技术助手" },
    "skills": [{ "skill_id": "...", "skill_brief": "..." }],
    "mcps": [{ "mcp_id": "...", "mcp_title": "...", "mcp_brief": "..." }],
    "prompt_templates": {
      "think": { "prompt_template_id": "...", "prompt_template_title": "..." },
      "reflect": { "prompt_template_id": "...", "prompt_template_title": "..." },
      "answer": { "prompt_template_id": "...", "prompt_template_title": "..." }
    }
  }
  ```

- `context_source_refs` 中的 info_ids 被解析为消息摘要列表：
  ```json
  {
    "pinned": { "count": 1, "samples": [{ "info_id": "...", "summary": "..." }] },
    "timeline": { "count": 20, "samples": [{ "info_id": "...", "summary": "..." }] }
  }
  ```

- `result_refs` 中的 eval_id 被解析为评估摘要：
  ```json
  {
    "evaluation": { "eval_id": "...", "overall": 85, "scores": { "correctness": 90, "completeness": 80 } }
  }
  ```

**处理流程**：

1. 调用 OrchestrationVisualization.visualizeAgentDAG(work_id) 获取 DAG 结构（ID 引用模式）；
2. 若 resolve_content=true，对每个节点：
   a. 调用 AgentLibrary.getAgent(agent_id) → 获取 Agent 名称、类型；
   b. 调用 LLMProvider.getLLM(llm_id) → 获取 LLM 详情；
   c. 调用 SoulProvider.getSoul(soul_id) → 获取 Soul 详情；
   d. 调用 SkillProvider.getSkill(skill_id)（批量）→ 获取 Skill 列表详情；
   e. 调用 MCPProvider.getMcp(mcp_id)（批量）→ 获取 MCP 列表详情；
   f. 调用 PromptsProvider.getPrompt(prompt_template_id)（批量）→ 获取 Prompt 模板详情；
   g. 调用 InfoCore.lastNInfo(info_id)（批量）→ 获取上下文消息摘要；
   h. 调用 EvolutorAgent.getEvaluation(agent_id) → 获取评估摘要；
3. 返回完整 DAG 数据；

#### 3.2.2. 获取 Work 执行时间线（getVisualizedWorkFlow）

**功能**：获取一次 work 的完整执行阶段时间线，含各阶段详细信息

**URL**：`GET /api/visualization/work/:work_id/timeline`

**入参**：
- work_id（Path Param，必选）

**输出**：

结构同 OrchestrationVisualization.visualizeWorkFlow 返回的 workflow_timeline，但每个 phase 的 refs 中的 ID 引用被解析为丰富内容：

- PLANNING phase：refs 中的 plan_id → 调用 PlannerAgent.getPlan 获取完整 Task DAG 结构；
- BUILD_AGENT_DAG phase：refs 中的 agent_ids → 获取各 Agent 的简要信息（名称、类型）；
- EXECUTING phase：refs 中的 agent_execution_ids → 获取各 Agent 的执行摘要（status、elapsed_ms、iterations）；
- WRITING phase：refs 中的 writer_agent_id → 获取 WriterAgent 的信息；
- EVALUATING phase：refs 中的 eval_ids → 获取评估摘要列表；

**处理流程**：

1. 调用 OrchestrationVisualization.visualizeWorkFlow(work_id) 获取时间线数据；
2. 对每个 phase 的 refs，按需调用下层接口解析 ID 引用为完整内容；
3. 返回丰富后的时间线数据；

#### 3.2.3. 获取 Agent 执行全链路（getAgentTrace）

**功能**：获取指定 Agent 的完整执行追踪链路（Think → Act → Reflect → Answer），供前端展开查看

**URL**：`GET /api/visualization/agent/:agent_id/trace`

**入参**：
- agent_id（Path Param，必选）
- trace_id（Query String，可选）：指定 trace_id，不传则查询最新

**输出**：
```json
{
  "trace_id": "trace_uuid",
  "agent_id": "agent_uuid",
  "agent_name": "WorkAgent-001",
  "agent_type": "WORKER",
  "status": "COMPLETED",
  "total_elapsed_ms": 8500,
  "total_token_usage": 2500,
  "iterations": 3,
  "steps": [
    {
      "step": 1,
      "phase": "THINK",
      "content": "我需要分析用户的问题...",
      "token_usage": 200,
      "elapsed_ms": 800,
      "timestamp": "2026-07-30T10:00:01.000Z"
    },
    {
      "step": 1,
      "phase": "ACT",
      "content": "调用 Skill 获取数据...",
      "token_usage": 150,
      "elapsed_ms": 1200,
      "timestamp": "2026-07-30T10:00:02.200Z",
      "tool_calls": [
        {
          "tool_type": "SKILL",
          "tool_id": "skill_uuid",
          "tool_name": "DataQuery",
          "params": { "query": "SELECT * FROM ..." },
          "result": "查询结果..."
        }
      ]
    },
    {
      "step": 1,
      "phase": "REFLECT",
      "content": "数据已获取，结果符合预期...",
      "token_usage": 100,
      "elapsed_ms": 500,
      "timestamp": "2026-07-30T10:00:02.700Z"
    }
  ],
  "final_answer": {
    "phase": "ANSWER",
    "content": "根据分析，您的问题答案是...",
    "token_usage": 300,
    "elapsed_ms": 600,
    "timestamp": "2026-07-30T10:00:09.500Z"
  }
}
```

**处理流程**：

1. 调用 AgentExecution.getTrace(trace_id) 获取执行追踪全链路数据；
2. 对每个 step 的 tool_calls，解析 tool_type（SKILL/MCP/LLM）对应的资源信息：
   a. SKILL → 调用 SkillProvider.getSkill(tool_id) 获取 Skill 名称；
   b. MCP → 调用 MCPProvider.getMcp(tool_id) 获取 MCP 名称；
3. 计算每步的 token_usage 和 elapsed_ms；
4. 返回完整追踪链路；

### 3.3. 关联式消息可视化

#### 3.3.1. 获取消息关联 DAG 图（getVisualizedMessageDAG）

**功能**：获取用户和系统消息之间的完整关联关系 DAG 图，包括问答关系、引用和被引用关系

**URL**：`GET /api/visualization/message-dag`

**入参（Query String）**：
- session_id（STRING，必选）
- work_id（STRING，可选）：限定到某个 work 范围
- include_question_answer_edges（BOOLEAN，可选）：是否包含问答关系边，默认 true
- include_citation_edges（BOOLEAN，可选）：是否包含引用关系边，默认 true
- max_nodes（INT，可选）：最大节点数，默认 200

**输出**：
```json
{
  "session_id": "session_uuid",
  "graph": {
    "nodes": [
      {
        "info_id": "info_uuid",
        "info_creator_role": "USER",
        "info_summary": "用户消息摘要（前50字）",
        "created": "2026-07-30T10:00:00.000Z",
        "pin": false,
        "work_id": "work_uuid_1",
        "interact_id": "interact_uuid_1"
      }
    ],
    "edges": [
      {
        "from_info_id": "info_uuid_2",
        "to_info_id": "info_uuid",
        "edge_type": "QUESTION_ANSWER",
        "work_id": "work_uuid_1"
      },
      {
        "from_info_id": "info_uuid_3",
        "to_info_id": "info_uuid",
        "edge_type": "CITATION",
        "work_id": "work_uuid_2"
      }
    ]
  },
  "metadata": {
    "total_nodes": 80,
    "total_edges": 120,
    "question_answer_edges": 50,
    "citation_edges": 70
  }
}
```

**处理流程**：

1. 调用 InfoCore.lastNInfo 查询 session 下的所有消息（作为节点）；
2. 若 include_question_answer_edges=true：
   a. 调用 RelationDBProvider.selectDB 查询 `info_raw` 表，按 work_id 分组；
   b. 同 work_id 内的 USER 消息（REQUEST）→ SYSTEM 消息（RESPONSE）建立 QUESTION_ANSWER 边；
3. 若 include_citation_edges=true：
   a. 调用 RelationDBProvider.selectDB 查询 `info_graph` 表获取引用关系；
   b. 建立 CITATION 边（citing_info_id → cited_info_id）；
4. 按 max_nodes 限制节点数，优先保留最近的节点；
5. 返回 DAG 数据；

### 3.4. 资源内容查询

#### 3.4.1. 通用资源查询（getResource）

**功能**：根据资源类型和 ID 获取任意资源的完整内容，供前端按 ID 展开详情

**URL**：`GET /api/visualization/resource/:resource_type/:resource_id`

**资源类型路由**：

| resource_type | 调用接口 | 返回内容 |
|--------------|---------|---------|
| agent | AgentLibrary.getAgent | Agent 元数据（名称、类型、策略、生命周期状态） |
| llm | LLMProvider.getLLM | LLM 详情（名称、提供商、适用范围） |
| soul | SoulProvider.getSoul | Soul 完整内容 |
| skill | SkillProvider.getSkill | Skill 完整内容（brief、work、scripts 等） |
| mcp | MCPProvider.getMcp | MCP 详情（名称、安装状态、命令） |
| prompt | PromptsProvider.getPrompt | Prompt 模板完整内容 |
| trace | AgentExecution.getTrace | 执行追踪全链路 |
| info | InfoCore.lastNInfo | 消息完整内容 |
| eval | EvolutorAgent.getEvaluation | 评估详情 |
| plan | PlannerAgent.getPlan | 规划详情和 Task DAG |
| context | AgentContext.getContextDetail | 上下文快照详情 |

**处理流程**：

1. 根据 resource_type 路由到对应下层模块接口；
2. 调用下层接口获取资源数据；
3. 返回资源内容；

### 3.5. 配置（configVisualization）

**功能**：配置 Visualization Application 的参数

**URL**：`POST /api/visualization/config`

**入参**：
- input：ConfigVisualizationInput（继承 Input），包含以下字段：
  - max_nodes_per_graph（INT，可选）：单图最大节点数，默认 200
  - default_message_summary_length（INT，可选）：消息摘要默认长度（字符数），默认 50
  - resolve_content_by_default（BOOLEAN，可选）：是否默认解析 ID 引用为完整内容，默认 true
  - max_context_samples_per_source（INT，可选）：每个上下文来源最多展示的样本数，默认 3
- context：ConfigVisualizationContext（继承 Context）
- output：ConfigVisualizationOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `visualization_config` 表；
2. 校验并更新传入的非空字段；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置；

## 4. 重要内容

1. 所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；
2. Visualization Application 是 OrchestrationVisualization 的上层封装，核心价值在于将 ID 引用解析为完整内容，减少前端多次请求；
3. ID 引用解析策略：resolve_content 参数控制是否展开 ID 引用，默认展开；当 DAG 节点数超过阈值时，可仅返回 ID 引用以减少数据传输量；
4. 资源内容查询（getResource）提供统一的资源查询入口，前端按需钻取详情；
5. 消息摘要生成：对于大段消息内容，截取前 N 字符生成摘要，避免传输大量文本；
6. 所有外部资源访问必须通过对应的 Provider/Access 层，禁止绕过；
7. 所有日志通过 LogProvider 记录，禁止 console.log；
8. 所有 ID 通过 IdGenerator.generate() 生成；

## 5. 表设计

### 5.1. Visualization 配置表（SQLite）

- 表名：visualization_config
- 库名：visualization

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| max_nodes_per_graph | 单图最大节点数 | INT | N | | 默认 200 |
| default_message_summary_length | 消息摘要默认长度 | INT | N | | 默认 50 |
| resolve_content_by_default | 默认解析 ID 引用 | BOOLEAN | N | | 默认 true |
| max_context_samples_per_source | 每个来源最多样本数 | INT | N | | 默认 3 |

## 6. 前端页面需求覆盖

| 前端页面需求 | 对应接口 | 说明 |
|------------|---------|------|
| 问答消息内容展示 | getVisualizedMessages | 消息列表（含引用、时间、钉住状态） |
| 消息引用关系展示 | getVisualizedMessageGraph | 消息引用关系图（节点+边） |
| 消息时间展示 | getVisualizedMessages（created 字段） | 消息时间戳 |
| 消息钉住状态 | getVisualizedMessages（pin 字段） | 钉住标识 |
| 系统处理 Agent 展示 | getVisualizedAgentDAG | Agent DAG 图（含完整组件信息） |
| Agent 执行详情 | getAgentTrace | Think/Act/Reflect/Answer 全链路 |
| Agent 依赖上下文 | getVisualizedAgentDAG（context_source_refs） | 上下文来源分类和消息摘要 |
| Agent 使用组件 | getVisualizedAgentDAG（component_refs） | LLM/Prompt/Skill/MCP/Soul |
| Agent 依赖关系 DAG | getVisualizedAgentDAG + getVisualizedWorkFlow | DAG 图和执行时间线 |
| 消息关联关系 DAG | getVisualizedMessageDAG | 问答关系+引用关系 DAG |
| 资源详情展开 | getResource | 按资源类型查询任意资源内容 |
| ChatMap 卡片详情 | getVisualizedMessageGraph | 消息图节点和边 |