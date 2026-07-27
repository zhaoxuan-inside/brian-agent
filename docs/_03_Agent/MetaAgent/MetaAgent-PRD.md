# MetaAgent（元 Agent）

## 1. 设计目标

1. **Agent 分析**：对接收到的用户工作请求进行任务特征分析，识别任务意图、复杂度、领域及所需能力，为后续 Agent 构建提供决策依据。
2. **Agent 构建**：根据任务特征，从 Core 层选择合适的 LLM、Skill、MCP、Soul（人格配置）与执行策略（Strategy），组装出一个可执行的 WorkAgent 实例。
3. **Agent 复用**：优先从 Agent 持久化层中检索与当前任务特征相似的已有 Agent，命中后复用并强化其使用统计，避免重复构建，提升响应效率。
4. **Agent 提交**：将构建/复用的 Agent 提交给 Agent 执行框架，并保证 Agent 已持久化，完成工作下发。
5. **与 Core 层解耦协作**：MetaAgent 通过依赖注入持有 LLMService、InformationService、ToolService、SkillManager 等 Core 层服务引用以及 Agent 持久化层服务引用，仅通过接口调用完成能力组装，不直接持有底层资源。
6. **切面可观测**：所有接口通过代理模式包装，支持日志注入与耗时统计，便于分析 Agent 构建链路性能。

---

## 2. 功能设计

### 2.1. 接收工作（receiveWork）

**功能**：接收上层下发的用户工作请求或自学习请求，基于历史对话构建上下文，输出标准化任务对象。

**入参**：
- input：ReceiveWorkInput（继承 Input），包含以下字段：
  - type：工作类型（user / self_learn）
  - content：工作内容
  - conversation_id：会话ID（可选）
- context：ReceiveWorkContext（继承 Context），会话上下文（session_id, work_id, interact_id, msg_id 等）
- output：ReceiveWorkOutput（继承 Output），承载返回内容：
  - task：标准化任务对象

**处理流程**：

1. 若 `input.conversation_id` 存在，调用 `InformationService.buildContext` 基于内容与会话 ID 构建历史记忆上下文；
2. 将 `input.type` 与 `input.content` 封装为标准化任务对象 `{ type, content }`；
3. 将任务对象写入 output 返回；

**返回**：Boolean，表示工作接收是否完成

---

### 2.2. 分析任务（analyzeTask）

**功能**：对任务内容进行特征分析，输出任务意图、复杂度、领域及所需能力列表，作为 Agent 构建与策略选择的决策依据。

**入参**：
- input：AnalyzeTaskInput（继承 Input），包含以下字段：
  - content：任务内容
- context：AnalyzeTaskContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：AnalyzeTaskOutput（继承 Output），承载返回内容：
  - intent：任务意图
  - complexity：复杂度
  - domain：领域
  - required_capabilities：所需能力列表

**处理流程**：

1. 提取任务内容文本，统一转为小写以便规则匹配；
2. **意图检测**：通过正则规则匹配识别意图类型，包括 `debugging`、`code_generation`、`explanation`、`analysis`、`creation`、`search`、`summarization`、`transformation`、`planning`，默认为 `general`；
3. **领域检测**：通过正则规则匹配识别领域，包括 `frontend`、`backend`、`data_science`、`devops`、`security`、`mobile`，默认为 `general`；
4. **复杂度估算**：基础复杂度 0.1，按内容词数（每 200 词 +0.2，上限 0.2）与复杂度指示词（多实例/数据库/集成/实时等，每命中 +0.15）累加，最终上限 1.0；
5. **所需能力识别**：通过正则匹配识别 `code_generation`、`search`、`analysis`、`content_writing`、`testing` 等能力标签；
6. 将任务特征写入 output 返回；

**返回**：Boolean，表示任务分析是否完成

---

### 2.3. 构建 Agent（buildAgent）

**功能**：根据任务特征，从 Core 层选择 LLM、Skill、MCP、Soul 并组装 Prompt 与策略，构建一个完整可执行的 WorkAgent 实例。

**入参**：
- input：BuildAgentInput（继承 Input），包含以下字段：
  - intent：任务意图
  - complexity：复杂度
  - domain：领域
  - required_capabilities：所需能力列表
- context：BuildAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：BuildAgentOutput（继承 Output），承载返回内容：
  - agent_instance：构建完成的 WorkAgent 实例

**处理流程**：

1. 调用 `selectLLM` 选择 LLM 配置：优先通过 `LLMService.registry.select`（`strategy: auto`）自动选择模型，失败时回退到注册表首个模型，最终回退到默认配置（temperature 0.5，maxTokens 4096）；
2. 调用 `selectSkills` 选择 Skill：将任务特征映射到 Skill 类别（code_generation、debugging、search 等），通过 `SkillManager.listSkills` 查询已安装 Skill，按类别匹配收集 skill_id 列表，无匹配时使用 `general_purpose`；
3. 调用 `selectMCP` 选择 MCP：通过正则匹配任务特征，映射到预置 MCP 包（filesystem、github、postgres、brave-search、puppeteer、fetch、memory）；
4. 调用 `generatePrompt` 生成 Prompt：通过 `getWorkTemplate` 获取工作模板，调用 `configureSoul` 生成 Soul 配置（style、personality、contentRules、constraints、temperatureProfile），组装 system prompt（含中文回复要求、风格、能力声明）与 instruction；
5. 调用 `selectStrategy` 选择策略：复杂度 >= 0.7 选 `plan-execute`；0.4-0.7 且为分析/解释/代码意图选 `cot`；动作为 creation/debugging/search 类选 `react`；默认 `react`；
6. 生成 UUID 作为 agent_id，组装 WorkAgent 对象（含 strength=1.0、useCount=0、reliability=0.5 等初始字段）；
7. 将 WorkAgent 写入 output 返回；

**返回**：Boolean，表示 Agent 构建是否完成；构建的 Agent 通过 output 参数返回

---

### 2.4. 复用 Agent（reuseAgent）

**功能**：从持久化层查找与当前任务特征相似的已有 Agent，命中后强化其使用统计并返回，避免重复构建。

**入参**：
- input：ReuseAgentInput（继承 Input），包含以下字段：
  - intent：任务意图
  - complexity：复杂度
  - domain：领域
  - required_capabilities：所需能力列表
- context：ReuseAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ReuseAgentOutput（继承 Output），承载返回内容：
  - agent_instance：复用的 WorkAgent 实例（未命中时为空，可选）

**处理流程**：

1. 调用 Agent 持久化层的相似检索接口，传入任务特征，获取相似 Agent 列表（按相似度降序，过滤低于阈值 0.3 的结果）；
2. 若列表非空，取相似度最高的 Agent（best）；
3. 调用持久化层对该 Agent 进行正向强化（strength += 0.1，上限 1.0），更新使用统计；
4. 将 best 写入 output 返回；
5. 若列表为空，output 返回空，表示无可用复用 Agent；

**返回**：Boolean，表示复用查找是否完成；是否命中通过 output 是否为空判断

---

### 2.5. 提交工作（submitWork）

**功能**：将构建/复用的 Agent 提交给执行框架，并确保 Agent 已持久化，返回执行 ID。

**入参**：
- input：SubmitWorkInput（继承 Input），包含以下字段：
  - agent：WorkAgent 实例
  - task：任务对象
- context：SubmitWorkContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SubmitWorkOutput（继承 Output），承载返回内容：
  - execution_id：执行ID

**处理流程**：

1. 生成 UUID 作为 execution_id；
2. 检查该 Agent 是否已在持久化层存储；
3. 若未持久化，调用持久化层存储 Agent；
4. 将 execution_id 写入 output 返回，供上层执行框架调度；

**返回**：Boolean，表示工作提交是否完成

---

### 2.6. 保存 Agent（saveAgent）

**功能**：将 Agent 显式保存到持久化层，供后续复用与统计。

**入参**：
- input：SaveAgentInput（继承 Input），包含以下字段：
  - agent：WorkAgent 实例
- context：SaveAgentContext（继承 Context），会话上下文（session_id, work_id 等）
- output：SaveAgentOutput（继承 Output），承载返回内容：
  - agent_id：持久化后的 agent_id

**处理流程**：

1. 调用持久化层存储接口，传入 Agent 实例；
2. 将返回的 agent_id 写入 output；

**返回**：Boolean，表示 Agent 保存是否完成

---

### 2.7. 获取 Agent（getAgent）

**功能**：根据 agent_id 从持久化层获取 Agent 详情。

**入参**：
- input：GetAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent唯一标识
- context：GetAgentContext（继承 Context），会话上下文
- output：GetAgentOutput（继承 Output），承载返回内容：
  - agent_instance：WorkAgent 实例（不存在时为空，可选）

**处理流程**：

1. 调用持久化层的查询接口，传入 agent_id；
2. 将结果写入 output 返回；

**返回**：Boolean，表示 Agent 获取是否完成

---

### 2.8. 与 Core 层接口的关系

MetaAgent 通过构造函数依赖注入持有以下 Core 层服务引用，仅通过接口调用完成能力组装：

| Core 层服务 | 用途 | 调用场景 |
| --- | --- | --- |
| LLMService | LLM 模型注册与选择 | `buildAgent` 中通过 `registry.select` / `registry.listAll` 选择模型 |
| InformationService | 记忆与上下文构建 | `receiveWork` 中通过 `buildContext` 构建历史上下文 |
| ToolService | 工具服务 | 提供工具能力（预留，Agent 执行时由执行框架使用） |
| Agent 持久化层 | Agent 存储与检索 | `reuseAgent` / `submitWork` / `saveAgent` / `getAgent` 中调用存储与相似检索 |
| SkillManager | Skill 管理 | `buildAgent` 中通过 `listSkills` / `getSkill` 选择与查询 Skill |

---

### 2.9. 端到端编排流程（orchestrateWork）【MetaAgent 核心调度入口】

**功能**：上层编排框架（Orchestration 层）通过本接口发起一次完整的 Agent 工作流程。本接口串联 receiveWork → analyzeTask → reuseAgent / buildAgent → submitWork 的全链路，是 MetaAgent 对外暴露的核心编排入口。

**入参**：
- input：OrchestrateWorkInput（继承 Input），包含以下字段：
  - type：工作类型
  - content：工作内容
  - conversation_id：会话ID（可选）
  - strategy：策略（可选）
- context：OrchestrateWorkContext（继承 Context），会话上下文（session_id, work_id, interact_id, msg_id 等）
- output：OrchestrateWorkOutput（继承 Output），承载返回内容：
  - execution_id：执行ID
  - agent_id：Agent ID
  - task_features：任务特征

**处理流程**：

1. **接收工作**：
   a. 调用 `receiveWork` 将用户原始请求封装为标准化任务对象；
    b. 若 `input.conversation_id` 存在，通过 `InformationService.buildContext` 加载历史记忆上下文，注入任务对象；
2. **任务分析**：
    a. 调用 `analyzeTask` 对任务进行特征分析，产出 `{ intent, complexity, domain, required_capabilities }`；
   b. 将任务特征写入 `OrchestraContext` 供后续步骤使用；
3. **Agent 获取**（复用优先）：
   a. 调用 `reuseAgent` 尝试从持久化层检索相似 Agent；
   b. 若命中（相似度 >= 0.3）：将复用的 Agent 作为当前 WorkAgent，记录来源为 `reused`，跳过步骤 4 直接进入步骤 5；
   c. 若未命中：进入步骤 4；
4. **Agent 构建**：
   a. 调用 `buildAgent` 基于任务特征构建全新的 WorkAgent：
      - `selectLLM`：根据复杂度自动选择 LLM 模型（高复杂度任务（>=0.7）选择能力更强的模型）；
       - `selectSkills`：根据 required_capabilities 匹配 Skill；
      - `selectMCP`：根据领域和所需能力匹配 MCP 工具包；
      - `generatePrompt`：根据 intent 和 domain 生成定制化的 System Prompt 和 Soul 配置；
      - `selectStrategy`：根据 complexness 选择执行策略（plan-execute / cot / react）；
   b. 记录 Agent 来源为 `built`；
5. **Agent 持久化与提交**：
   a. 调用 `submitWork` 将 Agent 持久化至持久化层（若尚未持久化），生成 `execution_id`；
   b. 将 `execution_id`、`agent_id`、`task_features` 写入 output 返回，供上层编排框架传递至执行框架执行；
6. **异常降级**：
    a. 若 `analyzeTask` 失败：使用默认特征 `{ intent: "general", complexity: 0.5, domain: "general", required_capabilities: [] }` 继续；
   b. 若 `buildAgent` 中任一子步骤（selectLLM/selectSkills/selectMCP）失败：使用默认值（首个可用模型、空 Skill/MCP 列表）继续，不阻断整体流程；
   c. 若全部步骤均失败：返回错误信息，由上层编排框架决定重试或返回错误给用户；

**返回**：Boolean，表示编排流程是否完成；执行 ID 和任务特征通过 output 参数返回

---

### 2.10. 重要内容

所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；

---

## 3. 表设计

MetaAgent 自身不直接维护数据表，Agent 的持久化通过 Agent 持久化层完成（表设计参见 Agent-PRD.md）。MetaAgent 在构建 Agent 时生成的 agent_id 为 UUID，最终由持久化层写入 `agent_library` 表。
