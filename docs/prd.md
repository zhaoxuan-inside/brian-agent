# Brian-Agent 产品需求文档 (PRD)

> 版本: v3.0 | 日期: 2026-07-11 | 状态: 设计阶段

---

## 目录

1. [产品概述](#一产品概述)
2. [后端架构总览](#二后端架构总览)
3. [基础设施层](#三基础设施层)
4. [核心服务层](#四核心服务层)
5. [Agent 框架层](#五agent-框架层)
6. [信息管理（记忆）系统](#六信息管理记忆系统)
7. [应用层 API](#七应用层-api)
8. [数据模型汇总](#八数据模型汇总)
9. [技术栈](#九技术栈)

---

## 一、产品概述

### 1.1 产品定位

Brian-Agent 是一个**本地优先的 AI Agent 工作台**，支持多 Agent 协作、长期记忆、工具调用（MCP/Skill）、知识库管理，提供类 Apple 风格的桌面应用体验。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| 多 Agent 协作 | 基于有向状态图（DSG）的任务分解与并行调度 |
| 长期记忆 | 基于 CoALA 认知框架的四层记忆系统，支持语义检索和标签图谱 |
| 工具生态 | MCP 协议接入社区工具，自定义 Skill 创建与管理 |
| 自定义 Agent | LLM + Prompt + Skill + MCP + Soul 自由组装 |
| 知识库 | 本地文件索引与检索 |
| 模型管理 | 多 Provider 支持，配额监控，流式对话 |

---

## 二、后端架构总览

### 2.1 四层架构

```
┌──────────────────────────────────────────────────────────────────┐
│  应用层 (Application) - HTTP 路由，参数校验，请求/响应转换        │
├──────────────────────────────────────────────────────────────────┤
│  Agent 框架层 (Agent Framework) - Agent 定义、编排、调度、执行    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 调度策略层 (Strategy)                                      │  │
│  │ ReACT | Plan-Execute | CoT | Conditional Graph             │  │
│  │ Pregel BSP 并行计算 | DSG 有向状态图                        │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │ 底层能力层 (Capability)                                    │  │
│  │ LLM | Prompt | Skill | MCP | Soul | Sources               │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │ 基础设施层 (Infrastructure)                                │  │
│  │ 输入适配 | 状态管理 | 输出格式化                             │  │
│  └────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│  核心服务层 (Core Services) - 原子服务，可独立测试、可替换       │
│  LLMService | MemoryService | ToolService | StorageService       │
├──────────────────────────────────────────────────────────────────┤
│  基础设施层 (Infrastructure) - 底层支撑，不涉及业务逻辑           │
│  Config | Logger | Database | Server                             │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
backend/src/
├── infrastructure/           # 基础设施层
│   ├── config.ts             # 统一配置 (Zod)
│   ├── logger.ts             # 结构化日志 + 全链路 traceId
│   ├── database.ts           # SQLite 初始化 + schema migration
│   └── server.ts             # HTTP/WS 服务器
│
├── core/                     # 核心服务层
│   ├── llm/
│   │   ├── index.ts          # LLMService 统一入口
│   │   ├── providers.ts      # OpenAI/Anthropic/Google 适配器
│   │   ├── streaming.ts      # 流式调用
│   │   ├── embedding.ts      # Embedding 生成
│   │   └── modelConfig.ts    # 模型配置管理
│   ├── memory/
│   │   ├── index.ts          # MemoryService (CoALA)
│   │   ├── working.ts        # 工作记忆
│   │   ├── episodic.ts       # 情节记忆 (SQLite)
│   │   ├── semantic.ts       # 语义记忆 (Graph + Vector)
│   │   ├── procedural.ts     # 程序性记忆 (Skill/Work/Soul)
│   │   ├── retrieve.ts       # 向量检索 + 图遍历 + 时间局部性
│   │   ├── dedup.ts          # 语义去重
│   │   └── organizer.ts      # 记忆整理 + 标签演进
│   ├── tools/
│   │   ├── index.ts          # ToolService
│   │   ├── registry.ts       # 工具注册表
│   │   ├── mcpClient.ts      # MCP 协议客户端 (stdio/HTTP)
│   │   └── builtin.ts        # 内置工具
│   └── storage/
│       ├── index.ts          # StorageService
│       ├── sqlite.ts         # 关系数据
│       ├── vector.ts         # 向量存储
│       └── graph.ts          # 图存储
│
├── agent/                    # Agent 框架层
│   ├── runtime.ts            # AgentRuntime 主入口
│   ├── planner.ts            # TaskPlanner LLM 驱动任务分解
│   ├── executor.ts           # GraphExecutor DSG/Pregel DAG 执行
│   ├── context.ts            # MemoryContext 记忆上下文
│   ├── skillManager.ts       # Skill 生命周期管理
│   ├── agentBuilder.ts       # Agent 构建器 (LLM 辅助生成)
│   ├── prompt/
│   │   ├── builder.ts        # Prompt 构建器
│   │   ├── variableInjector.ts # 变量注入
│   │   ├── soul.ts           # Soul 模板
│   │   ├── work.ts           # Work 模板
│   │   └── skill.ts          # Skill 模板
│   └── types.ts              # Agent 类型定义
│
├── routes/                   # 应用层
│   ├── index.ts              # 路由注册
│   ├── chat.ts               # /api/chat
│   ├── config.ts             # /api/config
│   ├── memory.ts             # /api/memory
│   ├── library.ts            # /api/library
│   ├── mcp.ts                # /api/mcp
│   ├── skill.ts              # /api/skill
│   ├── agent.ts              # /api/agent
│   └── monitor.ts            # /api/stats
│
├── app.ts                    # Express 应用组装
└── main.ts                   # 入口
```

---

## 三、基础设施层

### 3.1 ConfigManager

统一配置管理，三级合并：默认值 → 文件 → 环境变量。

```typescript
interface AppConfig {
  port: number
  dataDir: string          // 数据存储根目录
  logDir: string           // 日志目录
  logLevel: 'debug' | 'info' | 'warn' | 'error'

  // 默认 LLM 配置
  defaultModel: string
  defaultProvider: string

  // 记忆配置
  memory: {
    workingCapacity: number     // 工作记忆容量，默认 7
    embeddingModel: string      // 内嵌 embedding 模型
    organizerIntervalMs: number // 整理间隔，默认 3600000 (1h)
    tagEvolutionIntervalMs: number // 标签演进间隔，默认 3600000
  }

  // Agent 配置
  agent: {
    maxIterations: number       // 最大循环次数，默认 5
    maxParallelAgents: number   // 最大并行 Agent 数，默认 4
    defaultStrategy: string     // 默认调度策略，默认 'react'
  }
}
```

### 3.2 Logger

结构化日志，按天轮转，全链路 traceId。

```
格式: [ISO时间戳] [traceId] [级别] [模块] 消息 | JSON数据
级别: DEBUG, INFO, WARN, ERROR, REQ, RES, AGENT

traceId 生成: 每个请求入口生成 UUID，贯穿所有后续调用
  用户请求 → Orchestrator → Agent → LLM → 响应
  全部携带同一个 traceId
```

### 3.3 Database

SQLite 初始化，schema migration，连接池管理。

```sql
-- 核心表
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'agent')),
  agent_id TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  tokens INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE memory_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('episodic', 'semantic', 'procedural')),
  raw_content TEXT NOT NULL,
  summary TEXT NOT NULL,
  semantic_fingerprint TEXT,
  role TEXT NOT NULL,
  agent_id TEXT,
  tags_json TEXT,
  access_history_json TEXT,
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL,
  temporal_decay REAL DEFAULT 1.0
);

CREATE TABLE memory_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL DEFAULT 0.5,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_id) REFERENCES memory_nodes(id),
  FOREIGN KEY (target_id) REFERENCES memory_nodes(id)
);

CREATE TABLE agent_chains (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  chain_data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE call_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## 四、核心服务层

### 4.1 LLMService

统一 LLM 调用接口，支持 chat、stream、toolCall、embedding。

```typescript
interface LLMService {
  // 对话
  chat(messages: Message[], options: ChatOptions): Promise<LLMResponse>
  chatStream(messages: Message[], options: ChatOptions): AsyncGenerator<StreamChunk>

  // 工具调用
  chatWithTools(messages: Message[], tools: Tool[], options: ChatOptions): Promise<LLMResponse>

  // Embedding
  embed(texts: string[]): Promise<number[][]>

  // 模型管理
  listModels(): ProviderModel[]
  verifyConnection(providerId: string): Promise<boolean>
  fetchQuota(providerId: string): Promise<QuotaInfo>
}

interface ChatOptions {
  model: string
  temperature?: number
  maxTokens?: number
  stopSequences?: string[]
  tools?: Tool[]
  toolChoice?: 'auto' | 'none' | 'required'
}

interface LLMResponse {
  content: string
  toolCalls?: ToolCall[]
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latencyMs: number
}
```

**多 Provider 支持**：

| Provider | 类型 | chat | stream | toolCall | embed |
|----------|------|------|--------|----------|-------|
| OpenAI | openai-compatible | ✓ | ✓ | ✓ | ✓ |
| Anthropic | anthropic | ✓ | ✓ | ✓ | ✗ |
| Google | google | ✓ | ✓ | ✓ | ✓ |
| DeepSeek | openai-compatible | ✓ | ✓ | ✗ | ✗ |
| 智谱 GLM | openai-compatible | ✓ | ✓ | ✓ | ✓ |
| 自定义 | openai-compatible | ✓ | ✓ | ✗ | ✗ |

**Embedding 方案**：

| 方案 | 模型 | 资源 | 维度 |
|------|------|------|------|
| 内嵌 (默认) | `@xenova/transformers` all-MiniLM-L6-v2 | ~80MB 内存，CPU | 384 |
| 内嵌 (中文优化) | `@xenova/transformers` bge-small-zh | ~100MB 内存，CPU | 512 |
| 远程 | 调用已配置 Provider 的 embedding API | 无本地开销 | 取决于模型 |

### 4.2 MemoryService

基于 CoALA 认知框架的信息管理系统。

详见 [第六章 信息管理系统](#六信息管理记忆系统)。

### 4.3 ToolService

工具注册、发现、执行。

```typescript
interface ToolService {
  register(tool: Tool): void
  unregister(toolId: string): void
  list(): Tool[]
  execute(toolName: string, params: Record<string, any>): Promise<string>

  // MCP
  installMcp(packageName: string): Promise<McpPackage>
  uninstallMcp(packageId: string): void
  listMcpTools(): McpTool[]
  getMcpCommunity(): Promise<McpPackage[]>
}
```

**MCP 协议客户端**：

```
MCP 协议通信方式:
  - stdio: 启动 MCP 服务器进程，通过 stdin/stdout 通信
  - HTTP: 通过 HTTP 请求与 MCP 服务器通信

安装流程:
  1. npm install <package> (或 npx)
  2. 启动 MCP 服务器子进程
  3. 握手机制 (initialize → initialized)
  4. 获取工具列表 (tools/list)
  5. 注册到 ToolRegistry
  6. 运行时通过 tools/call 调用
```

### 4.4 StorageService

```typescript
interface StorageService {
  // 关系型
  sqlite: SQLiteDatabase

  // 向量
  vectorStore: {
    insert(id: string, embedding: number[], metadata: Record<string, any>): void
    search(embedding: number[], topK: number): SearchResult[]
    delete(id: string): void
  }

  // 图
  graphStore: {
    addNode(node: GraphNode): void
    addEdge(edge: GraphEdge): void
    getNeighbors(nodeId: string, depth: number): GraphNode[]
    getEdges(nodeId: string): GraphEdge[]
    removeNode(nodeId: string): void
    removeEdge(edgeId: string): void
  }
}
```

---

## 五、Agent 框架层

### 5.1 Agent 定义模型

每个 Agent = LLM + Prompt + Skill + MCP + Soul。

```typescript
interface Agent {
  id: string
  name: string
  role: 'coordinator' | 'searcher' | 'caller' | 'skiller' | 'generator' | 'custom'
  description: string

  // ── 调度策略层 ──
  strategy: {
    type: 'react' | 'plan-execute' | 'cot' | 'direct'
    maxIterations: number
    stopConditions: string[]
    toolSelectionMode: 'auto' | 'manual' | 'hybrid'
  }

  // ── 底层能力层 ──
  capabilities: {
    llm: {
      modelId: string
      temperature?: number
      maxTokens?: number
    }
    prompt: {
      system: string                // 系统提示词，支持 {{variable}}
      instruction: string           // 任务指令
      variables: Record<string, VariableDef>
      templates: PromptTemplate[]
    }
    skills: SkillRef[]
    mcpEndpoints: McpRef[]
    soul: {
      style: string
      personality: string
      contentRules: string[]
      constraints: string[]
      temperatureProfile: {
        creative: number
        analytical: number
        factual: number
      }
    }
    sources: {
      knowledgeBase: string[]
      webSearch: boolean
      searchEngine?: string
    }
  }

  // ── 基础设施层 ──
  infra: {
    inputParser: string
    contextBuilder: string
    outputFormatter: string
  }

  active: boolean
  createdAt: string
  updatedAt: string
}
```

### 5.2 调度策略

#### 5.2.1 有向状态图 (DSG)

借鉴 LangGraph 的 `StateGraph`，节点代表状态，边代表状态转移，支持条件边和循环。

```
         ┌──────────────┐
         │  Coordinator │  ← 入口节点
         └──────┬───────┘
                │
         ┌──────▼──────┐
         │  TaskPlanner │  ← 分解任务，输出子任务列表
         └──────┬───────┘
                │
         ┌──────▼──────────────────────┐
         │     ParallelFanOut           │  ← Pregel 风格 fan-out
         │  ┌────┐  ┌────┐  ┌────┐    │
         │  │ A1 │  │ A2 │  │ A3 │    │     并行执行
         │  └──┬─┘  └──┬─┘  └──┬─┘    │
         │     │       │       │        │
         │  ┌──▼───────▼───────▼──┐    │
         │  │     Reduce/Join     │    │     汇总结果
         │  └─────────┬───────────┘    │
         └────────────┼────────────────┘
                      │
               ┌──────▼──────┐
               │  Generator   │  ← 汇总并生成最终回复
               └──────┬───────┘
                      │
               ┌──────▼──────┐
               │  Reflector   │  ← 自省：结果质量评估
               └──────┬───────┘
                      │
               ┌──────▼──────┐
               │  [条件边]    │  ← OK → 输出 / Retry → TaskPlanner
               └──────────────┘
```

#### 5.2.2 三种调度策略融合

| 策略 | 来源 | 适用场景 | 实现方式 |
|------|------|---------|---------|
| **ReACT** | LangChain | 单个 Agent 内部循环：思考→行动→观察→思考 | Agent 执行时内部循环，每轮调用 LLM + tool_choice |
| **Pregel BSP** | Google Pregel | 大规模并行任务，无依赖的子任务可并行 | `ParallelFanOut` 节点：多个 Agent 同时启动，全部完成后 Reduce |
| **Conditional Graph** | LangGraph | 根据中间结果动态决定下一步 | `Reflector` 节点 + 条件边：质量不够 → 重试，OK → 输出 |

#### 5.2.3 执行器核心模型

```typescript
interface GraphNode {
  id: string
  agent: Agent
  inputMapper: (state: GraphState) => any
  outputReducer: (state: GraphState, output: any) => GraphState
}

interface GraphEdge {
  from: string
  to: string
  type: 'sequential' | 'conditional' | 'parallel'
  condition?: (state: GraphState) => boolean
}

interface GraphState {
  userMessage: string
  taskPlan: SubTask[]
  subTaskResults: Map<string, any>
  memoryContext: MemoryItem[]
  iterationCount: number
  qualityScore: number
  finalOutput: string
  errors: Error[]
  trace: TraceEntry[]
}
```

**关键特性**：
- **循环支持**：Reflector → ConditionalEdge → TaskPlanner 形成闭环，最多 N 次迭代
- **并行 Fan-out**：无依赖子任务同时执行，Reduce 汇总
- **状态共享**：GraphState 全局可读写，每个节点可读取上游结果
- **条件路由**：边带 condition 函数，运行时动态决定路径

### 5.3 执行流程

```
用户消息
  │
  ▼
AgentRuntime.run(userMessage, conversationId)
  │
  ├─ 1. MemoryContext.activate()
  │     ├─ 向量检索相关记忆 (embedding + cosine)
  │     ├─ 图遍历关联记忆 (标签关联 ≤ 5 跳)
  │     ├─ 时间局部性 (最近 20 条消息)
  │     ├─ 用户 pinned 记忆
  │     └─ 返回 MemoryContext
  │
  ├─ 2. TaskPlanner.plan(userMessage, memoryContext, agents)
  │     ├─ LLM 分析意图 (不是正则)
  │     ├─ 生成 DAG 任务图
  │     └─ 返回 TaskGraph { nodes, edges }
  │
  ├─ 3. GraphExecutor.execute(taskGraph, callbacks)
  │     ├─ 按拓扑顺序调度
  │     ├─ 并行执行无依赖节点
  │     ├─ 每个 Agent 执行时:
  │     │   ├─ 构建 Prompt (Soul + Work + Tools)
  │     │   ├─ 调用 LLM (带 tool_choice)
  │     │   ├─ LLM 可能调用 tools → ToolService.execute()
  │     │   └─ 流式输出结果 via callbacks
  │     └─ Generator 汇总 → 最终回复
  │
  ├─ 4. MemoryService.save()
  │     ├─ 统一格式化
  │     ├─ 语义去重
  │     ├─ 多维度标签生成
  │     └─ 保存到情节记忆 + 语义记忆
  │
  └─ 5. 持久化 AgentChain 到 SQLite
```

### 5.4 SkillManager

```typescript
interface SkillManager {
  list(search?: string, status?: 'active' | 'inactive'): AgentSkill[]
  get(id: string): AgentSkill
  create(skill: CreateSkillInput): Promise<AgentSkill>
  toggle(id: string): AgentSkill
  delete(id: string): void
  preview(input: CreateSkillInput): Promise<AgentSkill>  // 预览规范化结果
  review(id: string): Promise<SkillReview>                // LLM 评价
}
```

**创建模式**：

| 模式 | 流程 | 说明 |
|------|------|------|
| `user` | 用户指定输入/输出/过程 → LLM 规范化 | 生成 JSON Schema + 约束 + 示例 |
| `manual` | 用户完全手写 → LLM 评价 | 返回评分 + 优化建议 |

### 5.5 AgentBuilder

```typescript
interface AgentBuilder {
  list(): CustomAgent[]
  get(id: string): CustomAgent
  create(agent: CreateAgentInput): Promise<CustomAgent>
  update(id: string, agent: UpdateAgentInput): Promise<CustomAgent>
  delete(id: string): void
  toggle(id: string): CustomAgent

  // LLM 辅助生成
  generatePrompt(purpose: string, constraints: string): Promise<AgentPrompt>
  generateSoul(purpose: string, preference: string): Promise<AgentSoul>
  suggestSkills(purpose: string, description: string): Promise<{ skills: string[], mcps: string[] }>
}
```

---

## 六、信息管理（记忆）系统

### 6.1 CoALA 四类记忆

| 记忆类型 | CoALA 定义 | 我们的实现 | 存储 | 生命周期 |
|---------|-----------|-----------|------|---------|
| 工作记忆 | 当前任务相关临时信息 | 当前对话上下文、Agent 中间结果 | 内存 LRU | 单次对话 |
| 情节记忆 | 具体经历和事件 | 历史对话记录、Agent 执行轨迹 | SQLite | 持久 |
| 语义记忆 | 抽象知识和概念 | 标签体系、概念关系、知识图谱 | Graph DB + Vector | 持久 |
| 程序性记忆 | 如何做事的技能 | Skill 定义、Soul 模板、Work 方案 | 文件 | 持久 |

### 6.2 统一记忆格式

```typescript
interface UnifiedMemoryItem {
  id: string
  type: 'episodic' | 'semantic' | 'procedural'

  // 原始内容
  rawContent: string
  // 规范化摘要（语言学压缩，≤200字）
  summary: string
  // 语义指纹（embedding 向量 or 内容哈希，用于去重）
  semanticFingerprint: string

  // 角色属性
  role: 'user' | 'assistant' | 'system' | 'agent'
  agentId?: string

  // 多维度标签
  tags: {
    domain: string[]       // 领域：计算机科学、数学、经济学...
    industry: string[]     // 行业：互联网、金融、医疗...
    concept: string[]      // 概念：微服务、分布式、Kubernetes...
    action: string[]       // 动作：搜索、分析、生成...
    sentiment: string      // 情感倾向
  }

  // 调用历史（用于活跃度计算）
  accessHistory: {
    timestamp: number
    context: string
    score: number
  }[]

  // 时间
  createdAt: number
  lastAccessedAt: number
  temporalDecay: number

  // 关联
  relatedMemories: {
    memoryId: string
    relation: string       // follows, references, contradicts, extends
    weight: number
  }[]
}
```

### 6.3 语义去重

存储新记忆时：

1. 生成 `semanticFingerprint`（embedding 向量）
2. 在已有记忆中搜索相似度 > 0.85 的记忆
3. 如果找到相似记忆：
   - **合并**：更新 accessHistory，增加 lastAccessedAt
   - **强化**：增加关联权重
4. 如果未找到：创建新记忆

### 6.4 活跃度计算

```typescript
function memoryScore(memory: UnifiedMemoryItem, now: number, queryEmbedding: number[]): number {
  // 1. 调用频率 (40%)
  const accessCount = memory.accessHistory.length
  const frequencyScore = Math.min(accessCount / 10, 1)

  // 2. 时间衰减 (30%) — 最近访问权重更高，7天半衰期
  const timeSinceLastAccess = now - memory.lastAccessedAt
  const temporalScore = Math.exp(-timeSinceLastAccess / (7 * 24 * 3600 * 1000))

  // 3. 语义相似度 (20%) — 与当前查询的向量相似度
  const semanticScore = cosineSimilarity(queryEmbedding, memory.semanticFingerprint)

  // 4. 关联深度 (10%) — 关联链越短越可靠，超过5跳为0
  const relationDepth = minRelationDepth(memory, currentContext)
  const relationScore = Math.max(0, 1 - relationDepth / 5)

  return 0.4 * frequencyScore + 0.3 * temporalScore + 0.2 * semanticScore + 0.1 * relationScore
}
```

### 6.5 标签体系 & 有向图

```
消息: "Kubernetes 中如何优化 Go 微服务的 goroutine 调度"

标签:
  领域: [计算机科学, 分布式系统]
  行业: [互联网, 云计算]
  概念: [Kubernetes, Go, 微服务, goroutine, 调度优化]
  动作: [问题, 优化]
  情感: 中性
```

**标签有向图规则**：

```
Kubernetes ──0.8──→ 微服务
     │               │
     │ 0.6           │ 0.7
     ▼               ▼
goroutine ──0.9──→ Go

- ≤3 跳：高可靠，直接作为上下文注入
- 4-5 跳：中可靠，选择性注入
- >5 跳：低可靠，不注入
- 节点激活次数越高 → 权重越高
- 最近激活的节点 → 权重更高
```

**标签体系演进**（后台定时任务）：

1. 扫描所有消息，提取新概念
2. 对未分类概念调用 LLM 进行维度归类
3. 更新标签图，重新计算边权重
4. 合并相似标签（如 "K8s" 和 "Kubernetes"）

### 6.6 时间局部性

```
最近 N 条消息（默认 20 条）始终在上下文中
  → 不需要检索，直接注入
  → 权重随时间衰减：新鲜度 = exp(-index / 10)
```

### 6.7 用户手动控制

```
用户可以在前端记忆面板中：
  - 勾选/取消勾选某条记忆 → pinned/unpinned
  - pinned 记忆始终在上下文中（不受分数和容量限制）
  - 手动设置优先级
```

---

## 七、应用层 API

### 7.1 API 总览

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/chat` | POST | 非流式聊天 |
| `/api/chat/stream` | POST | SSE 流式聊天 |
| `/api/chat/chain/:messageId` | GET | 获取 Agent 调度链 |
| `/api/config` | GET/PUT | 全局配置 |
| `/api/config/provider/:id` | PUT | 更新 Provider 配置 |
| `/api/config/verify/:providerId` | POST | 测试连接 |
| `/api/config/quota/:providerId` | GET | 查询配额 |
| `/api/memory` | GET | 获取记忆列表 |
| `/api/memory/tags` | GET | 获取标签列表 |
| `/api/memory/tag-graph` | GET | 标签图数据 |
| `/api/memory/by-tag/:tag` | GET | 按标签查询 |
| `/api/memory/groups` | GET | 标签组 |
| `/api/skill` | GET | Skill 列表 |
| `/api/skill/:id` | GET | Skill 详情 |
| `/api/skill/create` | POST | 创建 Skill |
| `/api/skill/:id/toggle` | POST | 激活/去激活 |
| `/api/skill/:id` | DELETE | 删除 |
| `/api/skill/:id/preview` | POST | 预览规范化结果 |
| `/api/skill/:id/review` | POST | LLM 评价 |
| `/api/mcp/market` | GET | MCP 市场列表 |
| `/api/mcp/market/:id` | GET | MCP 详情（工具列表） |
| `/api/mcp/market/:id` | POST | 安装 MCP |
| `/api/mcp/market/:id` | DELETE | 卸载 MCP |
| `/api/mcp/market/sync` | POST | 同步社区列表 |
| `/api/mcp/installed` | GET | 已安装列表 |
| `/api/agent` | GET | 自定义 Agent 列表 |
| `/api/agent/:id` | GET | Agent 详情 |
| `/api/agent/create` | POST | 创建 Agent |
| `/api/agent/:id` | PUT | 更新 Agent |
| `/api/agent/:id` | DELETE | 删除 |
| `/api/agent/:id/toggle` | POST | 激活/去激活 |
| `/api/agent/generate-prompt` | POST | LLM 生成 Prompt |
| `/api/agent/generate-soul` | POST | LLM 生成 Soul |
| `/api/agent/suggest-skills` | POST | LLM 推荐 Skill/MCP |
| `/api/library/paths` | GET/POST | 知识库路径 |
| `/api/library/paths/:id` | DELETE | 删除路径 |
| `/api/library/check-path` | POST | 检查路径 |
| `/api/stats` | GET | 综合统计 |
| `/health` | GET | 健康检查 |

### 7.2 WebSocket 协议

```typescript
// 消息类型
type WsMessageType =
  | 'agent_created'       // Agent 创建
  | 'agent_status_change' // 状态变化
  | 'agent_output'        // 输出流
  | 'agent_complete'      // 完成
  | 'agent_error'         // 错误
  | 'chain_update'        // 调度链更新
  | 'memory_activated'    // 记忆激活
  | 'strategy_selected'   // 策略选择

// 消息格式
interface WsMessage {
  type: WsMessageType
  payload: Record<string, any>
  timestamp: number
  traceId: string
}
```

---

## 八、数据模型汇总

### 8.1 Skill 数据模型

```typescript
interface AgentSkill {
  id: string
  name: string
  description: string
  mode: 'user' | 'llm' | 'manual'

  // 用户指定模式
  userInput: string
  userOutput: string
  userProcess: string

  // LLM 规范化后
  normalizedSpec: {
    input: JSONSchema
    output: JSONSchema
    process: string
    constraints: string[]
    examples: { input: string; output: string }[]
  }

  // 手动模式
  manualContent: string

  // LLM 评价
  review?: {
    score: number
    summary: string
    suggestions: string[]
    reviewedAt: string
  }

  active: boolean
  createdAt: string
  updatedAt: string
}
```

### 8.2 MCP 数据模型

```typescript
interface McpPackage {
  id: string
  name: string
  displayName: string
  description: string
  author: string
  version: string
  repository: string
  packageName: string
  category: string
  tags: string[]
  tools: McpTool[]
  installed: boolean
  installedVersion?: string
  active: boolean
  config?: Record<string, any>
}

interface McpTool {
  name: string
  description: string
  inputSchema: JSONSchema
}
```

### 8.3 Tool 数据模型

```typescript
interface Tool {
  name: string
  description: string
  parameters: JSONSchema
  handler: (params: any) => Promise<string>
  source: 'builtin' | 'mcp' | 'skill'
  sourceId?: string
}
```

---

## 九、技术栈

| 分类 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js + TypeScript 5+ | ES2022, ESNext modules |
| HTTP 框架 | Express 4.19 | |
| WebSocket | Socket.IO 4.7 | |
| 数据库 | better-sqlite3 11.0 | 同步 API |
| 验证 | Zod 3.23 | 配置/环境变量/请求验证 |
| Embedding | @xenova/transformers | 内嵌，CPU 推理 |
| 前端 | Vue 3.4 + Vite 6 + Tailwind CSS 3 | |
| 日志 | 自定义结构化日志 | 按天轮转，traceId 串联 |

---

> *PRD 版本: v3.0*  
> *最后更新: 2026-07-11*  
> *状态: 设计阶段，待确认后进入编码*