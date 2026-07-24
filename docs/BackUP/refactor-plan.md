# Brian-Agent 后端标准化重构技术文档

> 版本: v1.0 | 日期: 2026-07-15 | 状态: 设计阶段
> 基于 BrianAgent.canvas 结构图进行重构规划

***

## 目录

1. [需求确认](#一需求确认)
2. [模块划分确认](#二模块划分确认)
3. [层次划分确认](#三层次划分确认)
4. [功能划分确认](#四功能划分确认)
   - 4.2.2 [Info 模块详细设计](#422-info-模块详细设计)
   - 4.2.3 [Learning 与 Info 集成](#423-learning-与-info-集成)
5. [接口变更确认](#五接口变更确认)
6. [前端页面规划](#六前端页面规划)
7. [重构实施步骤](#七重构实施步骤)
8. [风险评估](#八风险评估)
9. [向后兼容性与迁移策略](#九向后兼容性与迁移策略)
10. [总结](#十总结)

***

## 一、需求确认

### 1.1 架构目标

基于 `BrianAgent.canvas` 结构图，重构目标是建立一个**标准化、模块化、可替换**的六层架构体系：

| 层级                  | 目标             | 当前状态                           |
| ------------------- | -------------- | ------------------------------ |
| **Access 接入层**      | 统一入口，支持多种接入方式  | 仅有 Web Chat，缺少 IM Gateway、统一配置 |
| **Application 应用层** | 业务编排，任务来源      | 部分实现（Chat、Learning），缺少用户肖像     |
| **Solution 解决方案层**  | 任务分解与编排        | 部分实现（AgentPlan），需增强            |
| **Strategy 策略层**    | 构建完整 Agent     | 部分实现，需标准化                      |
| **Core 基础层**        | 管理构建 Agent 的能力 | 部分实现，需整合                       |
| **Base 基础构件层**      | 统一封装底层能力       | 分散实现，需统一抽象                     |

### 1.2 核心需求

1. **统一封装**：对 LLM、MCP、Skill、数据库进行标准化封装，方便替换实现
2. **消息队列**：引入消息队列机制（当前使用 SQLite 实现）
3. **Agent 标准化**：Agent 由策略、MCP、LLM、Skill、Soul、Work 等部分构成
4. **自学习体系**：完整的自学习策略，采集、规划、管理学习内容
5. **用户肖像**：分析用户喜好，优化输入理解和输出指导
6. **可视化**：Multi-Agent 系统流程可视化
7. **监控统计**：系统资源、模型用量等指标监控
8. **反馈系统**：收集用户体验数据，驱动策略调整
9. **模块解耦**：模块间通过接口契约通信，支持独立升级更新
10. **代码与策略分离**：策略配置化，支持热更新，与核心代码解耦
11. **升级模块**：支持版本管理、增量升级、指定模块升级、回滚机制

***

## 二、模块划分确认

### 2.1 目标模块结构

```
backend/src/
├── access/                    # 接入层
│   ├── chat.ts                # Web Chat 入口
│   ├── gateway.ts             # IM Gateway（微信、飞书等）
│   ├── config.ts              # 配置管理入口
│   ├── statistic.ts           # 统计监控入口
│   ├── visual.ts              # 可视化入口
│   └── feedback.ts            # 反馈系统入口
│
├── application/               # 应用层
│   ├── selfLearning.ts        # 自学习策略管理
│   ├── chat.ts                # Chat 业务逻辑
│   └── userProfile.ts         # 用户肖像分析
│
├── solution/                  # 解决方案层
│   └── agentPlan.ts           # Agent 任务编排器
│
├── strategy/                  # 策略层
│   ├── agent.ts               # Agent 核心类
│   ├── agentOrchestrator.ts   # Agent 编排策略
│   ├── thinkingStrategy.ts    # 思考策略（ReACT）
│   └── strategyManager.ts     # 策略管理
│
├── core/                      # 基础层
│   ├── llm/                   # LLM 能力
│   ├── mcp/                   # MCP 能力
│   ├── skill/                 # Skill 能力
│   ├── soul/                  # Soul 能力
│   └── work/                  # Work 能力
│
├── info/                      # 跨层共享 - 统一信息中心
│   ├── infoService.ts         # InfoService 接口与实现
│   ├── workingMemory.ts       # 工作记忆存储
│   ├── episodicMemory.ts      # 情节记忆存储（BM25 召回）
│   ├── semanticMemory.ts      # 语义记忆存储（向量召回）
│   ├── proceduralMemory.ts    # 程序性记忆存储（向量匹配 → Skill/Work/Soul）
│   ├── tagNeuralMemory.ts     # Tag 神经网络记忆存储
│   ├── randomMemory.ts        # 随机记忆存储
│   ├── memoryNode.ts          # 记忆节点数据模型
│   ├── searchEngine.ts        # 统一检索引擎
│   ├── contextBuilder.ts      # 上下文构建器（按比例分配）
│   ├── memoryRatioManager.ts  # 记忆比例管理器（动态调整）
│   ├── evaluationAgent.ts     # 评估 Agent（比例动态调整）
│   └── knowledgeManager.ts    # 知识管理器（Learning 集成）
│
├── base/                      # 基础构件层
│   ├── llmWrapper.ts          # LLM 封装器
│   ├── mcpWrapper.ts          # MCP 封装器
│   ├── skillWrapper.ts        # Skill 封装器
│   ├── relationalDb.ts        # 关系数据库封装器
│   ├── graphDb.ts             # 图数据库封装器
│   ├── vectorDb.ts            # 向量数据库封装器
│   └── messageQueue.ts        # 消息队列封装器
│
├── upgrade/                   # 升级模块
│   ├── versionManager.ts      # 版本管理
│   ├── packageManager.ts      # 包管理
│   ├── upgradeExecutor.ts     # 升级执行器
│   ├── rollbackManager.ts     # 回滚管理
│   └── upgradeService.ts      # 升级服务
│
├── infrastructure/            # 基础设施（不变）
│   ├── config.ts
│   ├── logger.ts
│   ├── database.ts
│   └── server.ts
│
├── middleware/                # 中间件（不变）
├── shared/                    # 共享类型（不变）
└── app.ts                     # 应用组装
```

### 2.2 模块职责说明

| 模块                             | 职责                 | 关键类/接口                |
| ------------------------------ | ------------------ | --------------------- |
| **access/chat**                | Web Chat 请求入口，协议转换 | `ChatController`      |
| **access/gateway**             | IM 平台接入，消息转发       | `IMGateway`           |
| **access/config**              | 配置管理 API           | `ConfigController`    |
| **access/statistic**           | 统计数据查询 API         | `StatisticController` |
| **access/visual**              | 可视化数据 API          | `VisualController`    |
| **access/feedback**            | 反馈收集 API           | `FeedbackController`  |
| **application/selfLearning**   | 自学习策略编排            | `SelfLearningService` |
| **application/chat**           | Chat 业务流程编排        | `ChatService`         |
| **application/userProfile**    | 用户画像分析             | `UserProfileService`  |
| **solution/agentPlan**         | 任务分解与递归编排          | `AgentPlan`           |
| **strategy/agent**             | Agent 核心执行单元       | `Agent`               |
| **strategy/agentOrchestrator** | Agent 编排策略         | `AgentOrchestrator`   |
| **strategy/thinkingStrategy**  | 思考策略实现             | `ReACTStrategy`       |
| **strategy/strategyManager**   | 策略管理与进化            | `StrategyManager`     |
| **core/llm**                   | LLM 能力封装           | `LLMService`          |
| **core/mcp**                   | MCP 能力封装           | `MCPManager`          |
| **core/skill**                 | Skill 能力封装         | `SkillManager`        |
| **core/soul**                  | Soul 能力封装          | `SoulManager`         |
| **core/work**                  | Work 能力封装          | `WorkManager`         |
| **info**                       | 统一信息中心           | `InfoService`         |
| **base/llmWrapper**            | LLM 厂商适配           | `LLMWrapper`          |
| **base/mcpWrapper**            | MCP 协议适配           | `MCPWrapper`          |
| **base/skillWrapper**          | Skill 运行时适配        | `SkillWrapper`        |
| **base/relationalDb**          | SQLite 封装          | `RelationalDB`        |
| **base/graphDb**               | TinyGraphDB 封装     | `GraphDB`             |
| **base/vectorDb**              | 向量存储封装             | `VectorDB`            |
| **base/messageQueue**          | 消息队列封装             | `MessageQueue`        |
| **upgrade/versionManager**     | 版本管理与比对           | `VersionManager`      |
| **upgrade/packageManager**     | 包下载与验证             | `PackageManager`      |
| **upgrade/upgradeExecutor**    | 升级执行与监控           | `UpgradeExecutor`     |
| **upgrade/rollbackManager**    | 回滚与恢复               | `RollbackManager`     |
| **upgrade/upgradeService**     | 升级服务 API            | `UpgradeService`      |

***

## 三、层次划分确认

### 3.1 六层架构关系图

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Access 接入层                                │
│  [Chat] [Gateway] [Config] [Statistic] [Visual] [Feedback]          │
│                          ↓                                          │
├──────────────────────────────────────────────────────────────────────┤
│                      Application 应用层                             │
│            [SelfLearning] [Chat] [UserProfile]                      │
│                          ↓                                          │
├──────────────────────────────────────────────────────────────────────┤
│                     Solution 解决方案层                             │
│                          [AgentPlan]                                │
│                          ↓                                          │
├──────────────────────────────────────────────────────────────────────┤
│                        Strategy 策略层                               │
│         [Agent] [AgentOrchestrator] [ThinkingStrategy]              │
│                          ↓                                          │
├──────────────────────────────────────────────────────────────────────┤
│                          Core 基础层                                │
│         [LLM] [MCP] [Skill] [Soul] [Work] [Info]                    │
│                          ↓                                          │
├──────────────────────────────────────────────────────────────────────┤
│                       Base 基础构件层                                │
│  [LLMWrapper] [MCPWrapper] [SkillWrapper] [DB Wrappers] [MQ]       │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 层间依赖规则

| 层次              | 可依赖                                  | 不可依赖                        |
| --------------- | ------------------------------------ | --------------------------- |
| **Access**      | Application、Infrastructure、**Info**     | Strategy、Core（Info 除外）         |
| **Application** | Solution、Core、**Info**                   | Access、Strategy             |
| **Solution**    | Strategy、Core、**Info**                   | Application、Access          |
| **Strategy**    | Core、**Info**                              | Application、Solution、Access |
| **Core**        | Base、Infrastructure、**Info**             | Strategy 以上层                |
| **Base**        | Infrastructure、**Info**                    | 其他层                         |

**特殊说明 - Info 跨层访问**：

> Info 是整个系统的**统一信息中心**，管理所有用户信息（记忆+知识）。由于信息是所有层次都需要的基础服务，Info 被提升为**跨层共享服务**，允许所有层次直接访问。

**跨层服务架构**：

```
┌──────────────────────────────────────────────────────────────────────┐
│                        跨层共享服务                                  │
│                                                                      │
│   ┌──────────────────────┐    ┌──────────────────────┐              │
│   │   Infrastructure     │    │       Info            │              │
│   │  (配置、日志、数据库)  │    │   (统一信息中心)      │              │
│   └──────────────────────┘    └──────────────────────┘              │
│           │                            │                            │
│           ▼                            ▼                            │
├──────────┴────────────────────────────┴──────────────────────────────┤
│                                                                      │
│   ┌────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│   │ Access │ │ Application  │ │  Solution   │ │  Strategy   │     │
│   └────────┘ └──────────────┘ └──────────────┘ └──────────────┘     │
│           │           │             │             │                  │
│           ▼           ▼             ▼             ▼                  │
│   ┌──────────────────────────────────────────────────────┐          │
│   │                    Core                              │          │
│   │  (LLM、MCP、Skill、Soul、Work)                      │          │
│   └──────────────────────────────────────────────────────┘          │
│                          │                                          │
│                          ▼                                          │
│   ┌──────────────────────────────────────────────────────┐          │
│   │                    Base                              │          │
│   │  (LLMWrapper、MCPWrapper、DB Wrappers、MQ)          │          │
│   └──────────────────────────────────────────────────────┘          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Info 在架构中的位置**：

| 特性 | 说明 |
|------|------|
| **定位** | 跨层共享服务，独立于六层架构之外 |
| **职责** | 管理所有用户信息（记忆+知识） |
| **访问权限** | 所有层次均可直接访问 |
| **依赖关系** | 依赖 Base（数据库封装）和 Infrastructure（配置、日志） |
| **被依赖** | 被所有层次依赖 |

### 3.3 当前代码映射

| 当前位置                 | 目标位置                               | 说明        |
| -------------------- | ---------------------------------- | --------- |
| `routes/chat.ts`     | `access/chat.ts`                   | 路由层迁移     |
| `routes/config.ts`   | `access/config.ts`                 | 路由层迁移     |
| `routes/stats.ts`    | `access/statistic.ts`              | 路由层迁移     |
| `routes/feedback.ts` | `access/feedback.ts`               | 路由层迁移     |
| `routes/learning.ts` | `application/selfLearning.ts`      | 学习业务      |
| `routes/memory.ts`   | `info/infoService.ts`              | Memory 能力 → 信息中心 |
| `routes/mcp.ts`      | `core/mcp/`                        | MCP 能力    |
| `routes/skill.ts`    | `core/skill/`                      | Skill 能力  |
| `routes/agent.ts`    | `strategy/agent.ts`                | Agent 策略  |
| `agent/`             | `strategy/`                        | 策略层迁移     |
| `core/llm/`          | `core/llm/` + `base/llmWrapper.ts` | 拆分        |
| `core/tools/`        | `core/mcp/` + `base/mcpWrapper.ts` | 拆分        |
| `core/storage/`      | `base/`                            | 基础构件层     |
| `core/information/`  | `info/`                            | 迁移到跨层共享模块 |
| `core/learning/`     | `application/selfLearning.ts`      | 迁移，集成到 Info |
| `cognitive/`         | `strategy/thinkingStrategy.ts`     | 整合        |

***

## 四、功能划分确认

### 4.1 Base 层功能

#### 4.1.1 LLM 封装器

**职责**：封装不同 LLM 厂商的各类模型

```typescript
interface LLMWrapper {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<LLMResponse>;
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string>;
  embed(texts: string[]): Promise<number[][]>;
  vision(image: string, prompt: string): Promise<LLMResponse>;
  registerProvider(provider: ProviderConfig): void;
  listProviders(): ProviderConfig[];
}
```

**当前实现**：`core/llm/adapters/` 已实现 OpenAI、Anthropic、Google 适配器，需统一到 `base/llmWrapper.ts`

#### 4.1.2 MCP 封装器

**职责**：管理 MCP 市场，安装、配置、管理本地 MCP

```typescript
interface MCPWrapper {
  listMarketplace(): McpPackage[];
  install(packageName: string): Promise<void>;
  uninstall(packageName: string): Promise<void>;
  listInstalled(): InstalledMcp[];
  getTools(mcpId: string): Tool[];
  callTool(mcpId: string, toolName: string, args: Record<string, any>): Promise<any>;
}
```

**当前实现**：`core/tools/index.ts` 包含 MCP 市场定义，需迁移并增强

#### 4.1.3 Skill 封装器

**职责**：Skill 管理，只负责创建、删除、更新、查看，不负责生成。生成由上层模块完成，生成后通过 Skill 封装器进行创建/更新。

```typescript
interface SkillWrapper {
  create(skill: SkillDefinition): Promise<string>;
  get(id: string): Skill | undefined;
  list(filter?: SkillFilter): Skill[];
  update(id: string, updates: Partial<SkillDefinition>): void;
  delete(id: string): void;
  execute(id: string, context: Record<string, any>): Promise<any>;
}
```

**当前实现**：`agent/skillManager.ts`，需迁移到 `base/skillWrapper.ts`

#### 4.1.4 关系数据库封装器

**职责**：封装 SQLite，方便替换为其他关系数据库

```typescript
interface RelationalDB {
  query(sql: string, params?: any[]): any[];
  execute(sql: string, params?: any[]): void;
  transaction(fn: (db: RelationalDB) => void): void;
}
```

**当前实现**：`core/storage/sqlite.ts`，需标准化接口

#### 4.1.5 图数据库封装器

**职责**：封装 TinyGraphDB，方便替换

```typescript
interface GraphDB {
  createNode(node: GraphNode): Promise<string>;
  getNode(id: string): GraphNode | undefined;
  createEdge(edge: GraphEdge): Promise<string>;
  query(query: GraphQuery): GraphNode[];
}
```

**当前实现**：`core/storage/tinyGraphDb.ts` + `core/storage/graphInterface.ts`，已有接口定义

#### 4.1.6 向量数据库封装器

**职责**：封装向量存储，方便替换

```typescript
interface VectorDB {
  createIndex(name: string, dimension: number): void;
  addVector(indexName: string, id: string, vector: number[], metadata?: any): void;
  search(indexName: string, queryVector: number[], topK: number): SearchResult[];
}
```

**当前实现**：`core/storage/vector.ts`，已有接口定义

#### 4.1.7 消息队列封装器

**职责**：封装消息队列，当前使用 SQLite 实现

```typescript
interface MessageQueue {
  enqueue(queueName: string, message: any): Promise<string>;
  dequeue(queueName: string): Promise<any>;
  acknowledge(messageId: string): void;
  size(queueName: string): number;
}
```

**当前状态**：未实现，需新增

#### 4.1.8 策略封装器

**职责**：管理不同层次的策略，支持不同层次的策略类型，输出策略与业务调度框架匹配。支持从外部导入策略，以及根据用户使用体验在默认策略的基础上自动开发新策略。

**策略层次类型**：

| 策略层次 | 类型 | 说明 | 调度框架 |
|----------|------|------|----------|
| **Access 层** | `ChatStrategy` | 对话路由策略、接入方式选择 | 对话调度器 |
| **Application 层** | `BusinessStrategy` | 业务编排策略、任务选择策略 | 业务调度器 |
| **Solution 层** | `PlanStrategy` | 任务分解策略、执行计划策略 | 计划调度器 |
| **Strategy 层** | `AgentStrategy` | Agent 构建策略、思考策略（ReACT） | Agent 调度器 |
| **Core 层** | `CapabilityStrategy` | LLM 选择策略、工具调用策略 | 能力调度器 |

```typescript
type StrategyLevel = 'access' | 'application' | 'solution' | 'strategy' | 'core';

interface StrategyDefinition {
  id: string;
  name: string;
  level: StrategyLevel;
  type: string;
  config: Record<string, any>;
  priority: number;
  enabled: boolean;
}

interface StrategyWrapper {
  register(strategy: StrategyDefinition): string;
  get(id: string): StrategyDefinition | undefined;
  list(level?: StrategyLevel, type?: string): StrategyDefinition[];
  update(id: string, updates: Partial<StrategyDefinition>): void;
  delete(id: string): void;
  execute(id: string, context: StrategyContext): Promise<StrategyResult>;
  
  // 按层次获取策略
  getStrategiesByLevel(level: StrategyLevel): StrategyDefinition[];
  
  // 获取与调度框架匹配的策略
  getMatchingStrategy(level: StrategyLevel, criteria: StrategyCriteria): StrategyDefinition | undefined;
  
  // 策略演化
  autoEvolve(baseStrategyId: string, feedback: StrategyFeedback): Promise<string>;
  
  // 外部导入
  importFromExternal(source: string): Promise<string>;
}

interface StrategyCriteria {
  context: Record<string, any>;
  constraints?: Record<string, any>;
  preferences?: Record<string, any>;
}

interface StrategyResult {
  success: boolean;
  output: Record<string, any>;
  strategyId: string;
  metrics?: StrategyMetrics;
}
```

**调度框架与策略匹配**：

```
┌────────────────────────────────────────────────────────────────────┐
│                      调度框架 (Scheduler)                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│   │ ChatScheduler│    │BusinessScheduler│  │PlanScheduler│       │
│   │ (对话调度)    │    │ (业务调度)     │    │ (计划调度)   │       │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│          │                   │                   │                │
│          ▼                   ▼                   ▼                │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│   │AgentScheduler│    │CapabilityScheduler│                       │
│   │ (Agent调度)  │    │ (能力调度)      │                       │
│   └──────┬───────┘    └──────┬───────┘                           │
│          │                   │                                    │
│          └───────────────────┴───────────────────────────────────┤
│                              │                                    │
│                              ▼                                    │
│   ┌──────────────────────────────────────────────────────────────┐│
│   │              StrategyWrapper (策略封装器)                     ││
│   │                                                              ││
│   │  ┌─────────┐ ┌───────────┐ ┌─────────┐ ┌──────────┐ ┌──────┐││
│   │  │ChatStrat│ │BusinessStr│ │PlanStrat│ │AgentStrat│ │CapStr│││
│   │  │(Access) │ │(Application)│ │(Solution)│ │(Strategy)│ │(Core)│││
│   │  └─────────┘ └───────────┘ └─────────┘ └──────────┘ └──────┘││
│   └──────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────┘
```

**当前实现**：`agent/strategy/index.ts` + `cognitive/reflection/strategyAdjust.ts`，需整合到 `base/strategyWrapper.ts`

### 4.2 Core 层功能

| 模块        | 功能                       | 当前实现                                 |
| --------- | ------------------------ | ------------------------------------ |
| **LLM**   | 管理 LLM 能力（CRUD），路由到不同 Provider，支持查询和展示 | `core/llm/index.ts`                  |
| **MCP**   | 管理 MCP 能力（CRUD），调用 MCP 工具，支持查询和展示 | `core/tools/index.ts`                |
| **Skill** | 管理 Skill 能力（CRUD），执行 Skill，支持查询和展示 | `agent/skillManager.ts`              |
| **Soul**  | 管理 Soul（CRUD），Agent 的独特品质定义，支持查询和展示 | `agent/capability/soulConfig.ts`     |
| **Work**  | 管理 Work（CRUD），具体任务处理流程，支持查询和展示 | `agent/capability/promptTemplate.ts` |
| **Info**  | **统一信息中心**：管理所有用户信息（记忆+知识），为所有层次提供信息服务 | `info/infoService.ts` |

**Core 层原子服务接口（CRUD + 查询 + 展示）**：

```typescript
interface LLMService {
  // CRUD
  create(config: LLMConfig): Promise<string>;
  get(id: string): LLMConfig | undefined;
  list(filter?: LLMFilter): LLMConfig[];
  update(id: string, updates: Partial<LLMConfig>): void;
  delete(id: string): void;
  
  // 查询
  findByType(type: LLMType): LLMConfig[];
  findByProvider(provider: LLMProvider): LLMConfig[];
  findAvailable(): LLMConfig[];
  
  // 展示
  getDisplayInfo(id: string): LLMDisplayInfo;
  listDisplayInfo(filter?: LLMFilter): LLMDisplayInfo[];
  
  // 执行
  generate(prompt: string, options?: LLMOptions): Promise<LLMResult>;
}

interface MCPManager {
  // CRUD
  create(config: MCPConfig): Promise<string>;
  get(id: string): MCPConfig | undefined;
  list(filter?: MCPFilter): MCPConfig[];
  update(id: string, updates: Partial<MCPConfig>): void;
  delete(id: string): void;
  
  // 查询
  findByEndpoint(endpoint: string): MCPConfig | undefined;
  findByCapability(capability: string): MCPConfig[];
  findAvailable(): MCPConfig[];
  
  // 展示
  getDisplayInfo(id: string): MCPDisplayInfo;
  listDisplayInfo(filter?: MCPFilter): MCPDisplayInfo[];
  
  // 执行
  call(endpoint: string, method: string, params: Record<string, any>): Promise<MCPResult>;
  
  // 数据驱动生成
  generateFromHistory(userId: string, infoService: InfoService): Promise<MCPConfig[]>;
  updateFromLearning(userId: string, learningResult: LearnedKnowledge[], infoService: InfoService): Promise<void>;
}

interface SkillManager {
  // CRUD
  create(config: SkillConfig): Promise<string>;
  get(id: string): SkillConfig | undefined;
  list(filter?: SkillFilter): SkillConfig[];
  update(id: string, updates: Partial<SkillConfig>): void;
  delete(id: string): void;
  
  // 查询
  findByName(name: string): SkillConfig | undefined;
  findByCategory(category: string): SkillConfig[];
  findByCapability(capability: string): SkillConfig[];
  findAvailable(): SkillConfig[];
  
  // 展示
  getDisplayInfo(id: string): SkillDisplayInfo;
  listDisplayInfo(filter?: SkillFilter): SkillDisplayInfo[];
  
  // 执行
  execute(id: string, context: Record<string, any>): Promise<SkillResult>;
  
  // 数据驱动生成
  generateFromHistory(userId: string, infoService: InfoService): Promise<SkillConfig[]>;
  updateFromLearning(userId: string, learningResult: LearnedKnowledge[], infoService: InfoService): Promise<void>;
}

interface SoulManager {
  // CRUD
  create(config: SoulConfig): Promise<string>;
  get(id: string): SoulConfig | undefined;
  list(filter?: SoulFilter): SoulConfig[];
  update(id: string, updates: Partial<SoulConfig>): void;
  delete(id: string): void;
  
  // 查询
  findByUserId(userId: string): SoulConfig | undefined;
  findByPersonality(personality: string): SoulConfig[];
  findAvailable(): SoulConfig[];
  
  // 展示
  getDisplayInfo(id: string): SoulDisplayInfo;
  listDisplayInfo(filter?: SoulFilter): SoulDisplayInfo[];
  
  // 数据驱动生成
  generateFromHistory(userId: string, infoService: InfoService): Promise<SoulConfig>;
  updateFromLearning(userId: string, learningResult: LearnedKnowledge[], infoService: InfoService): Promise<void>;
}

interface WorkManager {
  // CRUD
  create(config: WorkConfig): Promise<string>;
  get(id: string): WorkConfig | undefined;
  list(filter?: WorkFilter): WorkConfig[];
  update(id: string, updates: Partial<WorkConfig>): void;
  delete(id: string): void;
  
  // 查询
  findByName(name: string): WorkConfig | undefined;
  findByType(type: WorkType): WorkConfig[];
  findByTask(taskId: string): WorkConfig[];
  findAvailable(): WorkConfig[];
  
  // 展示
  getDisplayInfo(id: string): WorkDisplayInfo;
  listDisplayInfo(filter?: WorkFilter): WorkDisplayInfo[];
  
  // 执行
  execute(id: string, context: WorkContext): Promise<WorkResult>;
  
  // 数据驱动生成
  generateFromHistory(userId: string, infoService: InfoService): Promise<WorkConfig[]>;
  updateFromLearning(userId: string, learningResult: LearnedKnowledge[], infoService: InfoService): Promise<void>;
}
```

**展示信息结构**：

```typescript
interface LLMDisplayInfo {
  id: string;
  name: string;
  type: LLMType;
  provider: LLMProvider;
  maxTokens: number;
  model: string;
  status: 'available' | 'unavailable' | 'error';
  usage?: TokenUsage;
}

interface MCPDisplayInfo {
  id: string;
  name: string;
  endpoint: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'connecting';
  lastHeartbeat?: Date;
}

interface SkillDisplayInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  status: 'enabled' | 'disabled';
  usageCount?: number;
}

interface SoulDisplayInfo {
  id: string;
  name: string;
  userId: string;
  personality: string;
  traits: string[];
  avatar?: string;
  description: string;
}

interface WorkDisplayInfo {
  id: string;
  name: string;
  type: WorkType;
  description: string;
  steps: WorkStep[];
  status: 'active' | 'draft' | 'archived';
  lastUsed?: Date;
}
```

#### 4.2.1 Core 层模块间关系

根据 Canvas 结构图，Core 层内部存在以下关键依赖关系。**注意**：Info 与各模块之间是**数据依赖**关系，而非接口调用依赖。Skill、MCP、Soul、Work 的管理模块需要根据自学习以及与用户的交互，从 Info 的历史信息中生成或更新这些模块的配置。

```
┌─────────────────────────────────────────────────────────────────┐
│                          Core 层                               │
├──────────────┬──────────────┬──────────────┬───────────────────┤
│    LLM       │     MCP      │    Skill     │                   │
│              │              │              │                   │
├──────────────┼──────────────┼──────────────┤                   │
│    Soul      │     Work     │              │                   │
│              │              │              │                   │
└──────────────┴──────────────┴──────────────┴───────────────────┘
         ▲              ▲              ▲              ▲
         │              │              │              │
         │  数据依赖   │  数据依赖   │  数据依赖   │  数据依赖
         │  (生成/更新) │  (生成/更新) │  (生成/更新) │  (生成/更新)
         └──────────────┴──────────────┴──────────────┘
                          │
                          ▼
                     ┌─────────┐
                     │  Info   │
                     │ (信息中心)│
                     └────┬────┘
                          │
                     数据流入
                          │
                          ▼
                     ┌───────────────┐
                     │ LearningService│
                     │   (自学习服务)  │
                     └───────────────┘
```

**Info 与各模块的数据依赖关系**：

| 模块 | 数据依赖说明 | 数据来源 |
|------|------------|----------|
| **Skill** | SkillManager 根据历史交互记录，从 Info 中提取用户常用操作模式，生成或更新技能模板 | Semantic Memory（知识图谱）+ Procedural Memory（流程记录） |
| **MCP** | MCPManager 根据用户偏好和历史工具使用记录，从 Info 中学习用户常用 MCP 端点和参数模式 | Episodic Memory（对话历史）+ Semantic Memory（用户偏好） |
| **Soul** | SoulManager 根据用户长期交互历史，从 Info 中提取用户性格特征、价值观，动态调整 Agent 的独特品质 | Semantic Memory（用户画像知识）+ Episodic Memory（长期对话） |
| **Work** | WorkManager 根据历史任务处理流程，从 Info 中学习最优任务处理模式，生成或更新任务处理流程模板 | Procedural Memory（处理流程）+ Episodic Memory（任务历史） |

**数据流动方向**：

```
用户交互/任务执行
      │
      ▼
┌───────────────┐
│ LearningService│ ──→ 提取知识 ──→ Info（存储历史信息）
└───────────────┘
      │
      ▼
Info（历史信息）←─── 数据查询 ←─── 各模块管理服务
      │
      │ 数据流入（生成/更新）
      ▼
SkillManager / MCPManager / SoulManager / WorkManager
      │
      ▼
   Skill / MCP / Soul / Work（根据历史信息生成或更新）
```

**关键设计原则**：

1. **数据驱动生成**：Skill、MCP、Soul、Work 的生成和更新不是硬编码的，而是由 Info 中的历史数据驱动的
2. **自学习闭环**：LearningService 从交互中提取知识存入 Info，各模块管理服务从 Info 读取数据进行生成/更新
3. **非接口依赖**：Info 与各模块之间不是接口调用关系（调用方 → 被调用方），而是数据依赖关系（数据提供者 → 数据消费者）
4. **按需获取**：各模块管理服务根据需要从 Info 获取指定的信息子集，而非一次性获取所有信息

### 4.2.2 Info 模块详细设计

**定位**：Info 是整个系统的**统一信息中心**，管理所有用户信息，包括用户的各种记忆以及学到的知识，为所有层次（Access、Application、Solution、Strategy、Core）根据需要获取指定的信息。

**Info 模块架构**：

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Info 模块                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│   │ Working    │  │ Episodic   │  │ Semantic    │                │
│   │ Memory     │  │ Memory     │  │ Memory      │                │
│   │ (工作记忆)  │  │ (情节记忆)  │  │ (语义记忆)   │                │
│   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                │
│         │              │              │                             │
│   ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐                    │
│   │ Tag       │  │ Procedural│  │ Random     │                    │
│   │ Neural    │  │ Memory    │  │ Memory     │                    │
│   │ Memory    │  │ (程序记忆) │  │ (随机记忆)  │                    │
│   │ (Tag神经  │  └─────┬─────┘  └────────────┘                    │
│   │ 网络记忆)  │        │                                          │
│   └───────────┘        │                                          │
│                        ▼                                          │
│   ┌─────────────────────────────────────────────┐                   │
│   │           InfoService (统一信息服务)           │                   │
│   │                                               │                   │
│   │   - 信息检索 (search)                         │                   │
│   │   - 信息存储 (store)                          │                   │
│   │   - 信息更新 (update)                         │                   │
│   │   - 信息删除 (delete)                         │                   │
│   │   - 信息聚合 (aggregate)                      │                   │
│   │   - 上下文构建 (buildContext)                 │                   │
│   └─────────────────────────────────────────────┘                   │
│         │              │              │                             │
│         ▼              ▼              ▼                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│   │ Relational  │  │   Graph     │  │   Vector    │                │
│   │    DB       │  │    DB       │  │    DB       │                │
│   └─────────────┘  └─────────────┘  └─────────────┘                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**六层记忆模型**：

所有记忆类型都是对**原始用户问答消息**的分类和索引，原始消息统一存储在 `memory_nodes` 表中：

| 记忆类型 | 分类方式 | 存储内容 | 存储后端 | 默认比例 | 动态调整范围 | 保留时间 |
|----------|----------|----------|----------|----------|-------------|----------|
| **Working Memory** | 最近的问答消息 | 当前对话上下文，全量持久化到 SQLite，根据配置获取指定 Token 长度或轮数 | 内存缓存 + SQLite | 35% | 33% - 37% | 永久 |
| **Tag Neural Memory** | 对问答消息提取 Tag 后建立知识图谱关联 | 基于 Tag 的神经网络记忆，展示 Tag 的无向图，关联相关标签和记忆 | 图数据库 + SQLite | 20% | 18% - 22% | 永久 |
| **Semantic Memory** | 向量搜索到的问答消息 | 对历史对话做向量召回，召回 TopK 对话内容 | 向量数据库 + SQLite | 15% | 13% - 17% | 永久 |
| **Episodic Memory** | 关键词搜索到的问答消息 | 将历史对话内容进行关键词和 BM25 召回，获取 TopK（大于指定评分） | SQLite + FTS5 | 15% | 13% - 17% | 永久 |
| **Procedural Memory** | 根据历史消息沉淀的 Skill、Work、Soul、MCP | 对历史对话做向量匹配，获取召回 TopK 对话内容对应的 Skill、Work、Soul | 向量数据库 + SQLite | 10% | 8% - 12% | 永久 |
| **Random Memory** | 随机挑选的问答内容 | 随机历史对话内容 | SQLite | 5% | 3% - 7% | 永久 |

**用户记忆展示方式**：

1. **历史对话展示**：按事件倒序进行展示，支持关键词搜索和向量搜索
2. **Tag 神经网络展示**：展示 Tag 的无向图，可视化标签之间的关联关系

**上下文构建顺序**：

1. 工作记忆
2. 基于 Tag 的神经网络记忆
3. 语义记忆
4. 情节记忆
5. 程序记忆
6. 随机记忆

**每种类型的对话按照模型的上下文长度进行指定比例的分配，会话在上下文中的顺序也是按比例进行拼接。**

**运行时上下文来源**：工作记忆、情节记忆、程序记忆、语义记忆、随机记忆、基于 Tag 的神经网络记忆都是运行时上下文的来源，这些记忆共同组成 LLM 的上下文输入。

**评估 Agent（动态比例调整）**：

评估 Agent 负责监控各记忆类型的使用效果，并在 ±2% 范围内动态调整记忆比例。

**触发时机**：

| 触发条件 | 频率 | 说明 |
|----------|------|------|
| 对话完成 | 每次 | 对话结束后评估当前上下文的有效性 |
| 定时任务 | 每日 | 汇总每日数据进行全局评估 |
| 性能指标下降 | 实时 | 当回复质量或相关性指标下降时 |
| 用户反馈 | 每次 | 根据用户的点赞/差评调整 |

**评估指标**：

| 指标 | 计算方式 | 影响 |
|------|----------|------|
| **相关性得分** | 记忆内容与当前查询的匹配程度 | 高相关性增加该类型比例 |
| **使用频率** | 该记忆类型被检索到的次数 | 高频率增加该类型比例 |
| **引用准确率** | 被引用的记忆内容是否被正确使用 | 高准确率增加该类型比例 |
| **上下文压缩率** | 该类型记忆在上下文中的有效占比 | 高压缩率增加该类型比例 |

**调整逻辑**：

```typescript
interface EvaluationAgent {
  evaluateMemoryEffectiveness(userId: string): Promise<MemoryEvaluationResult>;
  adjustMemoryRatio(userId: string): Promise<void>;
  getEvaluationHistory(userId: string): MemoryEvaluation[];
}

interface MemoryEvaluationResult {
  workingMemory: EvaluationScore;
  tagNeuralMemory: EvaluationScore;
  semanticMemory: EvaluationScore;
  episodicMemory: EvaluationScore;
  proceduralMemory: EvaluationScore;
  randomMemory: EvaluationScore;
}

interface EvaluationScore {
  relevanceScore: number;     // 0-1
  usageFrequency: number;     // 次数
  referenceAccuracy: number;  // 0-1
  compressionRate: number;    // 0-1
  overallScore: number;       // 综合得分 0-1
}
```

**±2% 约束执行**：

调整时确保每种记忆类型的比例在其约束范围内：
- 工作记忆：33% - 37%
- Tag 神经网络记忆：18% - 22%
- 语义记忆：13% - 17%
- 情节记忆：13% - 17%
- 程序记忆：8% - 12%
- 随机记忆：3% - 7%

**单次调整范围限制**：

每次调整的幅度不超过 0.005%（即 0.00005），避免比例剧烈波动。

```typescript
const MAX_SINGLE_ADJUSTMENT = 0.00005; // 0.005%

function applySingleAdjustment(currentRatio: number, targetRatio: number): number {
  const adjustment = targetRatio - currentRatio;
  const clampedAdjustment = Math.max(
    -MAX_SINGLE_ADJUSTMENT,
    Math.min(MAX_SINGLE_ADJUSTMENT, adjustment)
  );
  return currentRatio + clampedAdjustment;
}
```

**BM25 实现说明**：

情节记忆使用 BM25 算法进行关键词召回。

**实现方案**：
- 使用 SQLite FTS5 扩展进行全文索引
- 自定义 BM25 评分函数计算匹配度
- 参数配置：k1=1.2, b=0.75（标准 BM25 参数）
- TopK 召回：默认 10，可配置
- 最小评分阈值：默认 0.8，低于阈值的结果不返回

**BM25 评分公式**：

```
score(D, Q) = Σ (IDF(q_i) * (f(q_i, D) * (k1 + 1)) / (f(q_i, D) + k1 * (1 - b + b * |D| / avgdl)))

其中：
- D：文档（对话内容）
- Q：查询（用户输入）
- q_i：查询中的第 i 个词
- f(q_i, D)：词 q_i 在文档 D 中的频率
- |D|：文档 D 的长度
- avgdl：平均文档长度
- k1：词频饱和参数（默认 1.2）
- b：文档长度归一化参数（默认 0.75）
- IDF(q_i)：逆文档频率
```

**存储后端映射**：

| 存储类型 | Base 层封装 | 实现方案 |
|----------|------------|----------|
| 内存缓存 | - | Node.js `Map` / LRU 缓存 |
| 关系数据库 | `base/relationalDb.ts` | SQLite |
| 图数据库 | `base/graphDb.ts` | TinyGraphDB |
| 向量数据库 | `base/vectorDb.ts` | 基于 SQLite 的向量索引 |

**记忆比例配置**：

```typescript
interface MemoryRatioConfig {
  workingMemory: number;    // 默认 35%，范围 33%-37%
  tagNeuralMemory: number;  // 默认 20%，范围 18%-22%
  semanticMemory: number;   // 默认 15%，范围 13%-17%
  episodicMemory: number;   // 默认 15%，范围 13%-17%
  proceduralMemory: number; // 默认 10%，范围 8%-12%
  randomMemory: number;     // 默认 5%，范围 3%-7%
}

interface MemoryRatioConstraints {
  workingMemory: { min: number; max: number };
  tagNeuralMemory: { min: number; max: number };
  semanticMemory: { min: number; max: number };
  episodicMemory: { min: number; max: number };
  proceduralMemory: { min: number; max: number };
  randomMemory: { min: number; max: number };
}
```

**记忆数据库表结构设计**：

**存储组件映射**：
- SQLite：结构化数据（表结构、索引、元数据）
- VectorDB（向量数据库）：向量数据（embedding 字段）
- GraphDB（图数据库）：图数据（标签关系、边权重）
- SQLite FTS5：非结构化数据（全文检索、关键词匹配）

```sql
-- 记忆节点表（共享基础表）【存储：SQLite】
CREATE TABLE memory_nodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'working' | 'episodic' | 'semantic' | 'procedural' | 'tag_neural' | 'random'
  content TEXT NOT NULL,
  embedding BLOB, -- 【存储：VectorDB】向量嵌入（语义/程序记忆使用）
  metadata JSON,
  tags TEXT[],
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 工作记忆表【存储：SQLite】
CREATE TABLE working_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  memory_node_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  token_count INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (memory_node_id) REFERENCES memory_nodes(id),
  UNIQUE(user_id, chat_id, message_index)
);

-- 情节记忆表（支持 BM25 索引）【存储：SQLite + FTS5】
CREATE TABLE episodic_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_node_id TEXT NOT NULL,
  chat_id TEXT,
  conversation_summary TEXT, -- 【存储：FTS5】非结构化内容，用于 BM25 检索
  keywords TEXT[],
  score REAL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (memory_node_id) REFERENCES memory_nodes(id)
);

-- 语义记忆表（向量索引）【存储：SQLite + VectorDB】
CREATE TABLE semantic_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_node_id TEXT NOT NULL,
  topic TEXT,
  related_topics TEXT[],
  -- embedding 字段在 memory_nodes 表中【存储：VectorDB】
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (memory_node_id) REFERENCES memory_nodes(id)
);

-- 程序记忆表（关联 Skill/Work/Soul）【存储：SQLite + VectorDB】
CREATE TABLE procedural_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_node_id TEXT NOT NULL,
  skill_id TEXT,
  work_id TEXT,
  soul_id TEXT,
  matched_content TEXT,
  similarity_score REAL DEFAULT 0,
  -- embedding 字段在 memory_nodes 表中【存储：VectorDB】
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (memory_node_id) REFERENCES memory_nodes(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id),
  FOREIGN KEY (work_id) REFERENCES works(id),
  FOREIGN KEY (soul_id) REFERENCES souls(id)
);

-- Tag 神经网络记忆表【存储：SQLite】
CREATE TABLE tag_neural_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  memory_node_id TEXT NOT NULL,
  relevance_score REAL DEFAULT 1.0,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (memory_node_id) REFERENCES memory_nodes(id)
);

-- Tag 关系图表【存储：GraphDB】
CREATE TABLE tag_graph_edges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_tag TEXT NOT NULL,
  to_tag TEXT NOT NULL,
  weight REAL DEFAULT 0.5,
  edge_type TEXT DEFAULT 'related', -- 'related' | 'hierarchical' | 'synonym'
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 记忆比例配置表【存储：SQLite】
CREATE TABLE memory_ratio_config (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  working_memory REAL DEFAULT 0.35,
  tag_neural_memory REAL DEFAULT 0.20,
  semantic_memory REAL DEFAULT 0.15,
  episodic_memory REAL DEFAULT 0.15,
  procedural_memory REAL DEFAULT 0.10,
  random_memory REAL DEFAULT 0.05,
  context_window_tokens INTEGER DEFAULT 8192,
  context_window_messages INTEGER DEFAULT 50,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id)
);

-- 记忆评估记录表（用于动态调整比例）【存储：SQLite】
CREATE TABLE memory_evaluation (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_type TEXT NOT NULL,        -- 'working' | 'tag_neural' | 'semantic' | 'episodic' | 'procedural' | 'random'
  relevance_score REAL DEFAULT 0,   -- 相关性得分 0-1
  usage_frequency INTEGER DEFAULT 0, -- 使用频率（次数）
  reference_accuracy REAL DEFAULT 0, -- 引用准确率 0-1
  compression_rate REAL DEFAULT 0,   -- 上下文压缩率 0-1
  overall_score REAL DEFAULT 0,      -- 综合得分 0-1
  evaluation_count INTEGER DEFAULT 0, -- 评估次数
  last_evaluated_at INTEGER DEFAULT (strftime('%s', 'now')),
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**索引设计**：

```sql
-- 记忆节点表索引
CREATE INDEX idx_memory_nodes_user_id ON memory_nodes(user_id);
CREATE INDEX idx_memory_nodes_type ON memory_nodes(type);
CREATE INDEX idx_memory_nodes_tags ON memory_nodes(tags);

-- 工作记忆表索引
CREATE INDEX idx_working_memory_user_chat ON working_memory(user_id, chat_id);
CREATE INDEX idx_working_memory_updated_at ON working_memory(updated_at);

-- 情节记忆表索引（支持 BM25）
CREATE INDEX idx_episodic_memory_user ON episodic_memory(user_id);
CREATE INDEX idx_episodic_memory_keywords ON episodic_memory(keywords);
CREATE INDEX idx_episodic_memory_created_at ON episodic_memory(created_at);

-- 情节记忆 FTS5 全文索引（用于 BM25 检索）
CREATE VIRTUAL TABLE episodic_memory_fts USING fts5(
  content='episodic_memory',
  content_rowid='id',
  summary,
  keywords,
  tokenize='porter'
);

-- 语义记忆表索引
CREATE INDEX idx_semantic_memory_user ON semantic_memory(user_id);
CREATE INDEX idx_semantic_memory_topic ON semantic_memory(topic);
CREATE INDEX idx_semantic_memory_created_at ON semantic_memory(created_at);

-- 程序记忆表索引
CREATE INDEX idx_procedural_memory_user ON procedural_memory(user_id);
CREATE INDEX idx_procedural_memory_skill ON procedural_memory(skill_id);
CREATE INDEX idx_procedural_memory_work ON procedural_memory(work_id);
CREATE INDEX idx_procedural_memory_soul ON procedural_memory(soul_id);

-- Tag 神经网络记忆表索引
CREATE INDEX idx_tag_neural_user_tag ON tag_neural_memory(user_id, tag);
CREATE INDEX idx_tag_neural_memory_node ON tag_neural_memory(memory_node_id);

-- Tag 关系图索引
CREATE INDEX idx_tag_graph_user ON tag_graph_edges(user_id);
CREATE INDEX idx_tag_graph_from_tag ON tag_graph_edges(from_tag);
CREATE INDEX idx_tag_graph_to_tag ON tag_graph_edges(to_tag);

-- 记忆比例配置索引
CREATE INDEX idx_memory_ratio_user ON memory_ratio_config(user_id);

-- 记忆评估索引
CREATE INDEX idx_memory_evaluation_user_type ON memory_evaluation(user_id, memory_type);
CREATE INDEX idx_memory_evaluation_last_evaluated ON memory_evaluation(last_evaluated_at);
CREATE INDEX idx_memory_evaluation_overall_score ON memory_evaluation(overall_score);
```

**Info 模块核心接口**：

```typescript
interface InfoService {
  // 工作记忆
  getWorkingMemory(userId: string, options?: WorkingMemoryOptions): Promise<MemoryNode[]>;
  addToWorkingMemory(userId: string, memory: MemoryNode): Promise<void>;
  clearWorkingMemory(userId: string): Promise<void>;
  persistWorkingMemory(userId: string): Promise<void>;
  
  // 情节记忆（BM25 召回）
  getEpisodicMemory(userId: string, query: string, topK?: number, minScore?: number): Promise<MemoryNode[]>;
  addEpisodicMemory(userId: string, memory: MemoryNode): Promise<void>;
  
  // 语义记忆（向量召回）
  getSemanticMemory(userId: string, query: string, topK?: number): Promise<MemoryNode[]>;
  addSemanticMemory(userId: string, memory: MemoryNode): Promise<void>;
  getRelatedTags(tag: string, depth?: number): Promise<string[]>;
  
  // 程序性记忆（向量匹配 → Skill/Work/Soul）
  getProceduralMemory(userId: string, query: string, topK?: number): Promise<ProceduralMemoryResult>;
  addProceduralMemory(userId: string, memory: ProceduralMemoryNode): Promise<void>;
  
  // Tag 神经网络记忆
  getTagNeuralMemory(userId: string, tags: string[], depth?: number): Promise<MemoryNode[]>;
  addTagNeuralMemory(userId: string, tag: string, memoryIds: string[]): Promise<void>;
  removeTagNeuralMemory(userId: string, tag: string, memoryId?: string): Promise<void>;
  getTagGraph(userId: string): Promise<TagGraph>;
  
  // 随机记忆
  getRandomMemory(userId: string, count?: number): Promise<MemoryNode[]>;
  
  // 统一检索
  search(userId: string, query: string, options?: SearchOptions): Promise<SearchResult[]>;
  
  // 上下文构建（按比例分配）
  buildContext(userId: string, recentMessages: ChatMessage[], config?: MemoryRatioConfig): Promise<Context>;
  
  // 记忆比例管理
  getMemoryRatioConfig(userId: string): Promise<MemoryRatioConfig>;
  updateMemoryRatioConfig(userId: string, config: Partial<MemoryRatioConfig>): Promise<void>;
  getMemoryRatioConstraints(): MemoryRatioConstraints;
  adjustMemoryRatio(userId: string, adjustments: Partial<MemoryRatioConfig>, evaluator?: string): Promise<void>;
  
  // 信息聚合
  aggregate(userId: string, sources: string[]): Promise<AggregatedInfo>;
  
  // 知识管理
  extractKnowledge(userId: string, content: string): Promise<KnowledgeNode[]>;
  consolidateMemory(userId: string): Promise<void>;
}

interface WorkingMemoryOptions {
  tokenLimit?: number;
  messageLimit?: number;
}

interface ProceduralMemoryResult {
  skills: SkillReference[];
  works: WorkReference[];
  souls: SoulReference[];
  matchedMemories: MemoryNode[];
}

interface TagGraph {
  nodes: TagNode[];
  edges: TagEdge[];
}

interface TagNode {
  tag: string;
  memoryCount: number;
  relatedTags: string[];
}

interface TagEdge {
  fromTag: string;
  toTag: string;
  weight: number;
}
```

**各层次访问 Info 的方式**：

| 层次 | 访问方式 | 访问类型 | 典型用例 |
|------|----------|----------|----------|
| **Access** | API 调用 | 运行时上下文 | 获取用户记忆用于展示 |
| **Application** | 接口调用 | 运行时上下文 | Chat 业务构建上下文 |
| **Solution** | 接口调用 | 运行时上下文 | AgentPlan 获取任务相关知识 |
| **Strategy** | 接口调用 | 运行时上下文 | Agent 执行时获取上下文 |
| **Core (执行时)** | 接口调用 | 运行时上下文 | LLM/Skill/Soul/Work 执行时获取上下文 |
| **Core (生成时)** | 接口调用 | 生成时数据 | 学习模块根据 Info 生成后调用 Core 层保存 |

**访问类型说明**：

| 访问类型 | 说明 | 时机 | 数据来源 |
|----------|------|------|----------|
| **运行时上下文** | 为当前对话/任务提供实时上下文信息 | Agent 执行过程中 | Working Memory + Episodic Memory（最近） |
| **生成时数据** | 学习模块从历史信息中提取知识，生成模块配置后调用 Core 层保存 | 定期/事件触发 | 学习模块从 Info 获取数据 |

**Core 层管理接口**（仅负责 CRUD，不负责生成）：

```typescript
interface SkillManager {
  getSkills(userId: string): Promise<Skill[]>;
  getSkill(userId: string, id: string): Promise<Skill | undefined>;
  createSkill(userId: string, config: SkillConfig): Promise<Skill>;
  updateSkill(userId: string, id: string, config: Partial<SkillConfig>): Promise<Skill>;
  deleteSkill(userId: string, id: string): Promise<void>;
  installSkill(userId: string, id: string): Promise<void>;
  uninstallSkill(userId: string, id: string): Promise<void>;
}

interface MCPManager {
  getMCPs(userId: string): Promise<MCP[]>;
  getMCP(userId: string, id: string): Promise<MCP | undefined>;
  installMCP(userId: string, endpoint: string): Promise<MCP>;
  uninstallMCP(userId: string, id: string): Promise<void>;
  updateMCP(userId: string, id: string, config: Partial<MCPConfig>): Promise<MCP>;
}

interface SoulManager {
  getSoul(userId: string): Promise<Soul>;
  updateSoul(userId: string, config: SoulConfig): Promise<Soul>;
  resetSoul(userId: string): Promise<void>;
}

interface WorkManager {
  getWorks(userId: string): Promise<Work[]>;
  getWork(userId: string, id: string): Promise<Work | undefined>;
  createWork(userId: string, config: WorkConfig): Promise<Work>;
  updateWork(userId: string, id: string, config: Partial<WorkConfig>): Promise<Work>;
  deleteWork(userId: string, id: string): Promise<void>;
}
```

**生成流程说明**：
- Core 层仅负责管理（CRUD），不负责生成
- 生成由学习模块触发：学习模块根据 Info 中的信息产生 Skill/Soul/Work/MCP，然后调用对应的 Manager 保存或安装
- SkillManager/MCPManager/SoulManager/WorkManager 不会直接访问 Info，而是接收学习模块传递的配置

**Skill/Soul/Work 与 Info 的关系**：

1. **执行时上下文获取**：Skill、Soul、Work 执行时获取上下文，这些是作为上下文的一部分传给 LLM，它们本身不会依赖 Info
2. **生成由学习模块触发**：学习模块根据 Info 中的信息产生 Skill/Soul/Work，然后调用对应的组件保存或安装
3. **Core 层仅负责管理**：SkillManager、MCPManager、SoulManager、WorkManager 只是对 Skill、MCP、Work、Soul 的管理（CRUD），并不会生成；真正的生成是由学习模块或者用户触发

**数据驱动生成流程**：

```
学习模块选择要学习的内容
      │
      ▼
产生学习任务交给 AgentPlan
      │
      ▼
工作 Agent 执行任务，过程中产生临时的 Skill/Soul/Work/MCP（临时安装）
      │
      ▼
评价 Agent 对本次问答效果总结
      │
      ├── 对临时 Skill/Soul/Work/MCP 进行打分
      │   ├── 效果评分（1-10）
      │   └── 使用频率评分
      │
      ├── 综合得分达标 → 正式安装
      │   └── 调用 SkillManager/MCPManager/SoulManager/WorkManager 保存
      │
      └── 综合得分不达标 → 释放临时资源
```

**滑动窗口评分机制**：
- 窗口大小：7 天
- 对 Skill/Soul/Work/MCP 的评分采用滑动窗口机制
- 综合得分未达标的资源会被释放
- 自学习的问答内容对用户不可见
- 临时的 Skill/Soul/Work/MCP 对用户不可见

**信息安全与权限**：

```typescript
interface InfoAccessControl {
  checkPermission(userId: string, resourceId: string, action: 'read' | 'write' | 'delete'): boolean;
  filterByUser(userId: string, memories: MemoryNode[]): MemoryNode[];
}
```

**设计原则**：

1. **统一入口**：所有信息访问必须通过 InfoService，禁止直接访问底层数据库
2. **按需提供**：根据调用方的需求，提供指定的信息子集
3. **多层缓存**：工作记忆使用内存缓存，语义记忆使用向量索引
4. **数据隔离**：用户间数据严格隔离，防止信息泄露
5. **知识增强**：自动从对话中提取知识并整合到语义记忆

### 4.2.3 Learning 与 Info 集成

**数据流向**：LearningService 提取知识后，将其存储到 Info 的六层记忆中。

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Learning → Info 集成流程                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   对话/任务完成                                                      │
│        │                                                            │
│        ▼                                                            │
│   ┌───────────────┐                                                 │
│   │ LearningService│                                                 │
│   │   (自学习服务)  │                                                 │
│   └───────┬───────┘                                                 │
│           │                                                         │
│           ├── 提取用户偏好 ─────────────────────────────────────┐    │
│           │                                                    │    │
│           ├── 提取知识实体 ────────────────────────────────────┤    │
│           │                                                    │    │
│           ├── 提取处理流程 ────────────────────────────────────┤    │
│           │                                                    │    │
│           ├── 提取技能模板 ────────────────────────────────────┤    │
│           │                                                    │    │
│           ├── 提取标签关联 ────────────────────────────────────┤    │
│           │                                                    │    │
│           └── 提取对话摘要 ────────────────────────────────────┘    │
│                                                                 │    │
│                                                                 ▼    │
│   ┌────────────────────────────────────────────────────────────────┐ │
│   │                      InfoService                              │ │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│   │   │ Semantic     │  │ Procedural   │  │ Episodic     │        │ │
│   │   │ Memory       │  │ Memory       │  │ Memory       │        │ │
│   │   │ (知识实体)    │  │ (技能/流程)   │  │ (历史记录)    │        │ │
│   │   └──────────────┘  └──────────────┘  └──────────────┘        │ │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│   │   │ Tag Neural   │  │   Working    │  │   Random     │        │ │
│   │   │ Memory       │  │   Memory     │  │   Memory     │        │ │
│   │   │ (标签关联)    │  │   (实时上下文) │  │   (随机采样)   │        │ │
│   │   └──────────────┘  └──────────────┘  └──────────────┘        │ │
│   └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Learning → Info 数据映射**：

| Learning 提取内容 | Info 存储位置 | 存储格式 |
|------------------|--------------|----------|
| 用户偏好/习惯 | Semantic Memory | Tag + Embedding |
| 知识实体/概念 | Semantic Memory | KnowledgeNode |
| 处理流程/模式 | Procedural Memory | ProcedureNode |
| 技能模板 | Procedural Memory | SkillTemplate |
| 对话摘要 | Episodic Memory | ChatSummary |
| 标签关联 | Tag Neural Memory | TagGraph |
| 用户实时交互 | Working Memory | ChatMessage |
| 随机采样数据 | Random Memory | RandomSample |

**集成接口**：

```typescript
interface LearningInfoIntegration {
  storeLearnedKnowledge(userId: string, knowledge: LearnedKnowledge[]): Promise<void>;
  storeLearnedProcedure(userId: string, procedure: ProcedureNode): Promise<void>;
  updateUserPreferences(userId: string, preferences: UserPreferences): Promise<void>;
}

interface LearnedKnowledge {
  type: 'concept' | 'entity' | 'relation' | 'rule';
  content: string;
  tags: string[];
  confidence: number;
  source: string;
}
```

**学习触发时机**：

| 时机 | 触发条件 | 目标记忆 |
|------|----------|----------|
| 对话结束 | 用户完成一次对话 | Episodic + Semantic |
| 任务完成 | Agent 完成任务 | Procedural + Semantic |
| 技能执行 | Skill 成功执行 | Procedural |
| 定期整理 | 定时任务（每日） | Consolidate 所有记忆 |

**学习来源**：

| 来源类型 | 说明 | 比例 |
|----------|------|------|
| **Tag 神经网络驱动** | 基于 Tag 的神经网络，驱动神经网络的连通性提升 | 50% |
| **随机问答提取** | 随机提供用户历史问答内容，提取内容中有意义的名词（主要是技术名词），作为任务进行学习 | 30% |
| **网络热词** | 最近网络热词作为学习任务进行学习 | 5% |
| **行业 Tag** | 随机提取问答 Tag 的行业 Tag 进行学习 | 10% |
| **随机 Tag** | 随机提取问答 Tag 进行学习 | 5% |

**学习任务队列分批机制**：

- 每批任务数量：20 个任务
- 分批策略：按照学习来源比例分配每批任务，避免某一类任务饥饿
- 执行顺序：依次执行每批任务，完成后再启动下一批

```typescript
interface LearningTaskQueue {
  enqueue(tasks: LearningTask[]): void;
  dequeue(count?: number): LearningTask[];
  getBatch(): LearningTask[];
  getStats(): QueueStats;
}

interface LearningTask {
  id: string;
  sourceType: 'tag_neural' | 'random_qa' | 'hot_topics' | 'industry_tag' | 'random_tag';
  content: string;
  priority: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
}

interface QueueStats {
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  batchSize: number;
  currentBatch: number;
}
```

**分批分配示例**（每批 20 个任务）：

| 来源类型 | 每批任务数 | 计算方式 |
|----------|-----------|----------|
| Tag 神经网络驱动 | 10 | 20 × 50% |
| 随机问答提取 | 6 | 20 × 30% |
| 网络热词 | 1 | 20 × 5% |
| 行业 Tag | 2 | 20 × 10% |
| 随机 Tag | 1 | 20 × 5% |

### 4.3 Strategy 层功能

#### 4.3.1 Agent 分类

基于 OpenClaw（异步编排）、Hermes（Planner-Executor-Verifier）、LangChain（DAG 工作流）的设计模式，系统定义四类 Agent：

| Agent 类型 | 核心职责 | 参考框架 | 执行模式 |
|-----------|---------|---------|---------|
| **规划 Agent** | 任务拆分、任务识别、任务编排（DAG） | Hermes Planner | 同步分析 |
| **工作 Agent** | 任务分析、技能选择/生成、执行、产出 | OpenClaw Subagent | 异步执行 |
| **结果汇总 Agent** | 收集产出、整合结果、HTML 美化 | LangChain Synthesizer | 同步汇总 |
| **评估 Agent** | 结果评分、记忆比例调整 | Hermes Verifier | 异步评估 |

#### 4.3.2 规划 Agent（Planner Agent）

**职责**：任务分解与编排，生成可执行的 DAG 图

**核心能力**：

1. **任务拆分**：将复杂任务分解为粒度适中的子任务（拆分跨度不宜过大，建议每步任务执行时间不超过 30 秒）
2. **任务识别**：识别当前任务是否还需要进一步拆分
3. **任务编排**：将子任务编程 DAG 图交给框架，由框架根据 DAG 图生成对应的 Agent 进行任务处理

**设计原则**：
- 参考 Hermes 的"规划者-执行者"分离模式
- 借鉴 OpenClaw 的静默规划思想（纯 LLM 推理，无工具调用）
- 子任务之间必须有明确的衔接关系

```typescript
interface PlannerAgent {
  analyzeTask(task: Task): Promise<TaskAnalysis>;
  decomposeTask(task: Task, maxDepth?: number): Promise<DecompositionResult>;
  generateDAG(tasks: SubTask[]): Promise<TaskDAG>;
}

interface TaskAnalysis {
  taskId: string;
  complexity: 'simple' | 'medium' | 'complex';
  estimatedSteps: number;
  requiresDecomposition: boolean;
  dependencies: string[];
}

interface DecompositionResult {
  rootTask: Task;
  subTasks: SubTask[];
  depth: number;
}

interface SubTask {
  id: string;
  parentId: string | null;
  content: string;
  type: TaskType;
  dependencies: string[];
  estimatedComplexity: number;
  maxExecutionTime: number; // 秒
}

interface TaskDAG {
  nodes: TaskNode[];
  edges: TaskEdge[];
}

interface TaskNode {
  id: string;
  subTask: SubTask;
  agentType: AgentType;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

interface TaskEdge {
  from: string;
  to: string;
  type: 'dependency' | 'data_flow' | 'control_flow';
}
```

**任务拆分策略**：

```typescript
function decomposeTask(task: Task, maxDepth: number = 3): Promise<SubTask[]> {
  // 1. 分析任务复杂度
  // 2. 如果复杂度超过阈值，继续拆分
  // 3. 确保子任务之间有衔接，跨度适中
  // 4. 标记依赖关系
}
```

#### 4.3.3 工作 Agent（Worker Agent）

**职责**：负责具体的任务执行

**核心能力**：

1. **分析任务**：理解任务需求，确定所需的技能和工具
2. **选择/生成 Skill/MCP/Soul/Work**：根据任务选择已有的或生成临时的能力组件
3. **执行任务**：调用技能和工具完成任务
4. **产出结果**：生成结构化的任务结果
5. **提交评分**：将任务上下文、结果以及生成的 Skill/MCP/Work/Soul 交给评价 Agent

**设计原则**：
- 参考 OpenClaw 的异步子 Agent 模型
- 借鉴 LangChain 的 DAG + Pregel 并发框架进行任务处理
- 临时生成的能力组件对用户不可见

```typescript
interface WorkerAgent {
  analyzeAndSelect(task: SubTask, context: ExecutionContext): Promise<CapabilitySelection>;
  execute(task: SubTask, selection: CapabilitySelection): Promise<ExecutionResult>;
  submitForEvaluation(result: ExecutionResult): Promise<void>;
}

interface CapabilitySelection {
  skills: (string | TemporarySkill)[];
  mcps: (string | TemporaryMCP)[];
  souls: (string | TemporarySoul)[];
  works: (string | TemporaryWork)[];
}

interface TemporaryCapability {
  id: string;
  type: 'skill' | 'mcp' | 'soul' | 'work';
  config: Record<string, any>;
  isTemporary: true;
  createdAt: number;
}

interface ExecutionContext {
  taskId: string;
  parentTaskId: string | null;
  inputData: Record<string, any>;
  memoryContext: MemoryContext;
  previousResults: ExecutionResult[];
}

interface ExecutionResult {
  taskId: string;
  status: 'success' | 'partial' | 'failed';
  output: Record<string, any>;
  artifacts: Artifact[];
  temporaryCapabilities: TemporaryCapability[];
  metrics: ExecutionMetrics;
}

interface Artifact {
  type: 'file' | 'data' | 'html' | 'text';
  content: string;
  name: string;
}

interface ExecutionMetrics {
  executionTime: number;
  tokenUsage: number;
  toolCalls: number;
  successRate: number;
}
```

#### 4.3.4 DAG + Pregel 并发调度框架

**设计思想**：借鉴 LangChain 的 DAG 工作流和 Pregel 图计算模型，实现高效的任务并行调度

**核心组件**：

```typescript
interface DAGScheduler {
  schedule(dag: TaskDAG): Promise<SchedulingResult>;
  execute(dag: TaskDAG): Promise<DAGExecutionResult>;
  getStatus(dagId: string): Promise<DAGStatus>;
  cancel(dagId: string): Promise<void>;
}

interface SchedulingResult {
  dagId: string;
  executionOrder: string[];
  parallelGroups: string[][];
  estimatedTime: number;
}

interface DAGExecutionResult {
  dagId: string;
  status: 'completed' | 'failed' | 'partial';
  results: Record<string, ExecutionResult>;
  aggregatedOutput: AggregatedOutput;
}

interface DAGStatus {
  dagId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  runningTasks: string[];
  completedTasks: string[];
  failedTasks: string[];
}
```

**Pregel 并发执行模式**：

```typescript
async function executeDAG(dag: TaskDAG): Promise<DAGExecutionResult> {
  // 1. 构建邻接表，识别入度为 0 的节点
  // 2. 并行执行所有入度为 0 的节点
  // 3. 节点完成后，更新邻接表，减少下游节点的入度
  // 4. 入度变为 0 的节点加入待执行队列
  // 5. 重复直到所有节点完成或失败
}
```

**调度策略**：

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| **拓扑排序** | 按依赖顺序串行执行 | 强依赖场景 |
| **Pregel 并行** | 入度为 0 的节点同时执行 | 弱依赖场景 |
| **混合调度** | 关键路径串行，非关键路径并行 | 复杂任务 |

#### 4.3.5 结果汇总 Agent（Synthesizer Agent）

**职责**：作为 DAG 图中结束节点，收集上游 Agent 的产出，整合并美化结果

**核心能力**：

1. **收集产出**：从所有工作 Agent 收集执行结果
2. **整合结果**：结合任务上下文进行结果的整合
3. **结果展示美化**：
   - 展示层：采用 HTML 方式输出，内容需要有针对性的展示方式（图标、流程图等）
   - 用户复制：确保用户能方便地复制内容
4. **语法检测**：保证返回结果格式的正确性，不能有 HTML 语法错误

**设计原则**：
- 如果检测到 HTML 语法错误，通过 LLM 修复
- 支持多种输出格式（HTML、纯文本、Markdown）

```typescript
interface SynthesizerAgent {
  collectResults(results: ExecutionResult[]): Promise<CollectedData>;
  integrateAndFormat(data: CollectedData, context: TaskContext): Promise<SynthesizedOutput>;
  validateHtml(html: string): Promise<ValidationResult>;
  fixHtmlErrors(html: string, errors: ValidationError[]): Promise<string>;
}

interface CollectedData {
  taskId: string;
  taskContext: TaskContext;
  results: ExecutionResult[];
  artifacts: Artifact[];
}

interface SynthesizedOutput {
  html: string;
  plainText: string;
  markdown: string;
  metadata: OutputMetadata;
}

interface OutputMetadata {
  title: string;
  timestamp: number;
  sources: string[];
  confidence: number;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

interface ValidationError {
  line: number;
  column: number;
  message: string;
  code: string;
}
```

**HTML 生成与验证流程**：

```typescript
async function synthesize(results: ExecutionResult[], context: TaskContext): Promise<SynthesizedOutput> {
  const collected = await collectResults(results);
  
  // 1. 生成初步 HTML
  let html = await generateHtml(collected, context);
  
  // 2. 验证 HTML 语法
  const validation = await validateHtml(html);
  
  // 3. 如果有错误，使用 LLM 修复
  if (!validation.isValid) {
    html = await fixHtmlErrors(html, validation.errors);
    // 再次验证
    const reValidation = await validateHtml(html);
    if (!reValidation.isValid) {
      // 降级为纯文本
      return { html: '', plainText: generatePlainText(collected), markdown: '' };
    }
  }
  
  return {
    html,
    plainText: generatePlainText(collected),
    markdown: generateMarkdown(collected),
    metadata: generateMetadata(collected)
  };
}
```

#### 4.3.6 评估 Agent（Evaluator Agent）

**职责**：对最终结果和上下文进行评分，并针对性地调整记忆的比例参数

**核心能力**：

1. **结果评分**：对工作 Agent 的产出进行综合评分
2. **临时能力评估**：对临时生成的 Skill/MCP/Soul/Work 进行打分
3. **记忆比例调整**：根据评分结果调整各记忆类型的比例参数（单次调整不超过 0.005%）

**评分维度**：

| 维度 | 范围 | 权重 | 说明 |
|------|------|------|------|
| **效果评分** | 1-10 | 60% | 任务完成质量 |
| **使用频率** | 0-∞ | 40% | 能力组件的使用频率 |

**设计原则**：
- 采用滑动窗口评分（窗口大小 7 天）
- 综合得分未达标的临时能力组件会被释放
- 自学习的问答内容和临时能力对用户不可见

```typescript
interface EvaluatorAgent {
  evaluateResult(result: ExecutionResult, context: TaskContext): Promise<EvaluationScore>;
  evaluateCapabilities(capabilities: TemporaryCapability[]): Promise<CapabilityEvaluation[]>;
  adjustMemoryRatios(evaluation: EvaluationScore): Promise<void>;
  getEvaluationHistory(taskId: string): EvaluationRecord[];
}

interface EvaluationScore {
  taskId: string;
  effectiveness: number;       // 1-10
  usageFrequency: number;      // 使用频率
  compositeScore: number;      // 综合得分 0-1
  confidence: number;          // 置信度 0-1
}

interface CapabilityEvaluation {
  capabilityId: string;
  capabilityType: 'skill' | 'mcp' | 'soul' | 'work';
  effectiveness: number;       // 1-10
  usageFrequency: number;      // 使用频率
  compositeScore: number;      // 综合得分 0-1
  shouldKeep: boolean;         // 是否保留
  reason: string;
}

interface EvaluationRecord {
  id: string;
  taskId: string;
  evaluationTime: number;
  scores: EvaluationScore;
  memoryRatioChanges: MemoryRatioConfig | null;
}
```

**滑动窗口评分机制**：

```typescript
interface SlidingWindowEvaluator {
  windowSizeDays: number;      // 默认 7 天
  evaluate(capabilityId: string): Promise<CapabilityEvaluation>;
  addEvaluation(evaluation: CapabilityEvaluation): Promise<void>;
  cleanupExpiredEvaluations(): Promise<void>;
}
```

#### 4.3.7 ThinkingStrategy（Agent 内部思考策略）

**职责**：指导单个 Agent 内部的思考过程，核心为 ReACT 模型

**策略类型**：

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| **ReACT** | Reasoning + Acting，边思考边行动 | 工作 Agent |
| **Plan-Execute** | 先规划再执行 | 规划 Agent |
| **CoT** | Chain of Thought，链式思考 | 需要深度推理的任务 |
| **Reflexion** | 自我反思，迭代改进 | 评估 Agent |

```typescript
interface ThinkingStrategy {
  think(context: ThoughtContext): Promise<ThoughtResult>;
  reflect(previousThought: ThoughtResult, feedback: Feedback): Promise<ThoughtResult>;
}

interface ThoughtContext {
  task: Task;
  history: Thought[];
  availableTools: Tool[];
  memory: MemoryContext;
}

interface Thought {
  id: string;
  type: 'reasoning' | 'action' | 'observation' | 'reflection';
  content: string;
  timestamp: number;
}

interface ThoughtResult {
  nextAction: Action | null;
  reasoning: string;
  confidence: number;
  needsReflection: boolean;
}

interface Action {
  type: 'tool_call' | 'finish' | 'delegate' | 'ask_user';
  toolName?: string;
  parameters?: Record<string, any>;
  message?: string;
}

interface Feedback {
  type: 'success' | 'failure' | 'partial';
  message: string;
  data?: Record<string, any>;
}
```

### 4.4 Solution 层功能

#### 4.4.1 AgentPlan

**职责**：编排任务的 Agent，处理一类任务的 plan

**特点**：

- 既不是一类 Agent，也不是一个 Agent
- 由很多类且很多个 Agent 组成
- 支持递归或子任务拆解派发
- 最后汇总结果

### 4.5 Application 层功能

#### 4.5.1 SelfLearning

**职责**：自学习策略管理

**能力**：

- 学习内容采集
- 学习规划
- 学习管理
- 学习效果评估

**学习来源**：

| 来源类型 | 说明 | 比例 |
|----------|------|------|
| **Tag 神经网络驱动** | 基于 Tag 的神经网络，驱动神经网络的连通性提升 | 50% |
| **随机问答提取** | 随机提供用户历史问答内容，提取内容中有意义的名词（主要是技术名词），作为任务进行学习 | 30% |
| **网络热词** | 最近网络热词作为学习任务进行学习 | 5% |
| **行业 Tag** | 随机提取问答 Tag 的行业 Tag 进行学习 | 10% |
| **随机 Tag** | 随机提取问答 Tag 进行学习 | 5% |

**学习任务队列分批机制**：

- 每批任务数量：20 个任务
- 分批策略：按照学习来源比例分配每批任务，避免某一类任务饥饿
- 执行顺序：依次执行每批任务，完成后再启动下一批

**学习流程**：

```
学习模块选择要学习的内容
      │
      ▼
产生学习任务交给 AgentPlan
      │
      ▼
工作 Agent 执行任务，过程中产生临时的 Skill/Soul/Work/MCP（临时安装）
      │
      ▼
评价 Agent 对本次问答效果总结
      │
      ├── 对临时 Skill/Soul/Work/MCP 进行打分
      │   ├── 效果评分（1-10）
      │   └── 使用频率评分
      │
      ├── 综合得分达标 → 正式安装
      │   └── 调用 SkillManager/MCPManager/SoulManager/WorkManager 保存
      │
      └── 综合得分不达标 → 释放临时资源
```

**滑动窗口评分机制**：
- 窗口大小：7 天
- 对 Skill/Soul/Work/MCP 的评分采用滑动窗口机制
- 综合得分未达标的资源会被释放
- 自学习的问答内容对用户不可见
- 临时的 Skill/Soul/Work/MCP 对用户不可见

```typescript
interface SelfLearningService {
  collectLearningContent(userId: string): Promise<LearningContent[]>;
  planLearning(content: LearningContent[]): Promise<LearningPlan>;
  executeLearning(plan: LearningPlan): Promise<LearningResult>;
  evaluateLearning(result: LearningResult): Promise<EvaluationScore>;
  getLearningHistory(userId: string): LearningRecord[];
}

interface LearningContent {
  id: string;
  sourceType: 'tag_neural' | 'random_qa' | 'hot_topics' | 'industry_tag' | 'random_tag';
  content: string;
  tags: string[];
  priority: number;
}

interface LearningPlan {
  id: string;
  tasks: LearningTask[];
  batchSize: number;
  estimatedCompletionTime: number;
}

interface LearningResult {
  planId: string;
  completedTasks: number;
  failedTasks: number;
  generatedCapabilities: TemporaryCapability[];
  evaluation: EvaluationScore;
}
```

#### 4.5.2 Chat

**职责**：Chat 业务流程

**流程**：

```
用户输入 → 意图分析 → AgentPlan 编排 → Agent 执行 → 结果汇总 → 输出
```

#### 4.5.3 UserProfile

**职责**：用户肖像分析，由独立的用户肖像分析 Agent 完成，实时对用户的输入对话内容进行肖像分析

**设计原则**：
- **动态维度**：肖像的维度因人而异，是一个动态的范围，会根据用户的行为和偏好自动扩展或收缩
- **加权收敛**：每次新对话的肖像分析需要有加权，以保证肖像收敛（历史数据权重递减，新数据权重更高）
- **独立 Agent**：用户肖像分析由专门的 PortraitAgent 完成，与对话流程解耦

**动态分析维度**：

| 维度类型 | 说明 | 示例 |
|----------|------|------|
| **基础属性** | 用户基本信息 | 行业、职位、语言偏好 |
| **兴趣领域** | 用户关注的主题 | 技术领域、兴趣爱好 |
| **行为模式** | 用户的使用习惯 | 活跃时间、输入频率、消息长度 |
| **偏好设置** | 用户的偏好 | 输出格式、模型选择、记忆类型偏好 |
| **技能偏好** | 用户常用的技能 | 常用 Skill、MCP、Work |
| **对话风格** | 用户的交流风格 | 正式/非正式、简短/详细 |

**加权收敛算法**：

```typescript
interface PortraitAgent {
  analyze(userId: string, conversation: ChatMessage[]): Promise<PortraitUpdate>;
  getPortrait(userId: string): Promise<UserPortrait>;
  updatePortrait(userId: string, update: PortraitUpdate): Promise<void>;
}

interface UserPortrait {
  userId: string;
  dimensions: PortraitDimension[];
  lastUpdated: number;
  confidence: number; // 肖像置信度 0-1
}

interface PortraitDimension {
  name: string;
  value: string | number | boolean;
  weight: number;     // 当前权重 0-1
  confidence: number; // 维度置信度 0-1
  sourceCount: number; // 数据来源数量
}

interface PortraitUpdate {
  userId: string;
  dimensionUpdates: DimensionUpdate[];
  timestamp: number;
}

interface DimensionUpdate {
  dimensionName: string;
  newValue: string | number | boolean;
  weight: number;     // 本次更新的权重
  sourceMessageId: string;
}
```

**加权收敛公式**：

```typescript
// 指数加权移动平均（EWMA）
// newWeight = alpha * currentValue + (1 - alpha) * previousValue
// alpha 为学习率，新对话的权重更高

const LEARNING_RATE = 0.3; // 新数据权重

function updatePortraitDimension(
  current: PortraitDimension,
  update: DimensionUpdate
): PortraitDimension {
  const newWeight = LEARNING_RATE * update.weight + (1 - LEARNING_RATE) * current.weight;
  // 值的更新采用加权平均
  const newValue = mergeValues(current.value, update.newValue, LEARNING_RATE);
  
  return {
    ...current,
    value: newValue,
    weight: newWeight,
    confidence: Math.min(1, current.confidence + 0.05),
    sourceCount: current.sourceCount + 1
  };
}
```

### 4.6 Access 层功能

#### 4.6.1 Chat（Web）

**职责**：Web Chat 方式接入

#### 4.6.2 Gateway

**职责**：IM 接入网关（微信、飞书、钉钉等）

#### 4.6.3 ConfigManager

**职责**：配置管理和展示

**管理的配置项**：

| 配置分类 | 配置项 | 说明 |
|----------|--------|------|
| **LLM 配置** | model_endpoints | 各模型的 API 端点 |
| | api_keys | API 密钥管理（加密存储） |
| | default_model | 默认使用的模型 |
| | model_priority | 模型优先级配置 |
| **记忆配置** | memory_ratio_config | 六层记忆比例配置 |
| | context_window_tokens | 上下文窗口 Token 数 |
| | context_window_messages | 上下文窗口消息数 |
| | bm25_parameters | BM25 参数（k1、b、minScore、topK） |
| | vector_search_parameters | 向量搜索参数（topK、similarityThreshold） |
| **学习配置** | learning_sources | 学习来源配置及比例 |
| | learning_batch_size | 学习任务批大小 |
| | evaluation_parameters | 评估参数（滑动窗口、调整幅度） |
| **策略配置** | strategy_levels | 各层次策略配置 |
| | thinking_strategies | 思考策略配置 |
| **系统配置** | log_level | 日志级别 |
| | port | 服务端口 |
| | host | 服务地址 |

#### 4.6.4 Statistic

**职责**：系统监控统计

**数据存储**：所有统计数据保存在数据库中，有效期为 5 年

**多模型统计**：

| 统计项 | 说明 | 存储维度 |
|--------|------|----------|
| **Token 用量** | 输入/输出 Token 数 | 按模型单独统计 + 汇总统计 |
| **调用次数** | 模型调用次数 | 按模型单独统计 + 汇总统计 |
| **首 Token 耗时** | 首 Token 响应时间（ms） | 按模型单独统计 |
| **平均耗时** | 每次调用平均耗时（ms） | 按模型单独统计 + 汇总统计 |
| **成功率** | 调用成功比例 | 按模型单独统计 + 汇总统计 |
| **错误率** | 调用失败比例 | 按模型单独统计 + 汇总统计 |

**系统运行指标**：

| 指标 | 说明 | 统计频率 |
|------|------|----------|
| **问答次数** | 今日/本周/本月/本年问答总数 | 每日 |
| **Skill 重用率** | Skill 被重复使用的比例 | 每日 |
| **MCP 重用率** | MCP 被重复使用的比例 | 每日 |
| **Work 重用率** | Work 被重复使用的比例 | 每日 |
| **Soul 重用率** | Soul 被重复使用的比例 | 每日 |
| **问答耗时** | 单次问答平均耗时（ms） | 每日 |
| **学习量** | 今日学习任务完成数量 | 每日 |
| **Agent 数量** | 系统中 Agent 总数及变化趋势 | 每日 |
| **Agent 重用率** | Agent 被重复调用的比例 | 每日 |
| **记忆命中率** | 各记忆类型的检索命中率 | 每日 |
| **上下文压缩率** | 上下文有效占比 | 每日 |
| **自学习任务成功率** | 自学习任务成功完成比例 | 每日 |
| **临时能力转正率** | 临时能力转为正式能力的比例 | 每日 |

```typescript
interface StatisticService {
  getModelStats(modelId?: string): Promise<ModelStatistics>;
  getSystemStats(timeRange: TimeRange): Promise<SystemStatistics>;
  getDailyStats(date: string): Promise<DailyStatistics>;
  getReuseRates(timeRange: TimeRange): Promise<ReuseRateStatistics>;
}

interface ModelStatistics {
  modelId: string | 'all';
  totalTokenUsage: number;
  inputTokenUsage: number;
  outputTokenUsage: number;
  callCount: number;
  avgFirstTokenLatency: number;
  avgLatency: number;
  successRate: number;
  errorRate: number;
  timeRange: TimeRange;
}

interface SystemStatistics {
  dailyQACount: number;
  totalQACount: number;
  avgQALatency: number;
  learningVolume: number;
  agentCount: number;
  agentReuseRate: number;
  memoryHitRates: MemoryHitRate[];
  contextCompressionRate: number;
  selfLearningSuccessRate: number;
  temporaryCapabilityPromotionRate: number;
}

interface ReuseRateStatistics {
  skillReuseRate: number;
  mcpReuseRate: number;
  workReuseRate: number;
  soulReuseRate: number;
}

interface MemoryHitRate {
  memoryType: MemoryType;
  hitRate: number;
}
```

#### 4.6.5 Visual

**职责**：Multi-Agent 流程可视化与调用链路追踪

**数据保留**：仅保留一天的数据

**可视化内容**：

1. **意图识别**：展示 Agent 如何进行意图识别，识别结果和置信度
2. **模型输入输出**：展示给模型输入的内容和模型输出的内容
3. **能力加载**：展示加载的 Skill、MCP、Work、Soul 等组件
4. **DAG 网络**：展示 Agent 编排出来的 DAG 网络结构
5. **工作 Agent 策略**：展示工作 Agent 内部使用的思考策略（ReACT/CoT/Plan-Execute）
6. **自调用检测**：展示是否进行了自调用及调用链
7. **完整调用链路**：展示从用户输入到最终输出的完整调用链路

```typescript
interface VisualService {
  getCallChain(traceId: string): Promise<CallChain>;
  getDAGVisualization(dagId: string): Promise<DAGVisualization>;
  getAgentExecutionTrace(agentId: string): Promise<ExecutionTrace>;
  listRecentTraces(limit?: number): Promise<TraceSummary[]>;
}

interface CallChain {
  traceId: string;
  startTime: number;
  endTime: number;
  duration: number;
  userInput: string;
  intentRecognition: IntentRecognition;
  modelInteractions: ModelInteraction[];
  capabilitiesLoaded: LoadedCapability[];
  dag: TaskDAG;
  agentStrategies: AgentStrategy[];
  selfCalls: SelfCall[];
  finalOutput: string;
}

interface IntentRecognition {
  intent: string;
  confidence: number;
  entities: Entity[];
}

interface ModelInteraction {
  modelId: string;
  input: string;
  output: string;
  tokenUsage: TokenUsage;
  latency: number;
}

interface LoadedCapability {
  type: 'skill' | 'mcp' | 'work' | 'soul';
  id: string;
  name: string;
  usageCount: number;
}

interface AgentStrategy {
  agentId: string;
  agentType: AgentType;
  strategy: StrategyType;
  thinkingProcess: Thought[];
}

interface SelfCall {
  callId: string;
  fromAgentId: string;
  toAgentId: string;
  purpose: string;
  result: string;
}

interface DAGVisualization {
  dagId: string;
  nodes: VisualNode[];
  edges: VisualEdge[];
  executionOrder: string[];
  parallelGroups: string[][];
}

interface VisualNode {
  id: string;
  type: 'planner' | 'worker' | 'synthesizer' | 'evaluator';
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  executionTime: number;
}

interface VisualEdge {
  from: string;
  to: string;
  type: 'dependency' | 'data_flow' | 'control_flow';
  label?: string;
}
```

#### 4.6.6 Feedback

**职责**：反馈收集系统

**反馈方式**：

| 反馈类型 | 触发方式 | 说明 |
|----------|----------|------|
| **页面选中内容反馈** | 页面选中内容后右击 | 用户对页面中特定内容进行反馈 |
| **Agent 编排策略反馈** | 专门的策略反馈入口 | 用户对 Agent 编排策略进行反馈 |
| **回答内容反馈** | 回答下方的反馈按钮 | 用户对回答内容进行反馈（点赞/差评） |
| **报错自动反馈** | 系统自动触发 | 系统检测到错误时自动收集反馈信息 |

**反馈信息收集**（不含敏感信息）：

| 收集项 | 是否收集 | 说明 |
|--------|----------|------|
| **用户问答内容** | ❌ 不收集 | 敏感信息，不包含在反馈中 |
| **日志内容** | ✅ 收集 | 必要的调试信息 |
| **Agent 调用链** | ✅ 收集 | 用于分析问题 |
| **策略信息** | ✅ 收集 | 编排策略信息 |
| **错误堆栈** | ✅ 收集 | 报错时的堆栈信息 |
| **用户操作路径** | ✅ 收集 | 用户的操作路径 |
| **时间戳** | ✅ 收集 | 反馈发生时间 |
| **用户 ID** | ✅ 收集 | 匿名化处理 |

```typescript
interface FeedbackService {
  submitFeedback(feedback: Feedback): Promise<void>;
  getFeedbackList(filter?: FeedbackFilter): Promise<Feedback[]>;
  getFeedbackStats(timeRange: TimeRange): Promise<FeedbackStatistics>;
}

interface Feedback {
  id: string;
  type: 'content' | 'strategy' | 'answer' | 'error';
  source: 'right_click' | 'button' | 'auto';
  rating?: 'positive' | 'negative' | 'neutral';
  comment?: string;
  metadata: FeedbackMetadata;
  timestamp: number;
  userId: string; // 匿名化
}

interface FeedbackMetadata {
  traceId?: string;
  agentId?: string;
  strategyId?: string;
  errorStack?: string;
  logSnippet?: string;
  operationPath?: string[];
  pageUrl?: string;
  selectedContentHash?: string; // 仅存储哈希，不存储内容
}

interface FeedbackStatistics {
  totalFeedbacks: number;
  positiveRate: number;
  negativeRate: number;
  errorAutoFeedbacks: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
}
```

### 4.7 模块解耦设计

#### 4.7.1 设计原则

**接口契约原则**：模块间仅通过明确定义的接口契约通信，不直接引用对方的实现类。

**依赖倒置原则**：高层模块不依赖低层模块，两者都依赖抽象接口。

**单一职责原则**：每个模块只负责一个核心功能，便于独立升级。

**最小知识原则**：模块间交互只暴露必要信息，隐藏内部实现细节。

#### 4.7.2 模块解耦架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                        模块解耦架构                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │                  跨层共享服务接口                               │ │
│   │                                                               │ │
│   │   InfoService              InfrastructureService              │ │
│   │   (统一信息中心)            (配置/日志/监控)                   │ │
│   └──────────────────┬────────────────────┬───────────────────────┘ │
│                      │                    │                         │
│                      ▼                    ▼                         │
│   Access ──┬── Application ──┬── Solution ──┬── Strategy            │
│            │                 │              │                       │
│            ▼                 ▼              ▼                       │
│         ┌─────────────────────────────────────┐                     │
│         │         接口契约层 (Interface)       │                     │
│         │                                     │                     │
│         │   AccessService      CoreService    │                     │
│         │   ApplicationService StrategyService│                     │
│         └─────────────────────────────────────┘                     │
│            │                 │              │                       │
│            ▼                 ▼              ▼                       │
│   Access ──┴── Application ──┴── Solution ──┴── Strategy            │
│                                                                      │
│                    Core ──┬── Base                                   │
│                           │                                          │
│                           ▼                                          │
│                    ┌─────────────┐                                   │
│                    │  数据契约层  │                                   │
│                    │ (Data Model) │                                   │
│                    └─────────────┘                                   │
│                           │                                          │
│                           ▼                                          │
│                    Core ──┴── Base                                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 4.7.3 接口契约定义

**InfoService 接口（跨层共享）**：

```typescript
interface InfoService {
  // 工作记忆
  getWorkingMemory(userId: string): Promise<MemoryNode[]>;
  addToWorkingMemory(userId: string, memory: MemoryNode): Promise<void>;
  clearWorkingMemory(userId: string): Promise<void>;
  
  // 情节记忆
  getEpisodicMemory(userId: string, filters?: MemoryFilters): Promise<MemoryNode[]>;
  addEpisodicMemory(userId: string, memory: MemoryNode): Promise<void>;
  
  // 语义记忆
  getSemanticMemory(userId: string, query: string): Promise<MemoryNode[]>;
  addSemanticMemory(userId: string, memory: MemoryNode): Promise<void>;
  getRelatedTags(tag: string, depth?: number): Promise<string[]>;
  
  // 程序性记忆
  getProceduralMemory(userId: string, type?: string): Promise<MemoryNode[]>;
  addProceduralMemory(userId: string, memory: MemoryNode): Promise<void>;
  
  // 统一检索
  search(userId: string, query: string, options?: SearchOptions): Promise<SearchResult[]>;
  
  // 上下文构建
  buildContext(userId: string, recentMessages: ChatMessage[]): Promise<Context>;
  
  // 信息聚合
  aggregate(userId: string, sources: string[]): Promise<AggregatedInfo>;
  
  // 知识管理
  extractKnowledge(userId: string, content: string): Promise<KnowledgeNode[]>;
  consolidateMemory(userId: string): Promise<void>;
  
  // Learning 集成
  storeLearnedKnowledge(userId: string, knowledge: LearnedKnowledge[]): Promise<void>;
  storeLearnedProcedure(userId: string, procedure: ProcedureNode): Promise<void>;
  updateUserPreferences(userId: string, preferences: UserPreferences): Promise<void>;
}
```

**InfrastructureService 接口（跨层共享）**：

```typescript
interface InfrastructureService {
  getConfig<T>(key: string): T | undefined;
  log(message: string, level: LogLevel): void;
  monitor(event: MonitorEvent): void;
}
```

**AccessService 接口**：

```typescript
interface AccessService {
  handleChatRequest(request: ChatRequest): Promise<ChatResponse>;
  handleGatewayEvent(event: GatewayEvent): Promise<void>;
}
```

**ApplicationService 接口**：

```typescript
interface ApplicationService {
  processChat(message: ChatMessage): Promise<ChatResult>;
  executeLearningTask(task: LearningTask): Promise<LearningResult>;
  analyzeUserProfile(userId: string): Promise<UserProfile>;
}
```

**SolutionService 接口**：

```typescript
interface SolutionService {
  decomposeTask(task: Task): Promise<TaskGraph>;
  executePlan(planId: string): Promise<ExecutionResult>;
}
```

**StrategyService 接口**：

```typescript
interface StrategyService {
  buildAgent(config: AgentConfig): Promise<Agent>;
  executeAgent(agentId: string, context: ExecutionContext): Promise<AgentResult>;
}
```

**CoreService 接口**：

```typescript
interface CoreService {
  getLLMService(): LLMService;
  getMCPManager(): MCPManager;
  getSkillManager(): SkillManager;
}
```

#### 4.7.4 模块间通信方式

| 通信方式 | 适用场景 | 优点 | 缺点 |
|----------|----------|------|------|
| **接口调用** | 同步请求-响应 | 简单直接，类型安全 | 强依赖 |
| **事件总线** | 异步通知 | 松耦合，解耦发送者和接收者 | 调试困难 |
| **消息队列** | 异步任务 | 解耦生产者和消费者，支持重试 | 增加复杂度 |
| **API 调用** | 跨模块边界 | 完全解耦，独立部署 | 网络开销 |

**推荐方案**：
- 同一层级内使用 **接口调用**
- 跨层级使用 **消息队列**
- 外部系统集成使用 **API 调用**

### 4.8 代码与策略分离设计

#### 4.8.1 分离原则

**策略配置化**：将策略逻辑从代码中抽离，以配置文件形式存储。

**策略热更新**：支持在运行时动态加载策略，无需重启服务。

**策略版本管理**：支持策略的版本控制和回滚。

**策略执行引擎**：统一的策略执行引擎，支持不同类型策略的执行。

#### 4.8.2 策略存储结构

```
data/
├── strategies/                # 策略存储目录
│   ├── react/                 # ReACT 策略
│   │   ├── v1.0.0/
│   │   │   ├── config.json    # 策略配置
│   │   │   ├── prompt.txt     # 提示词模板
│   │   │   └── logic.json     # 策略逻辑定义
│   │   └── v1.1.0/
│   ├── plan-execute/          # Plan-Execute 策略
│   │   └── v1.0.0/
│   └── cot/                   # CoT 策略
│       └── v1.0.0/
│
├── souls/                     # Soul 配置
│   ├── lawyer/
│   │   └── config.json
│   └── engineer/
│       └── config.json
│
├── works/                     # Work 流程
│   ├── file-operation/
│   │   └── workflow.json
│   └── data-analysis/
│       └── workflow.json
│
└── skills/                    # Skill 定义
    ├── web-search/
    │   └── skill.json
    └── code-generation/
        └── skill.json
```

#### 4.8.3 策略配置格式

**策略配置（config.json）**：

```json
{
  "id": "react-strategy",
  "name": "ReACT Strategy",
  "version": "1.0.0",
  "type": "thinking",
  "description": "Reasoning + Acting strategy",
  "parameters": {
    "maxIterations": 10,
    "temperature": 0.7,
    "enableReflection": true
  },
  "dependencies": ["llm", "skill", "info"]
}
```

**策略逻辑（logic.json）**：

```json
{
  "steps": [
    {
      "name": "analyze",
      "type": "llm",
      "input": ["user_input", "context"],
      "output": ["analysis", "thought"],
      "prompt": "prompt/analyze.txt"
    },
    {
      "name": "act",
      "type": "skill",
      "input": ["thought", "available_skills"],
      "output": ["action_result"],
      "condition": "has_actionable_thought"
    },
    {
      "name": "reflect",
      "type": "llm",
      "input": ["action_result", "thought"],
      "output": ["reflection", "next_step"],
      "prompt": "prompt/reflect.txt"
    }
  ],
  "loop": {
    "start": "analyze",
    "end": "reflect",
    "condition": "next_step !== 'finish'"
  }
}
```

#### 4.8.4 策略加载机制

```typescript
interface StrategyLoader {
  load(strategyId: string, version?: string): Promise<Strategy>;
  loadAll(): Promise<Strategy[]>;
  reload(strategyId: string): Promise<void>;
  watch(): void;
}
```

**热更新流程**：
1. 监控策略目录变化
2. 检测到文件变更时，触发策略重新加载
3. 新策略生效，旧策略逐步淘汰

**策略热更新安全机制**：

> **关键问题**：当策略被重新加载时，正在执行该策略的 Agent 如何处理？

**方案：版本固定 + 优雅过渡**

```typescript
interface StrategyLoader {
  load(strategyId: string, version?: string): Promise<Strategy>;
  loadAll(): Promise<Strategy[]>;
  reload(strategyId: string): Promise<void>;
  watch(): void;
  getActiveVersion(strategyId: string): string;
}
```

**热更新安全策略**：

```
1. 策略加载时自动生成版本标识（基于文件内容 hash）
2. Agent 执行时固定使用当前版本的策略实例
3. 策略更新时：
   a. 加载新版本策略
   b. 标记旧版本为"淘汰中"状态
   c. 等待使用旧版本的 Agent 执行完成
   d. 旧版本引用计数归零时，释放资源
   e. 新版本成为默认策略
4. 提供强制切换选项（跳过等待，立即切换）
```

**版本管理结构**：

```
strategies/
└── react/
    ├── v1.0.0/          # 旧版本（淘汰中）
    │   ├── config.json
    │   ├── prompt.txt
    │   └── logic.json
    ├── v1.1.0/          # 当前版本
    │   ├── config.json
    │   ├── prompt.txt
    │   └── logic.json
    └── current -> v1.1.0  # 符号链接指向当前版本
```

**设计原则**：
- 正在执行的 Agent 不受策略更新影响
- 新启动的 Agent 使用最新版本策略
- 支持强制更新（适用于紧急修复）
- 版本切换有明确的状态转换日志

### 4.9 升级模块设计

#### 4.9.1 升级模块架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Upgrade Module                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │ VersionMgr   │───▶│ PackageMgr   │───▶│ Executor     │         │
│   │ 版本管理     │    │ 包管理       │    │ 升级执行     │         │
│   └──────────────┘    └──────────────┘    └──────┬───────┘         │
│                                                    │                │
│                            ┌───────────────────────┼────────────────│
│                            ▼                       ▼                │
│                    ┌──────────────┐    ┌──────────────┐             │
│                    │ RollbackMgr  │    │ Upgrade API  │             │
│                    │ 回滚管理     │    │ 升级服务接口  │             │
│                    └──────────────┘    └──────────────┘             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 4.9.2 VersionManager

**职责**：管理系统版本信息，提供版本比对和更新检查功能。

```typescript
interface VersionManager {
  getCurrentVersion(): VersionInfo;
  checkUpdates(moduleId?: string): Promise<UpdateInfo>;
  compareVersions(v1: string, v2: string): number;
  validateVersion(version: string): boolean;
}
```

**版本信息结构**：

```json
{
  "version": "1.0.0",
  "buildDate": "2026-07-15",
  "modules": {
    "access": "1.0.0",
    "application": "1.0.0",
    "solution": "1.0.0",
    "strategy": "1.0.0",
    "core": "1.0.0",
    "base": "1.0.0",
    "upgrade": "1.0.0"
  }
}
```

#### 4.9.3 PackageManager

**职责**：管理升级包的下载、验证和存储。

> **重要设计约束**：升级包可能较大（200MB+），必须使用流式下载和分块校验，避免一次性读取全部内容到内存导致 OOM。

```typescript
interface PackageManager {
  downloadPackage(packageUrl: string, options?: DownloadOptions): Promise<string>;
  verifyPackage(packagePath: string, checksum: string): Promise<boolean>;
  extractPackage(packagePath: string, targetDir: string): Promise<void>;
  getPackageInfo(packagePath: string): PackageInfo;
}

interface DownloadOptions {
  chunkSize?: number;
  onProgress?: (progress: DownloadProgress) => void;
  timeout?: number;
}

interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
  speed: number;
}
```

**流式下载与分块校验机制**：

```
1. 发起 HTTP GET 请求，获取 Content-Length
2. 创建写入流到临时文件
3. 分块读取响应（默认 1MB/块）
4. 同时计算流式 SHA256 校验和
5. 每块写入完成后更新进度回调
6. 下载完成后比对完整校验和
7. 校验失败则删除临时文件并抛出异常
```

**关键设计原则**：
- 禁止使用 `readAllBytes` 或一次性读取整个文件到内存
- 校验和计算必须在流式写入过程中完成
- 大文件（>100MB）必须启用分块校验
- 下载中断后支持断点续传

**升级包结构**：

```
brian-agent-v1.1.0.zip
├── manifest.json              # 包清单
├── modules/                   # 模块升级包
│   ├── core/
│   │   └── core-v1.1.0.tar.gz
│   └── strategy/
│       └── strategy-v1.1.0.tar.gz
├── strategies/                # 策略更新
│   └── react/
│       └── v1.1.0/
└── migrations/                # 数据库迁移脚本
    └── 1.0.0-to-1.1.0.sql
```

**包清单（manifest.json）**：

```json
{
  "packageId": "brian-agent",
  "version": "1.1.0",
  "previousVersion": "1.0.0",
  "releaseDate": "2026-07-15",
  "checksum": "sha256:...",
  "modules": [
    {
      "id": "core",
      "version": "1.1.0",
      "path": "modules/core/core-v1.1.0.tar.gz",
      "checksum": "sha256:..."
    }
  ],
  "strategies": [
    {
      "id": "react",
      "version": "1.1.0",
      "path": "strategies/react/v1.1.0/"
    }
  ],
  "migrations": [
    {
      "version": "1.0.0-to-1.1.0",
      "path": "migrations/1.0.0-to-1.1.0.sql"
    }
  ],
  "requiredVersion": ">=1.0.0",
  "type": "full"
}
```

#### 4.9.4 UpgradeExecutor

**职责**：执行升级操作，支持全量升级和增量升级。

```typescript
interface UpgradeExecutor {
  executeUpgrade(manifest: Manifest): Promise<UpgradeResult>;
  executeModuleUpgrade(moduleId: string, version: string): Promise<UpgradeResult>;
  getUpgradeStatus(upgradeId: string): UpgradeStatus;
  cancelUpgrade(upgradeId: string): Promise<void>;
}
```

**升级执行流程**：

```
1. 检查当前版本
2. 下载升级包
3. 验证包完整性
4. 备份当前版本
5. 执行模块升级
6. 执行策略更新
7. 执行数据库迁移
8. 验证升级结果
9. 更新版本信息
```

**Electron 部署集成**：

> **关键问题**：项目部署为 Electron 桌面应用，升级模块如何与 Electron 的 native 升级机制交互？

**方案：分层升级策略**

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Electron 应用层                                   │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  Electron AutoUpdater (asar 包升级)                          │   │
│   │  - 主进程代码升级                                            │   │
│   │  - 渲染进程代码升级                                          │   │
│   │  - 依赖包升级                                                │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  BrianAgent Upgrade Module (数据层升级)                      │   │
│   │  - 策略升级                                                 │   │
│   │  - Skill/Soul/Work 升级                                     │   │
│   │  - 数据库迁移                                               │   │
│   │  - 模块级升级                                               │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**升级职责划分**：

| 升级类型 | 负责模块 | 说明 |
|----------|----------|------|
| **应用升级** | Electron AutoUpdater | asar 包替换、主进程/渲染进程代码升级 |
| **策略升级** | BrianAgent Upgrade Module | 策略文件热更新，无需重启 |
| **模块升级** | BrianAgent Upgrade Module | 后端模块代码升级，需重启 |
| **数据升级** | BrianAgent Upgrade Module | 数据库迁移，需重启 |

**Electron 集成流程**：

```
1. Electron 启动时，检查应用更新（AutoUpdater）
2. 应用更新完成后，重启应用
3. 重启后，BrianAgent 检查数据层更新
4. 执行策略、模块、数据库升级
5. 完成后正常启动服务
```

**关键设计原则**：
- 应用升级和数据升级分离，互不依赖
- 数据升级失败不影响应用启动（使用降级策略）
- 应用升级完成后自动触发数据升级检测
- 支持离线升级包（asar 包 + 数据升级包）

#### 4.9.5 RollbackManager

**职责**：管理升级回滚，确保升级失败时能够恢复到之前的版本。

```typescript
interface RollbackManager {
  createBackup(moduleId: string): Promise<string>;
  restoreBackup(backupId: string): Promise<void>;
  listBackups(): BackupInfo[];
  cleanupOldBackups(keepCount: number): Promise<void>;
  createDatabaseSnapshot(): Promise<string>;
  restoreDatabaseSnapshot(snapshotId: string): Promise<void>;
  executeBackwardMigration(migrationVersion: string): Promise<void>;
}
```

**回滚流程**：

```
1. 检测升级失败
2. 暂停服务
3. 恢复代码/策略备份
4. 回滚数据库（执行反向迁移脚本）
5. 重启服务
6. 通知用户
```

**数据库迁移回滚策略**：

```
升级前：
1. 创建数据库快照（SQLite 文件备份）
2. 记录当前数据库版本

升级时：
1. 执行正向迁移脚本（1.0.0-to-1.1.0.sql）
2. 更新数据库版本记录

回滚时：
1. 执行反向迁移脚本（1.1.0-to-1.0.0.sql）
2. 恢复数据库快照（如果反向迁移失败）
3. 回退数据库版本记录
```

**迁移脚本规范**：

```
migrations/
├── 1.0.0-to-1.1.0/
│   ├── forward.sql       # 正向迁移
│   ├── backward.sql      # 反向迁移
│   └── checksum.sha256   # 脚本校验和
└── 1.1.0-to-1.2.0/
    ├── forward.sql
    ├── backward.sql
    └── checksum.sha256
```

**关键设计原则**：
- 所有迁移脚本必须有对应的反向迁移脚本
- 反向迁移必须能够完全恢复到迁移前状态
- 迁移前自动创建数据库快照
- 迁移失败时自动触发回滚

#### 4.9.6 UpgradeService

**职责**：提供升级相关的 API 接口。

```typescript
interface UpgradeService {
  checkForUpdates(): Promise<UpdateInfo>;
  startUpgrade(version?: string): Promise<UpgradeResult>;
  upgradeModule(moduleId: string, version: string): Promise<UpgradeResult>;
  getUpgradeHistory(): UpgradeRecord[];
  rollbackToVersion(version: string): Promise<RollbackResult>;
  
  updateSystemParameters(params: SystemParameterUpdate): Promise<void>;
  getSystemParameters(): Promise<SystemParameters>;
}

interface SystemParameterUpdate {
  memoryRatioConfig?: Partial<MemoryRatioConfig>;
  bm25Parameters?: BM25Parameters;
  vectorSearchParameters?: VectorSearchParameters;
  learningParameters?: LearningParameters;
  evaluationParameters?: EvaluationParameters;
}

interface SystemParameters {
  memoryRatioConfig: MemoryRatioConfig;
  bm25Parameters: BM25Parameters;
  vectorSearchParameters: VectorSearchParameters;
  learningParameters: LearningParameters;
  evaluationParameters: EvaluationParameters;
}

interface BM25Parameters {
  k1: number;
  b: number;
  minScore: number;
  topK: number;
}

interface VectorSearchParameters {
  topK: number;
  similarityThreshold: number;
  embeddingDimension: number;
}

interface LearningParameters {
  batchSize: number;
  learningSources: LearningSourceConfig[];
}

interface LearningSourceConfig {
  type: 'tag_neural' | 'random_qa' | 'hot_topics' | 'industry_tag' | 'random_tag';
  ratio: number;
}

interface EvaluationParameters {
  maxSingleAdjustment: number;
  slidingWindowDays: number;
  effectivenessThreshold: number;
}
```

***

## 五、接口变更确认

### 5.1 现有 API 接口

| 端点                      | 功能       | 状态                 |
| ----------------------- | -------- | ------------------ |
| `POST /api/chat`        | 非流式对话    | 保留                 |
| `POST /api/chat/stream` | SSE 流式对话 | 保留                 |
| `GET /api/config`       | 获取配置     | 保留                 |
| `PUT /api/config`       | 保存配置     | 保留                 |
| `GET /api/memory`       | 获取记忆     | 保留，迁移到 `/api/info` |
| `GET /api/memory/tags`  | 获取标签     | 保留                 |
| `GET /api/mcp`          | MCP 列表   | 保留                 |
| `POST /api/mcp/install` | 安装 MCP   | 新增                 |
| `GET /api/skill`        | Skill 列表 | 保留                 |
| `POST /api/skill`       | 创建 Skill | 保留                 |
| `GET /api/agent`        | Agent 列表 | 保留                 |
| `POST /api/agent`       | 创建 Agent | 保留                 |
| `POST /api/feedback`    | 提交反馈     | 保留                 |
| `GET /api/stats`        | 统计数据     | 保留                 |
| `GET /api/library`      | 知识库      | 保留                 |
| `GET /api/learning`     | 学习队列     | 保留                 |

### 5.2 新增 API 接口

| 端点                            | 功能            | 所属模块                          |
| ----------------------------- | ------------- | ----------------------------- |
| `POST /api/gateway/webhook`   | IM 消息 Webhook | `access/gateway.ts`           |
| `GET /api/profile`            | 获取用户画像        | `application/userProfile.ts`  |
| `GET /api/profile/analysis`   | 用户画像分析        | `application/userProfile.ts`  |
| `GET /api/visual/agent-chain` | Agent 链可视化    | `access/visual.ts`            |
| `GET /api/visual/task-flow`   | 任务流程图         | `access/visual.ts`            |
| `GET /api/plan/tasks`         | 获取任务列表        | `solution/agentPlan.ts`       |
| `POST /api/plan/execute`      | 执行任务计划        | `solution/agentPlan.ts`       |
| `GET /api/strategy/list`      | 获取策略列表        | `strategy/strategyManager.ts` |
| `POST /api/strategy/create`   | 创建策略          | `strategy/strategyManager.ts` |
| `GET /api/queue/stats`        | 消息队列统计        | `base/messageQueue.ts`        |
| `POST /api/queue/publish`     | 发布队列消息        | `base/messageQueue.ts`        |
| `GET /api/info`               | 获取信息中心概览     | `info/infoService.ts`         |
| `GET /api/info/working`       | 获取工作记忆        | `info/infoService.ts`         |
| `GET /api/info/episodic`      | 获取情节记忆（BM25 召回） | `info/infoService.ts`         |
| `GET /api/info/semantic`      | 获取语义记忆（向量召回） | `info/infoService.ts`         |
| `GET /api/info/procedural`    | 获取程序性记忆（向量匹配） | `info/infoService.ts`         |
| `GET /api/info/tag-neural`    | 获取 Tag 神经网络记忆 | `info/infoService.ts`         |
| `GET /api/info/random`        | 获取随机记忆        | `info/infoService.ts`         |
| `GET /api/info/tag-graph`     | 获取标签关系图      | `info/infoService.ts`         |
| `GET /api/info/ratio-config`  | 获取记忆比例配置    | `info/infoService.ts`         |
| `PUT /api/info/ratio-config`  | 更新记忆比例配置    | `info/infoService.ts`         |
| `POST /api/info/search`       | 统一检索           | `info/infoService.ts`         |
| `POST /api/info/context`      | 构建上下文（按比例分配） | `info/infoService.ts`         |
| `GET /api/info/tags`          | 获取相关标签        | `info/infoService.ts`         |
| `POST /api/info/knowledge`    | 存储学到的知识      | `info/infoService.ts`         |
| `GET /api/upgrade/check`      | 检查更新          | `upgrade/upgradeService.ts`   |
| `POST /api/upgrade/start`     | 开始升级          | `upgrade/upgradeService.ts`   |
| `POST /api/upgrade/module`    | 升级指定模块        | `upgrade/upgradeService.ts`   |
| `GET /api/upgrade/history`    | 获取升级历史        | `upgrade/upgradeService.ts`   |
| `POST /api/upgrade/rollback`  | 回滚版本          | `upgrade/upgradeService.ts`   |
| `GET /api/upgrade/status`     | 获取升级状态        | `upgrade/upgradeService.ts`   |
| `GET /api/upgrade/params`     | 获取系统参数配置    | `upgrade/upgradeService.ts`   |
| `PUT /api/upgrade/params`     | 更新系统参数配置    | `upgrade/upgradeService.ts`   |

### 5.3 API 返回格式统一

**统一响应格式**：

```typescript
interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  error?: string;
  code?: string;
  traceId: string;
  timestamp: number;
}
```

### 5.4 内部接口变更

| 模块           | 旧接口              | 新接口                                     |
| ------------ | ---------------- | --------------------------------------- |
| **Storage**  | `StorageService` | `RelationalDB` + `GraphDB` + `VectorDB` |
| **LLM**      | `LLMService`     | `LLMWrapper` + `LLMService`             |
| **Tools**    | `ToolService`    | `MCPWrapper` + `MCPManager`             |
| **Skill**    | `SkillManager`   | `SkillWrapper` + `SkillManager`         |
| **Agent**    | `MetaAgent`      | `Agent` + `AgentOrchestrator`           |
| **Planning** | `TaskPlanner`    | `AgentPlan`                             |

***

## 六、前端页面规划

### 6.1 现有页面

| 页面       | 路径          | 状态 |
| -------- | ----------- | -- |
| Chat     | `/`         | 完整 |
| Memory   | `/memory`   | 完整 |
| Library  | `/library`  | 完整 |
| Monitor  | `/monitor`  | 部分 |
| Soul     | `/soul`     | 部分 |
| Work     | `/work`     | 部分 |
| Skill    | `/skill`    | 完整 |
| MCP      | `/mcp`      | 完整 |
| Models   | `/models`   | 完整 |
| Settings | `/settings` | 完整 |

### 6.2 新增页面

| 页面               | 路径          | 功能         | 依赖后端                          |
| ---------------- | ----------- | ---------- | ----------------------------- |
| **User Profile** | `/profile`  | 用户画像展示与分析  | `application/userProfile.ts`  |
| **Agent Plan**   | `/plan`     | 任务计划管理     | `solution/agentPlan.ts`       |
| **Strategy**     | `/strategy` | 策略管理       | `strategy/strategyManager.ts` |
| **Visual**       | `/visual`   | Agent 链可视化 | `access/visual.ts`            |
| **Gateway**      | `/gateway`  | IM 网关配置    | `access/gateway.ts`           |

### 6.3 页面详细设计

#### 6.3.1 User Profile 页面

**功能模块**：

- 用户基本信息卡片
- 使用习惯分析图表
- 偏好设置展示
- 输入模式统计

**设计风格**：Apple 风格数据仪表盘

**组件树**：

```
ProfileView.vue
├── ProfileHeader.vue          # 用户头像、名称、使用时长
├── StatsGrid.vue              # 统计数据网格
│   ├── StatCard.vue x4       # 对话次数、模型调用、token 消耗、学习进度
├── BehaviorChart.vue          # 使用习惯图表（按时间分布）
├── PreferencePanel.vue        # 偏好设置面板
│   ├── PreferenceItem.vue xN  # 各项偏好设置（模型选择、温度、风格等）
└── InputPattern.vue           # 输入模式统计
```

**数据流**：

- `stores/profile.ts` 获取用户画像数据
- `stores/config.ts` 获取用户配置
- 响应式数据：`profileData`, `stats`, `preferences`, `patterns`

**设计系统集成**：

- 毛玻璃卡片（`glassmorphism`）
- 圆润边角（`rounded-2xl`）
- 数据卡片使用渐变背景
- 图表使用 `chart.js` 或 ECharts

#### 6.3.2 Agent Plan 页面

**功能模块**：

- 任务计划列表
- 任务流程图
- 子任务拆解视图
- 执行状态追踪

**设计风格**：流程图 + 列表组合

**组件树**：

```
PlanView.vue
├── PlanHeader.vue             # 标题、创建新计划按钮
├── TaskList.vue               # 任务计划列表
│   ├── TaskCard.vue xN        # 单个任务卡片（状态、进度、时间）
├── TaskDetail.vue             # 任务详情面板（右侧）
│   ├── SubTaskTree.vue        # 子任务树状视图
│   ├── ExecutionLog.vue       # 执行日志
│   └── StatusBadge.vue        # 状态标签
└── TaskFlow.vue               # 任务流程图（底部/弹窗）
    ├── FlowNode.vue xN        # 流程节点
    └── FlowEdge.vue xN        # 流程连线
```

**数据流**：

- `stores/plan.ts` 获取任务计划数据
- `stores/agent.ts` 获取 Agent 列表
- 响应式数据：`tasks`, `selectedTask`, `subtasks`, `executionStatus`

**设计系统集成**：

- 任务卡片使用颜色编码状态（绿色=完成、蓝色=进行中、灰色=待开始、红色=失败）
- 流程图使用 SVG 绘制
- 毛玻璃效果的详情面板

#### 6.3.3 Strategy 页面

**功能模块**：

- 策略列表
- 策略编辑器
- 策略效果评估
- 策略导入/导出

**设计风格**：代码编辑器风格

**组件树**：

```
StrategyView.vue
├── StrategyHeader.vue         # 标题、导入/导出按钮
├── StrategyList.vue           # 策略列表
│   ├── StrategyCard.vue xN    # 策略卡片（名称、类型、效果评分）
├── StrategyEditor.vue         # 策略编辑器
│   ├── EditorToolbar.vue      # 编辑工具栏
│   ├── CodeEditor.vue         # 策略代码编辑器（类似 Monaco）
│   └── ParameterPanel.vue     # 参数配置面板
└── StrategyEvaluation.vue     # 策略效果评估
    ├── EvaluationChart.vue    # 效果对比图表
    └── FeedbackForm.vue       # 用户反馈表单
```

**数据流**：

- `stores/strategy.ts` 获取策略数据
- 响应式数据：`strategies`, `selectedStrategy`, `editorContent`, `evaluationData`

**设计系统集成**：

- 深色主题代码编辑器
- 语法高亮（策略定义语言）
- 效果评分使用星级或进度条

#### 6.3.4 Visual 页面

**功能模块**：

- Agent 链可视化
- 任务执行流程动画
- 实时状态监控
- 性能指标图表

**设计风格**：深色主题数据可视化

**组件树**：

```
VisualView.vue
├── VisualHeader.vue           # 标题、时间范围选择
├── AgentChainGraph.vue        # Agent 链可视化
│   ├── AgentNode.vue xN       # Agent 节点（含状态）
│   ├── ChainArrow.vue xN      # 连接箭头
│   └── ExecutionTimeline.vue  # 执行时间线
├── RealTimeMonitor.vue        # 实时监控面板
│   ├── MetricCard.vue xN      # 指标卡片（CPU、内存、模型调用）
│   └── StatusIndicator.vue    # 状态指示灯
└── PerformanceChart.vue       # 性能指标图表
    ├── ResponseTimeChart.vue  # 响应时间图表
    └── TokenUsageChart.vue    # Token 用量图表
```

**数据流**：

- `stores/visual.ts` 获取可视化数据
- `stores/stats.ts` 获取统计数据
- 响应式数据：`agentChain`, `metrics`, `realTimeData`, `performance`

**设计系统集成**：

- 深色背景（`apple-dark`）
- 霓虹风格的 Agent 节点
- 动态连线动画
- 神经网络背景（复用 `NeuralBackground.vue`）

#### 6.3.5 Gateway 页面

**功能模块**：

- IM 平台配置（微信、飞书、钉钉）
- Webhook 管理
- 消息路由配置
- 连接状态监控

**设计风格**：卡片式配置界面

**组件树**：

```
GatewayView.vue
├── GatewayHeader.vue          # 标题、状态概览
├── PlatformCards.vue          # IM 平台卡片列表
│   ├── PlatformCard.vue xN    # 单个平台配置卡片
│   │   ├── ConfigForm.vue     # 配置表单
│   │   ├── StatusBadge.vue    # 连接状态
│   │   └── TestButton.vue     # 测试连接按钮
├── WebhookList.vue            # Webhook 列表
│   ├── WebhookItem.vue xN     # Webhook 条目
│   └── AddWebhookButton.vue   # 添加 Webhook
└── MessageRouter.vue          # 消息路由配置
    ├── RouterRule.vue xN      # 路由规则
    └── RuleEditor.vue         # 规则编辑器
```

**数据流**：

- `stores/gateway.ts` 获取网关配置
- `stores/config.ts` 获取系统配置
- 响应式数据：`platforms`, `webhooks`, `routerRules`, `connectionStatus`

**设计系统集成**：

- 平台卡片使用平台品牌色
- 状态指示灯（绿色=在线、红色=离线、黄色=连接中）
- 毛玻璃效果的配置表单

#### 6.3.6 Info 页面（信息中心）

**功能模块**：

- 工作记忆管理（当前对话上下文）
- 情节记忆浏览（历史对话记录，BM25 召回）
- 语义记忆搜索（向量召回）
- 程序性记忆管理（向量匹配 → Skill/Work/Soul）
- Tag 神经网络记忆（标签关联、关系图）
- 随机记忆浏览
- 统一检索（跨记忆类型搜索）
- 知识管理（学习到的知识展示）
- 记忆比例配置（动态调整）

**设计风格**：知识图谱风格的信息管理界面

**组件树**：

```
InfoView.vue
├── InfoHeader.vue              # 标题、统计概览
├── MemoryTabs.vue              # 记忆类型标签页
│   ├── WorkingMemoryTab.vue    # 工作记忆标签页
│   │   ├── MemoryList.vue      # 记忆列表
│   │   │   ├── MemoryCard.vue xN # 记忆卡片
│   │   └── ClearButton.vue     # 清空工作记忆
│   ├── EpisodicMemoryTab.vue   # 情节记忆标签页（BM25）
│   │   ├── TimelineView.vue    # 时间线视图
│   │   └── FilterPanel.vue     # 过滤面板（关键词搜索）
│   ├── SemanticMemoryTab.vue   # 语义记忆标签页（向量召回）
│   │   ├── KnowledgeGraph.vue  # 知识图谱可视化
│   │   ├── TagCloud.vue        # 标签云
│   │   └── RelatedTagsView.vue # 关联标签
│   ├── ProceduralMemoryTab.vue # 程序性记忆标签页（向量匹配）
│   │   ├── SkillTemplateList.vue # 技能模板列表
│   │   ├── WorkFlowList.vue      # 工作流程列表
│   │   └── SoulList.vue          # Soul 列表
│   ├── TagNeuralMemoryTab.vue  # Tag 神经网络记忆标签页
│   │   ├── TagGraphView.vue    # 标签关系图可视化
│   │   ├── TagNodeCard.vue xN  # 标签节点卡片
│   │   └── TagEdgeList.vue     # 标签边列表
│   └── RandomMemoryTab.vue     # 随机记忆标签页
│       ├── RandomMemoryList.vue # 随机记忆列表
│       └── RefreshButton.vue    # 刷新按钮
├── SearchBar.vue               # 统一检索栏
│   └── SearchResults.vue       # 检索结果
├── RatioConfigPanel.vue        # 记忆比例配置面板
│   ├── RatioSlider.vue x6      # 各记忆类型比例滑块
│   ├── PresetSelector.vue      # 预设配置选择
│   └── AutoAdjustToggle.vue    # 自动调整开关
└── KnowledgeManager.vue        # 知识管理器
    ├── LearnedKnowledgeList.vue # 学习到的知识列表
    └── ConsolidateButton.vue    # 整理记忆按钮
```

**数据流**：

- `stores/info.ts` 获取信息中心数据
- `stores/memory.ts` 获取记忆数据
- 响应式数据：`workingMemory`, `episodicMemory`, `semanticMemory`, `proceduralMemory`, `searchResults`, `learnedKnowledge`

**设计系统集成**：

- 记忆卡片使用不同颜色区分类型（蓝色=工作、绿色=情节、紫色=语义、橙色=程序）
- 知识图谱使用力导向布局
- 标签云使用动态大小和颜色
- 时间线使用水平滚动

**新增 Store**：

| Store         | 路径                   | 功能     |
| ------------- | -------------------- | ------ |
| `info.ts`  | `stores/info.ts`  | 信息中心状态 |

#### 6.3.7 Upgrade 页面

**功能模块**：

- 当前版本信息展示
- 检查更新
- 全量升级
- 指定模块升级
- 升级历史
- 版本回滚

**设计风格**：简洁的升级管理界面

**组件树**：

```
UpgradeView.vue
├── UpgradeHeader.vue          # 标题、当前版本信息
├── VersionInfoCard.vue        # 当前版本详情卡片
│   ├── ModuleVersionList.vue  # 各模块版本列表
├── CheckUpdateSection.vue     # 检查更新区域
│   ├── CheckButton.vue        # 检查更新按钮
│   └── UpdateInfoCard.vue     # 更新信息卡片（有更新时显示）
├── UpgradeSection.vue         # 升级操作区域
│   ├── FullUpgradeButton.vue  # 全量升级按钮
│   └── ModuleUpgradeList.vue  # 模块升级列表
│       ├── ModuleUpgradeCard.vue xN  # 单个模块升级卡片
├── UpgradeHistorySection.vue  # 升级历史区域
│   ├── HistoryList.vue        # 升级历史列表
│   │   ├── HistoryItem.vue xN # 历史条目
│   └── RollbackButton.vue     # 回滚按钮
└── UpgradeProgress.vue       # 升级进度弹窗
```

**数据流**：

- `stores/upgrade.ts` 获取升级相关数据
- `stores/config.ts` 获取系统配置
- 响应式数据：`currentVersion`, `updateInfo`, `modules`, `upgradeHistory`, `upgradeStatus`

**设计系统集成**：

- 版本卡片使用渐变背景
- 升级按钮使用主色调（brian-blue）
- 进度条使用动态动画
- 历史条目使用颜色编码状态

### 6.4 前端路由更新

```typescript
const routes: RouteRecordRaw[] = [
  // 现有路由（保持不变）
  { path: '/', name: 'chat', component: ChatView },
  { path: '/memory', name: 'memory', component: MemoryView },
  { path: '/library', name: 'library', component: LibraryView },
  { path: '/monitor', name: 'monitor', component: MonitorView },
  { path: '/soul', name: 'soul', component: SoulView },
  { path: '/work', name: 'work', component: WorkView },
  { path: '/skill', name: 'skill', component: SkillView },
  { path: '/mcp', name: 'mcp', component: MCPView },
  { path: '/models', name: 'models', component: ModelConfigView },
  { path: '/settings', name: 'settings', component: SettingsView },
  
  // 新增路由
  { path: '/info', name: 'info', component: InfoView },
  { path: '/profile', name: 'profile', component: ProfileView },
  { path: '/plan', name: 'plan', component: PlanView },
  { path: '/strategy', name: 'strategy', component: StrategyView },
  { path: '/visual', name: 'visual', component: VisualView },
  { path: '/gateway', name: 'gateway', component: GatewayView },
  { path: '/upgrade', name: 'upgrade', component: UpgradeView },
]
```

### 6.5 前端状态管理更新

**新增 Store**：

| Store         | 路径                   | 功能     |
| ------------- | -------------------- | ------ |
| `info.ts`     | `stores/info.ts`     | 信息中心状态 |
| `profile.ts`  | `stores/profile.ts`  | 用户画像状态 |
| `plan.ts`     | `stores/plan.ts`     | 任务计划状态 |
| `strategy.ts` | `stores/strategy.ts` | 策略状态   |
| `visual.ts`   | `stores/visual.ts`   | 可视化状态  |
| `gateway.ts`  | `stores/gateway.ts`  | 网关配置状态 |
| `upgrade.ts`  | `stores/upgrade.ts`  | 升级管理状态 |

***

## 七、重构实施步骤

### 7.1 阶段一：基础构件层（Base）

**目标**：建立统一的底层封装

| 步骤 | 任务                                                     | 估计时间 |
| -- | ------------------------------------------------------ | ---- |
| 1  | 创建 `base/llmWrapper.ts`，整合 `core/llm/adapters/`        | 2天   |
| 2  | 创建 `base/mcpWrapper.ts`，整合 `core/tools/index.ts`       | 2天   |
| 3  | 创建 `base/skillWrapper.ts`，迁移 `agent/skillManager.ts`   | 1天   |
| 4  | 创建 `base/relationalDb.ts`，标准化 `core/storage/sqlite.ts` | 1天   |
| 5  | 创建 `base/graphDb.ts`，标准化 `core/storage/tinyGraphDb.ts` | 1天   |
| 6  | 创建 `base/vectorDb.ts`，标准化 `core/storage/vector.ts`     | 1天   |
| 7  | 创建 `base/messageQueue.ts`，基于 SQLite 实现                 | 2天   |

### 7.2 阶段二：基础层（Core）

**目标**：基于 Base 层构建核心能力，实现数据驱动生成机制

| 步骤 | 任务                                                              | 估计时间 |
| -- | --------------------------------------------------------------- | ---- |
| 1  | 创建 `core/llm/index.ts`，基于 LLMWrapper                            | 1天   |
| 2  | 创建 `core/mcp/index.ts`，基于 MCPWrapper，实现数据驱动生成（generateFromHistory、updateFromLearning） | 2天   |
| 3  | 创建 `core/skill/index.ts`，基于 SkillWrapper，实现数据驱动生成（generateFromHistory、updateFromLearning） | 2天   |
| 4  | 创建 `core/soul/index.ts`，整合 `agent/capability/soulConfig.ts`，实现数据驱动生成（generateFromHistory、updateFromLearning） | 2天   |
| 5  | 创建 `core/work/index.ts`，整合 `agent/capability/promptTemplate.ts`，实现数据驱动生成（generateFromHistory、updateFromLearning） | 2天   |

### 7.3 阶段三：跨层共享服务（Info）

**目标**：构建统一信息中心，为所有层次提供信息服务（与阶段一、二并行）

| 步骤 | 任务                                                              | 估计时间 |
| -- | --------------------------------------------------------------- | ---- |
| 1  | 创建 `info/memoryNode.ts`，定义记忆节点数据模型                          | 0.5天 |
| 2  | 创建 `info/workingMemory.ts`，实现工作记忆存储（内存 + SQLite 持久化）               | 1天   |
| 3  | 创建 `info/episodicMemory.ts`，实现情节记忆存储（关系数据库 + BM25 索引）            | 2天   |
| 4  | 创建 `info/semanticMemory.ts`，实现语义记忆存储（向量数据库）                     | 2天   |
| 5  | 创建 `info/proceduralMemory.ts`，实现程序性记忆存储（向量匹配 → Skill/Work/Soul）      | 2天   |
| 6  | 创建 `info/tagNeuralMemory.ts`，实现 Tag 神经网络记忆存储（图数据库）               | 1.5天 |
| 7  | 创建 `info/randomMemory.ts`，实现随机记忆存储                              | 0.5天 |
| 8  | 创建 `info/searchEngine.ts`，实现统一检索引擎                              | 2天   |
| 9  | 创建 `info/contextBuilder.ts`，实现上下文构建器（按六层记忆比例分配）                   | 1.5天 |
| 10 | 创建 `info/memoryRatioManager.ts`，实现记忆比例管理器（动态调整约束）                  | 1天   |
| 11 | 创建 `info/evaluationAgent.ts`，实现评估 Agent（比例动态调整）                    | 1.5天 |
| 12 | 创建 `info/knowledgeManager.ts`，实现知识管理器（Learning 集成）               | 1天   |
| 13 | 创建 `info/infoService.ts`，整合所有记忆服务，对外提供统一接口                    | 2天   |

### 7.4 阶段四：策略层（Strategy）

**目标**：构建标准化 Agent 体系

| 步骤 | 任务                                                                           | 估计时间 |
| -- | ---------------------------------------------------------------------------- | ---- |
| 1  | 创建 `strategy/agent.ts`，整合 Agent 核心定义                                         | 2天   |
| 2  | 创建 `strategy/agentOrchestrator.ts`                                           | 2天   |
| 3  | 创建 `strategy/thinkingStrategy.ts`，整合 `agent/strategy/index.ts`               | 1天   |
| 4  | 创建 `strategy/strategyManager.ts`，整合 `cognitive/reflection/strategyAdjust.ts` | 2天   |

### 7.5 阶段四：解决方案层（Solution）

**目标**：实现任务编排

| 步骤 | 任务                                                                     | 估计时间 |
| -- | ---------------------------------------------------------------------- | ---- |
| 1  | 创建 `solution/agentPlan.ts`，整合 `agent/planner.ts` + `agent/executor.ts` | 3天   |

### 7.6 阶段五：应用层（Application）

**目标**：业务流程编排

| 步骤 | 任务                                                           | 估计时间 |
| -- | ------------------------------------------------------------ | ---- |
| 1  | 创建 `application/chat.ts`，整合 `routes/chat.ts` 业务逻辑            | 2天   |
| 2  | 创建 `application/selfLearning.ts`，迁移 `core/learning/index.ts`，集成 Info | 2天   |
| 3  | 创建 `application/userProfile.ts`（新增）                          | 2天   |

### 7.7 阶段六：接入层（Access）

**目标**：统一入口

| 步骤 | 任务                                              | 估计时间 |
| -- | ----------------------------------------------- | ---- |
| 1  | 创建 `access/chat.ts`，迁移 `routes/chat.ts`         | 1天   |
| 2  | 创建 `access/config.ts`，迁移 `routes/config.ts`     | 1天   |
| 3  | 创建 `access/statistic.ts`，迁移 `routes/stats.ts`   | 1天   |
| 4  | 创建 `access/feedback.ts`，迁移 `routes/feedback.ts` | 1天   |
| 5  | 创建 `access/visual.ts`（新增）                       | 2天   |
| 6  | 创建 `access/gateway.ts`（新增）                      | 2天   |

### 7.8 阶段七：前端页面

**目标**：新增页面开发

| 步骤 | 任务                    | 估计时间 |
| -- | --------------------- | ---- |
| 1  | 创建 `InfoView.vue`    | 3天   |
| 2  | 创建 `ProfileView.vue`  | 2天   |
| 3  | 创建 `PlanView.vue`     | 2天   |
| 4  | 创建 `StrategyView.vue` | 2天   |
| 5  | 创建 `VisualView.vue`   | 3天   |
| 6  | 创建 `GatewayView.vue`  | 2天   |
| 7  | 创建 `UpgradeView.vue`  | 2天   |
| 8  | 更新路由配置                | 0.5天 |
| 9  | 更新 Header 导航          | 0.5天 |

### 7.9 阶段八：升级模块

**目标**：实现版本管理、升级执行、回滚机制

| 步骤 | 任务                                                      | 估计时间 |
| -- | ------------------------------------------------------- | ---- |
| 1  | 创建 `upgrade/versionManager.ts`，版本管理与比对               | 2天   |
| 2  | 创建 `upgrade/packageManager.ts`，包下载与验证               | 2天   |
| 3  | 创建 `upgrade/upgradeExecutor.ts`，升级执行与监控             | 3天   |
| 4  | 创建 `upgrade/rollbackManager.ts`，回滚与恢复                 | 2天   |
| 5  | 创建 `upgrade/upgradeService.ts`，升级服务 API              | 2天   |
| 6  | 创建 `access/upgrade.ts`，升级路由接入                        | 1天   |

### 7.9 阶段九：测试与验证

**目标**：确保重构后功能正常

| 步骤 | 任务     | 估计时间 |
| -- | ------ | ---- |
| 1  | 单元测试更新 | 3天   |
| 2  | 集成测试   | 2天   |
| 3  | 回归测试   | 2天   |

***

## 八、风险评估

### 8.1 技术风险

| 风险            | 等级 | 缓解措施                |
| ------------- | -- | ------------------- |
| 接口变更导致前端兼容性问题 | 高  | 保持旧 API 兼容，逐步迁移     |
| 消息队列引入复杂度     | 中  | 先基于 SQLite 实现，后续可替换 |
| 模块拆分导致循环依赖    | 中  | 严格遵守层间依赖规则          |
| 数据库抽象层性能影响    | 低  | 使用抽象但不增加不必要开销       |
| **升级失败导致应用无法启动** | 高 | 升级前自动备份、升级失败自动回滚、双版本共存机制 |
| **策略热更新竞态条件** | 中 | 版本固定机制、引用计数管理、优雅过渡 |
| **模块解耦带来的性能开销** | 低 | 同一层级内使用接口调用，跨层级使用消息队列 |
| **升级模块自身升级问题**（引导问题） | 高 | 升级模块独立打包，支持自更新，预留降级路径 |
| **大升级包 OOM 风险** | 中 | 强制流式下载、分块校验、断点续传 |

### 8.2 实施风险

| 风险        | 等级 | 缓解措施           |
| --------- | -- | -------------- |
| 重构过程中功能中断 | 高  | 分阶段实施，每个阶段独立验证 |
| 测试覆盖率下降   | 中  | 同步更新测试用例       |
| 文档与代码不一致  | 中  | 文档先行，代码跟进      |
| **升级流程复杂导致部署失败** | 高 | 完整的升级测试环境、灰度发布、回滚演练 |
| **策略配置错误影响 Agent 行为** | 中 | 策略配置验证、预览模式、回滚机制 |

### 8.3 进度风险

| 风险       | 等级 | 缓解措施             |
| -------- | -- | ---------------- |
| 前端页面开发滞后 | 中  | 后端 API 优先，前端并行开发 |
| 复杂模块开发超期 | 中  | 预留缓冲时间           |
| **升级模块开发复杂度高** | 中 | 拆分升级模块为独立子任务，逐个实现 |

***

## 九、向后兼容性与迁移策略

### 9.1 兼容性目标

重构过程中保持**完全向后兼容**，确保现有前端和 API 客户端在迁移期间不受影响。

### 9.2 API 兼容策略

#### 9.2.1 旧 API 保留

以下旧 API 在整个重构期间保持可用：

| 旧 API                   | 新 API                   | 兼容方式  |
| ----------------------- | ----------------------- | ----- |
| `POST /api/chat`        | `POST /api/chat`        | 路由代理  |
| `POST /api/chat/stream` | `POST /api/chat/stream` | 路由代理  |
| `GET /api/config`       | `GET /api/config`       | 路由代理  |
| `PUT /api/config`       | `PUT /api/config`       | 路由代理  |
| `GET /api/memory`       | `GET /api/info`         | 路由重定向 |
| `GET /api/memory/tags`  | `GET /api/info/tags`    | 路由重定向 |
| `GET /api/memory/working` | `GET /api/info/working` | 路由重定向 |
| `GET /api/memory/episodic` | `GET /api/info/episodic` | 路由重定向 |
| `GET /api/memory/semantic` | `GET /api/info/semantic` | 路由重定向 |
| `GET /api/memory/procedural` | `GET /api/info/procedural` | 路由重定向 |
| `POST /api/memory/search` | `POST /api/info/search` | 路由重定向 |
| `POST /api/memory/context` | `POST /api/info/context` | 路由重定向 |
| `POST /api/memory/knowledge` | `POST /api/info/knowledge` | 路由重定向 |
| `GET /api/mcp`          | `GET /api/mcp`          | 路由代理  |
| `GET /api/skill`        | `GET /api/skill`        | 路由代理  |
| `GET /api/agent`        | `GET /api/agent`        | 路由代理  |
| `POST /api/feedback`    | `POST /api/feedback`    | 路由代理  |
| `GET /api/stats`        | `GET /api/stats`        | 路由代理  |

#### 9.2.2 路由代理实现

使用 Express 路由代理实现兼容：

```typescript
// routes/legacy-proxy.ts
import { Express, Request, Response, NextFunction } from 'express';
import { registerRoutes as registerNewRoutes } from './new-routes';

export function registerLegacyRoutes(app: Express): void {
  app.use('/api/chat', (req: Request, res: Response, next: NextFunction) => {
    req.url = `/api/new/chat${req.url}`;
    next('route');
  });
  
  app.use('/api/memory', (req: Request, res: Response) => {
    const newPath = `/api/info${req.url}`;
    res.redirect(301, newPath);
  });
  
  registerNewRoutes(app);
}
```

#### 9.2.3 API 版本控制

引入 API 版本控制机制：

```typescript
// routes/index.ts
app.use('/api/v1', registerV1Routes());
app.use('/api/v2', registerV2Routes());
app.use('/api', registerV1Routes());
```

### 9.3 代码迁移策略

#### 9.3.1 迁移阶段划分

| 阶段      | 迁移范围          | 策略                                             |
| ------- | ------------- | ---------------------------------------------- |
| **阶段一** | Base 层        | 新建封装器，不修改现有代码                                  |
| **阶段二** | Core 层        | 基于 Base 层重写，保留旧接口适配                            |
| **阶段三** | Strategy 层    | 新建标准化 Agent，旧 Agent 标记为 deprecated             |
| **阶段四** | Solution 层    | 新建 AgentPlan，旧 planner/executor 标记为 deprecated |
| **阶段五** | Application 层 | 业务逻辑迁移，旧路由代理到新接口                               |
| **阶段六** | Access 层      | 统一入口，旧路由保留代理                                   |
| **阶段七** | 清理            | 删除 deprecated 代码                               |

#### 9.3.2 Legacy 代码标记

使用 `@deprecated` JSDoc 标记标记旧代码：

```typescript
/**
 * @deprecated Use StrategyManager instead
 */
export class MetaAgent {
  // ...
}
```

#### 9.3.3 清理条件

旧代码删除条件：

1. 所有新代码通过测试
2. 前端已迁移到新 API
3. 无外部依赖使用旧 API
4. 保留一个版本周期（如 2 个发布周期）

### 9.4 前端迁移策略

#### 9.4.1 渐进式迁移

前端采用**渐进式迁移**策略：

1. **Phase 1**：新增页面使用新 API，现有页面保持不变
2. **Phase 2**：逐步迁移现有页面到新 API
3. **Phase 3**：清理旧 API 调用代码

#### 9.4.2 API Client 封装

创建统一的 API Client 层：

```typescript
// src/api/client.ts
class ApiClient {
  private baseUrl: string;
  
  getMemory(params: MemoryQuery): Promise<ApiResponse<Memory[]>> {
    return this.get('/api/info', params);
  }
  
  getLegacyMemory(params: LegacyMemoryQuery): Promise<ApiResponse<Memory[]>> {
    return this.get('/api/memory', params);
  }
}
```

***

## 十、总结

### 10.1 重构收益

1. **模块化**：清晰的六层架构 + 跨层共享服务，职责分明
2. **可替换**：Base 层统一封装，方便替换底层实现
3. **可扩展**：标准化接口，便于新增功能
4. **可维护**：降低模块间耦合，提高代码可读性
5. **可视化**：新增流程可视化，便于调试和监控
6. **信息统一**：Info 作为跨层共享服务，为所有层次提供统一信息访问
7. **知识闭环**：Learning → Info 集成，实现学习到记忆的完整闭环
8. **独立升级**：模块解耦 + 升级模块，支持分模块独立升级更新

### 10.2 关键里程碑

| 里程碑             | 完成标志                     |
| --------------- | ------------------------ |
| Base 层完成        | 所有封装器接口定义完成              |
| Info 模块完成      | InfoService 统一接口可用            |
| Core 层完成        | 核心能力全部基于 Base 层          |
| Strategy 层完成    | Agent 标准化定义完成            |
| Solution 层完成    | AgentPlan 任务编排可用         |
| Application 层完成 | Chat、Learning、Profile 可用 |
| Access 层完成      | 所有 API 统一入口              |
| 升级模块完成       | 版本管理、升级执行、回滚机制可用        |
| 前端完成            | 新增页面全部上线                 |
| 测试完成            | 所有测试通过                   |

### 10.3 后续工作

1. **性能优化**：针对高频调用接口进行优化
2. **安全加固**：增加 API 认证、输入验证
3. **部署方案**：Electron 桌面应用打包
4. **文档完善**：API 文档、开发文档更新
5. **社区建设**：MCP 市场扩展、Skill 共享
6. **策略市场**：策略配置化后，开放策略共享平台

