# Brian Agent 后端 PRD 文档

> 版本: v1.0 | 日期: 2026-07-15 | 状态: 设计阶段

***

## 目录

1. [项目概述](#一项目概述)
2. [架构设计](#二架构设计)
3. [模块详细设计](#三模块详细设计)
4. [数据库设计](#四数据库设计)
5. [接口设计](#五接口设计)
6. [配置参数设计](#六配置参数设计)
7. [工作流程设计](#七工作流程设计)
8. [总结](#八总结)

***

## 一、项目概述

### 1.1 项目简介

Brian Agent 是一个基于大语言模型的智能代理系统，支持多 Agent 协作、自学习、用户肖像分析等核心能力。系统采用六层架构设计，实现模块解耦和能力标准化。

### 1.2 核心目标

| 目标 | 描述 |
|------|------|
| 统一封装 | 对 LLM、MCP、Skill 等能力进行标准化封装，方便替换实现 |
| Agent 标准化 | Agent 由策略、MCP、LLM、Skill、Soul、Work 等部分构成 |
| 自学习体系 | 完整的自学习策略，采集、规划、管理学习内容 |
| 用户肖像 | 分析用户喜好，优化输入理解和输出指导 |
| 可视化 | Multi-Agent 系统流程可视化 |
| 监控统计 | 系统资源、模型用量等指标监控 |
| 反馈系统 | 收集用户体验数据，驱动策略调整 |

### 1.3 技术栈

| 层次 | 技术 |
|------|------|
| 语言 | TypeScript |
| 框架 | Express 4 |
| 数据库 | SQLite + VectorDB + GraphDB |
| 消息队列 | SQLite 实现 |
| 前端 | Vue 3 + Vite |

***

## 二、架构设计

### 2.1 六层架构图

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

### 2.2 层次职责说明

| 层次 | 职责 | 关键组件 |
|------|------|----------|
| **Access** | 统一入口，协议转换 | ChatController, IMGateway, ConfigController |
| **Application** | 业务流程编排 | ChatService, SelfLearningService, UserProfileService |
| **Solution** | 任务分解与编排 | AgentPlan, DAGScheduler |
| **Strategy** | Agent 构建与执行 | PlannerAgent, WorkerAgent, SynthesizerAgent, EvaluatorAgent |
| **Core** | 能力管理 | LLMService, MCPManager, SkillManager, InfoService |
| **Base** | 底层能力封装 | LLMWrapper, MCPWrapper, VectorDB, GraphDB |

***

## 三、模块详细设计

### 3.1 Access 接入层

#### 3.1.1 Chat 模块

**功能描述**：Web Chat 请求入口，协议转换

**核心流程**：
1. 接收 WebSocket 连接
2. 解析消息格式
3. 转发到 ChatService
4. 处理流式响应

**关键接口**：
- `POST /api/chat` - 发送消息
- `GET /api/chat/history` - 获取聊天历史

**发送消息参数扩展**：

发送消息接口支持传入用户选中的历史消息 ID，将这部分消息作为用户控制的 memory，参与上下文构建：

```typescript
interface ChatMessageRequest {
  userId: string;
  message: string;
  chatId?: string;
  selectedMessageIds?: string[]; // 用户选中的历史消息ID，作为用户控制的memory
  metadata?: Record<string, any>;
}
```

**注意**：不支持删除聊天记录，所有消息永久保存。

#### 3.1.2 Gateway 模块

**功能描述**：IM 平台接入（微信、飞书等），消息转发

**处理方式**：采用 Hermes 源码中 Gateway 的相同处理方式，核心设计包括：

1. **统一消息格式**：所有 IM 平台消息统一转换为标准消息格式
2. **异步处理**：消息接收后异步处理，不阻塞响应
3. **消息去重**：基于消息 ID 进行去重，避免重复处理
4. **错误重试**：处理失败时自动重试，支持配置重试次数和间隔
5. **消息路由**：根据消息类型路由到不同的处理逻辑
6. **状态管理**：维护消息处理状态（pending/processing/completed/failed）

**核心流程**：
1. 接收 IM 平台消息（验证平台签名）
2. 消息去重检查
3. 格式转换为统一格式
4. 异步转发到 ChatService
5. 处理响应并回调

**支持平台**：微信、飞书、钉钉

**消息处理状态**：

```typescript
interface GatewayMessage {
  id: string;
  platform: 'wechat' | 'feishu' | 'dingtalk';
  rawMessage: Record<string, any>;
  normalizedMessage: NormalizedMessage;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  createdAt: number;
  processedAt?: number;
}

interface NormalizedMessage {
  userId: string;
  content: string;
  timestamp: number;
  messageType: 'text' | 'image' | 'file' | 'event';
  metadata: Record<string, any>;
}
```

#### 3.1.3 Config 模块

**功能描述**：配置管理 API

**核心流程**：
1. 读取配置参数表
2. 返回配置值
3. 更新配置并持久化

**管理的配置项**：LLM 配置、记忆配置、学习配置、策略配置、系统配置

**前端展示与修改**：

配置管理需要前端页面进行展示和修改，支持以下功能：

1. **配置分类展示**：按分类（LLM、记忆、学习、策略、系统）分组展示配置项
2. **搜索过滤**：支持按配置键或描述进行搜索
3. **编辑修改**：支持在线编辑配置值，实时保存
4. **配置验证**：修改时进行格式和范围验证
5. **配置历史**：记录配置变更历史，支持查看和回滚
6. **批量操作**：支持批量导出/导入配置
7. **权限控制**：不同角色有不同的配置修改权限

**配置项分类展示结构**：

```typescript
interface ConfigCategory {
  name: string;
  icon: string;
  configs: ConfigItem[];
}

interface ConfigItem {
  key: string;
  value: any;
  description: string;
  category: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  min?: number;
  max?: number;
  options?: string[];
  editable: boolean;
  lastModified: number;
}
```

#### 3.1.4 Statistic 模块

**功能描述**：系统监控统计

**统计维度**：

**多模型统计**（按模型单独 + 汇总）：
- Token 用量（输入/输出）
- 调用次数
- 首 Token 耗时
- 平均耗时
- 成功率/错误率

**系统运行指标**：
- 今日/本周/本月问答次数
- Skill/MCP/Work/Soul 重用率
- 单次问答平均耗时
- 学习量（今日学习任务完成数量）
- Agent 数量及变化趋势
- Agent 重用率
- 记忆命中率（各记忆类型）
- 上下文压缩率
- 自学习任务成功率
- 临时能力转正率
- 用户活跃度（日活/周活）
- 消息平均长度
- 响应延迟分布

**数据有效期**：5 年

**反馈系统集成**：

统计数据支持经过反馈系统进行发送反馈，用户可以对统计数据中的异常指标进行反馈：

```typescript
interface StatisticFeedback {
  statKey: string;
  statValue: any;
  feedbackType: 'abnormal' | 'suggestion' | 'question';
  comment: string;
  timestamp: number;
}
```

**前端展示**：

统计模块需要前端页面进行展示，支持以下功能：

1. **仪表盘展示**：关键指标卡片展示
2. **趋势图表**：支持按日/周/月查看趋势
3. **多维度筛选**：支持按时间范围、模型、用户等维度筛选
4. **数据导出**：支持导出为 CSV/Excel/PDF
5. **异常告警**：指标异常时显示告警标识
6. **实时刷新**：关键指标实时刷新（轮询或 WebSocket）
7. **反馈入口**：每个指标都有反馈按钮，支持快速反馈

**仪表盘布局**：

```typescript
interface DashboardLayout {
  sections: DashboardSection[];
}

interface DashboardSection {
  title: string;
  cards: StatCard[];
  charts: ChartConfig[];
}

interface StatCard {
  title: string;
  value: string | number;
  unit?: string;
  trend: 'up' | 'down' | 'stable';
  trendValue?: string;
  status: 'normal' | 'warning' | 'critical';
}

interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'table';
  title: string;
  dataKey: string;
  timeRange: 'today' | 'week' | 'month' | 'year';
}
```

#### 3.1.5 Visual 模块

**功能描述**：Multi-Agent 流程可视化

**可视化内容**：
- 意图识别过程（识别结果、置信度）
- 模型输入输出（输入内容、输出内容、Token 用量、耗时）
- 能力加载情况（加载的 Skill、MCP、Work、Soul）
- DAG 网络结构（节点、边、执行顺序）
- 工作 Agent 策略（ReACT/CoT/Plan-Execute）
- 完整调用链路（从用户输入到最终输出）

**数据保留**：保留 7 天

**前端展示方式**：

前端通过指定的问答 ID（chatId + messageId）进行展示可视化流程：

1. **问答列表入口**：在聊天历史列表中，每条消息旁增加"查看流程"按钮
2. **可视化详情页**：点击后进入可视化详情页，展示完整的调用链路
3. **流程导航**：支持向前/向后导航查看相邻消息的流程
4. **DAG 图展示**：使用图形库（如 D3.js、ECharts）展示 DAG 结构
5. **详情展开**：点击节点可展开查看详细信息
6. **时间轴视图**：支持按时间轴查看执行顺序
7. **数据导出**：支持导出调用链路数据

**可视化详情页结构**：

```typescript
interface VisualDetailPage {
  chatId: string;
  messageId: string;
  timestamp: number;
  userInput: string;
  assistantOutput: string;
  callChain: CallChain;
  dagVisualization: DAGVisualization;
  timeline: TimelineEvent[];
}

interface TimelineEvent {
  timestamp: number;
  agentId: string;
  agentType: AgentType;
  action: string;
  duration: number;
  detail: Record<string, any>;
}
```

#### 3.1.6 Feedback 模块

**功能描述**：反馈收集系统

**反馈方式**：
- 页面选中内容右击反馈
- Agent 编排策略反馈
- 回答内容反馈
- 报错自动反馈

**敏感信息过滤**：不收集用户问答内容

### 3.2 Application 应用层

#### 3.2.1 Chat 模块

**功能描述**：Chat 业务流程编排

**核心流程**：
1. 接收用户消息
2. 获取用户肖像
3. 构建上下文（六层记忆）
4. 调用 AgentPlan 进行任务编排
5. 执行任务并获取结果
6. 更新记忆
7. 分析用户肖像

#### 3.2.2 SelfLearning 模块

**功能描述**：自学习策略管理

**学习来源**：

| 来源 | 比例 | 说明 |
|------|------|------|
| Tag 神经网络驱动 | 40% | 基于 Tag 的神经网络连通性提升 |
| 本地知识库用户资料 | 15% | 从本地知识库中的用户资料进行学习 |
| 随机问答提取 | 20% | 提取技术名词作为学习任务 |
| 网络热词 | 5% | 最近网络热词 |
| 行业 Tag | 10% | 随机提取行业 Tag |
| 用户肖像 | 5% | 基于用户肖像分析进行学习 |
| 随机 Tag | 5% | 随机提取问答 Tag |

**分批机制**：每批 20 个任务，按比例分配

**学习流程**：
1. 选择学习内容
2. 产生学习任务
3. 工作 Agent 执行（生成临时能力）
4. 评价 Agent 打分
5. 达标正式安装 / 不达标释放

**滑动窗口评分**：7 天窗口

#### 3.2.3 Document 模块

**功能描述**：文档内容处理，支持从本地知识库学习

**支持格式**：目前暂时只支持 Markdown 格式的知识库资料

**核心能力**：

1. **文档解析**：解析 Markdown 文件，提取结构化内容
2. **内容索引**：对文档内容建立索引（关键词索引 + 向量索引）
3. **知识提取**：从文档中提取知识点、Tag、实体等
4. **学习集成**：将文档内容作为学习来源，参与自学习流程
5. **文档管理**：支持文档的上传、更新、删除

**文档处理流程**：

```typescript
interface DocumentService {
  uploadDocument(document: DocumentUpload): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  listDocuments(userId: string): Promise<Document[]>;
  updateDocument(id: string, updates: Partial<Document>): Promise<Document>;
  deleteDocument(id: string): Promise<void>;
  extractKnowledge(documentId: string): Promise<KnowledgeItem[]>;
  indexDocument(documentId: string): Promise<void>;
}

interface DocumentUpload {
  userId: string;
  title: string;
  content: string; // Markdown 内容
  sourceType: 'upload' | 'url' | 'manual';
  tags?: string[];
}

interface Document {
  id: string;
  userId: string;
  title: string;
  content: string;
  sourceType: 'upload' | 'url' | 'manual';
  tags: string[];
  wordCount: number;
  knowledgeCount: number;
  indexedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface KnowledgeItem {
  id: string;
  documentId: string;
  content: string;
  tags: string[];
  entities: string[];
  embedding: number[];
  createdAt: number;
}
```

**文档学习集成**：

文档模块作为自学习的来源之一（占比 15%），学习流程如下：
1. 从知识库中随机选择文档
2. 提取文档中的知识点
3. 将知识点转化为学习任务
4. 工作 Agent 执行学习任务
5. 生成或更新相关的 Skill/MCP/Soul/Work

#### 3.2.4 UserProfile 模块

**功能描述**：用户肖像分析

**动态维度**：基础属性、兴趣领域、行为模式、偏好设置、技能偏好、对话风格

**加权收敛**：EWMA（指数加权移动平均），新数据权重 0.3

**独立 Agent**：PortraitAgent 独立完成

### 3.3 Solution 解决方案层

#### 3.3.1 AgentPlan 模块

**功能描述**：任务分解与编排

**核心能力**：
1. 任务拆分（粒度适中，每步 ≤ 30 秒）
2. 任务识别（判断是否需要进一步拆分）
3. 任务编排（生成 DAG 图）

**调度框架**：DAG + Pregel 并发框架

### 3.4 Strategy 策略层

#### 3.4.1 Agent 分类

| Agent 类型 | 职责 | 执行模式 |
|-----------|------|---------|
| **规划 Agent** | 任务拆分、识别、编排 | 同步分析 |
| **工作 Agent** | 任务分析、技能选择、执行 | 异步执行 |
| **结果汇总 Agent** | 收集产出、整合结果、HTML 美化 | 同步汇总 |
| **评估 Agent** | 结果评分、记忆比例调整 | 异步评估 |

#### 3.4.2 ThinkingStrategy

**思考策略**：

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| ReACT | Reasoning + Acting | 工作 Agent |
| Plan-Execute | 先规划再执行 | 规划 Agent |
| CoT | Chain of Thought | 深度推理 |
| Reflexion | 自我反思 | 评估 Agent |

### 3.5 Core 基础层

#### 3.5.1 LLM 模块

**功能描述**：LLM 能力管理

**核心接口**：create、get、list、update、delete、generateEmbedding、chatCompletion

**支持模型**：OpenAI、Anthropic、Google

**前端模型配置页面**：

关联目前前端模型配置页面，进行模型的配置管理：

1. **模型列表展示**：展示已配置的模型列表，包含模型名称、类型、状态、Token 用量等信息
2. **模型配置**：支持新增/编辑模型配置，包括 API 端点、API Key、模型参数（temperature、max_tokens 等）
3. **模型测试**：支持在线测试模型连接和响应
4. **默认模型设置**：支持设置默认使用的模型
5. **模型优先级**：支持配置模型优先级排序
6. **Token 用量统计**：展示各模型的 Token 使用情况

**模型配置结构**：

```typescript
interface ModelConfig {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'google';
  endpoint: string;
  apiKey: string; // 加密存储
  defaultParameters: {
    temperature: number;
    maxTokens: number;
    contextWindow: number;
  };
  status: 'active' | 'disabled' | 'error';
  priority: number;
  isDefault: boolean;
  tokenUsage: TokenUsage;
  createdAt: number;
  updatedAt: number;
}
```

#### 3.5.2 MCP 模块

**功能描述**：MCP 能力管理

**核心接口**：install、uninstall、get、list、update、execute

**前端 MCP 商场页面**：

实现参考 Dify 对 MCP 商场的支持，需要有前端页面进行展示：

1. **MCP 商场**：展示可用的 MCP 列表，支持搜索和分类筛选
2. **MCP 详情**：展示 MCP 的详细信息，包括名称、描述、功能、参数、使用示例
3. **一键安装**：支持一键安装 MCP 到用户账号
4. **已安装列表**：展示用户已安装的 MCP，支持卸载和配置
5. **MCP 配置**：支持配置 MCP 的参数和权限
6. **使用统计**：展示 MCP 的使用频率和效果评分

**MCP 商场页面结构**：

```typescript
interface MCPMarketplacePage {
  categories: MCPCategory[];
  mcps: MCPItem[];
  installedMcps: string[];
}

interface MCPItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  version: string;
  author: string;
  rating: number;
  installCount: number;
  features: string[];
  parameters: MCPParameter[];
  isInstalled: boolean;
}

interface MCPParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
}
```

#### 3.5.3 Skill 模块

**功能描述**：Skill 能力管理

**核心接口**：create、get、list、update、delete、install、uninstall、execute

**Skill 封装器**：仅负责 CRUD，不负责生成

**前端 Skill 配置页面**：

类似 MCP 展示页面，展示 Skill 列表，支持用户按照规范的 Skill 格式进行 Skill 人工配置：

1. **Skill 列表**：展示已有的 Skill 列表，支持搜索和分类筛选
2. **Skill 详情**：展示 Skill 的详细信息，包括名称、描述、分类、配置、使用示例
3. **新建 Skill**：支持用户按照规范的 Skill 格式手动创建 Skill
4. **编辑 Skill**：支持编辑已有 Skill 的配置
5. **安装/卸载**：支持安装和卸载 Skill
6. **使用统计**：展示 Skill 的使用频率和效果评分

**Skill 配置格式**：

```typescript
interface SkillConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  inputSchema: SchemaField[];
  outputSchema: SchemaField[];
  promptTemplate: string;
  tools: string[];
  isInstalled: boolean;
  effectivenessScore: number;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
}
```

#### 3.5.4 Soul 模块

**功能描述**：Soul 能力管理

**核心接口**：get、update、reset

**前端 Soul 配置页面**：

类似 MCP 展示页面，展示 Soul 列表，支持用户按照规范的 Soul 格式进行 Soul 人工配置：

1. **Soul 列表**：展示用户的 Soul 列表
2. **Soul 详情**：展示 Soul 的详细信息，包括名称、配置、个性特征等
3. **新建/编辑 Soul**：支持用户按照规范的 Soul 格式手动创建或编辑 Soul
4. **重置 Soul**：支持重置 Soul 为默认配置
5. **使用统计**：展示 Soul 的使用频率和效果评分

**Soul 配置格式**：

```typescript
interface SoulConfig {
  id: string;
  name: string;
  personality: PersonalityTrait[];
  tone: string;
  knowledgeBase: string[];
  constraints: string[];
  exampleResponses: string[];
  effectivenessScore: number;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface PersonalityTrait {
  trait: string;
  value: string;
  weight: number;
}
```

#### 3.5.5 Work 模块

**功能描述**：Work 能力管理

**核心接口**：create、get、list、update、delete

**前端 Work 配置页面**：

类似 MCP 展示页面，展示 Work 列表，支持用户按照规范的 Work 格式进行 Work 人工配置：

1. **Work 列表**：展示已有的 Work 列表，支持搜索和分类筛选
2. **Work 详情**：展示 Work 的详细信息，包括名称、描述、配置、工作流程等
3. **新建 Work**：支持用户按照规范的 Work 格式手动创建 Work
4. **编辑 Work**：支持编辑已有 Work 的配置
5. **删除 Work**：支持删除 Work
6. **使用统计**：展示 Work 的使用频率和效果评分

**Work 配置格式**：

```typescript
interface WorkConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  workflow: WorkflowStep[];
  inputs: SchemaField[];
  outputs: SchemaField[];
  effectivenessScore: number;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface WorkflowStep {
  id: string;
  type: 'llm' | 'skill' | 'mcp' | 'work';
  toolId: string;
  parameters: Record<string, any>;
  condition?: string;
  nextStepId?: string;
}
```

#### 3.5.6 Info 模块

**功能描述**：统一信息中心，六层记忆管理

**六层记忆模型**：

| 记忆类型 | 比例 | 检索方式 | 存储后端 |
|----------|------|----------|----------|
| 工作记忆 | 35% | 直接获取 | 内存 + SQLite |
| Tag 神经网络 | 20% | 标签关系图 | 图数据库 + SQLite |
| 语义记忆 | 15% | 向量召回 | 向量数据库 + SQLite |
| 情节记忆 | 15% | BM25 召回 | SQLite + FTS5 |
| 程序记忆 | 10% | 向量匹配 | 向量数据库 + SQLite |
| 随机记忆 | 5% | 随机采样 | SQLite |

**动态比例调整**：单次调整 ≤ 0.005%，总范围 ±2%

#### 3.5.7 资料库配置模块（Library）

**功能描述**：资料库配置管理，目前后端已有代码实现

**核心能力**：

1. **资料库管理**：支持创建、查看、更新、删除资料库
2. **文档管理**：支持在资料库中上传、管理文档
3. **索引管理**：支持对资料库内容建立索引（关键词索引 + 向量索引）
4. **检索集成**：支持从资料库中检索内容，作为上下文的一部分

**资料库配置结构**：

```typescript
interface LibraryService {
  createLibrary(library: LibraryCreate): Promise<Library>;
  getLibrary(id: string): Promise<Library | undefined>;
  listLibraries(userId: string): Promise<Library[]>;
  updateLibrary(id: string, updates: Partial<Library>): Promise<Library>;
  deleteLibrary(id: string): Promise<void>;
  addDocument(libraryId: string, document: DocumentUpload): Promise<void>;
  removeDocument(libraryId: string, documentId: string): Promise<void>;
  searchLibrary(libraryId: string, query: string): Promise<SearchResult[]>;
}

interface Library {
  id: string;
  userId: string;
  name: string;
  description: string;
  type: 'public' | 'private';
  documentCount: number;
  indexedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface SearchResult {
  documentId: string;
  title: string;
  content: string;
  score: number;
  tags: string[];
}
```

**前端资料库配置页面**：

1. **资料库列表**：展示用户的资料库列表
2. **新建资料库**：支持创建新的资料库
3. **资料库详情**：展示资料库的详细信息和文档列表
4. **文档管理**：支持上传、删除、编辑文档
5. **索引状态**：展示资料库的索引状态
6. **检索测试**：支持测试资料库检索功能

#### 3.5.8 模型配置模块（ModelConfig）

**功能描述**：模型配置管理，包含模型提供商管理和模型配置管理两个子模块。

**文件位置**：
- 提供商管理：`backend/src/core/llm/modelConfig.ts`（`ModelConfigService`）
- 模型配置表：`backend/src/core/modelConfig/ModelConfigService.ts`（`ModelConfigService`）

**一、模型提供商管理**

管理 29 个预置模型提供商，所有提供商默认不启用，由用户自行配置 API Key 后启用。

**预置提供商列表**：OpenAI、Anthropic、Google (Gemini)、Mistral AI、DeepSeek、智谱AI (GLM)、Moonshot (月之暗面)、通义千问 (Qwen)、豆包、百度文心一言、Cohere、Hugging Face、OpenRouter、SiliconFlow、Ollama (本地)、Azure OpenAI、AWS Bedrock、Groq、Together AI、Fireworks AI、Replicate、Perplexity、xAI (Grok)、零一万物 (Yi)、百川智能 (Baichuan)、StepFun (阶跃星辰)、MiniMax、腾讯混元 (Hunyuan)、火山方舟 (Volcengine)

**核心能力**：

1. **提供商配置**：支持创建、查看、更新、删除模型提供商，API Key 以掩码形式（`••••••••` + 后4位）返回
2. **连接测试**：调用提供商 API 验证连接可用性，先保存配置到 DB 再测试
3. **获取最新模型**：`POST /api/config/provider/:id/fetch-models` — 调用提供商 API 获取模型列表，成功则更新模型商模型表，失败不更新
4. **API Key 保护**：前端传掩码值时后端不覆盖真实 Key（`apiKey.startsWith('••••')` 时删除该字段）

**获取最新模型接口返回格式**：
```typescript
// 成功响应（HTTP 200）
{ code: 200, msg: "获取成功", models: ModelConfig[] }

// 失败响应（HTTP 200，通过 code 区分）
{ code: 4xx, msg: "获取失败", content: "错误详情" }
```

**获取最新模型接口错误码**：
| code | 场景 |
|------|------|
| 400 | API Key 未配置或为掩码值 |
| 400 | API 地址未配置 |
| 404 | 提供商不存在 |
| 500 | 网络错误 / 提供商 API 返回失败 |

**二、模型配置表管理**

**功能描述**：管理用户已配置的模型记录，与模型商模型表分离。

**核心接口**：listConfigs、listConfigsByProvider、createConfig、batchSaveConfigs、getConfig、updateConfig、deleteConfig、deleteConfigsByProvider、setDefault、unsetDefault、getDefaultConfig

**批量保存策略**：`batchSaveConfigs` 使用事务内增删改，传入的模型列表与 DB 中已有记录对比，新的插入、已有的更新、不在列表中的删除。

**模型配置表结构**：

```sql
CREATE TABLE user_model_config (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT '',
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL DEFAULT '',
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  supports_tools INTEGER NOT NULL DEFAULT 0,
  quota_tokens_per_day INTEGER NOT NULL DEFAULT 100000,
  quota_tokens_per_week INTEGER NOT NULL DEFAULT 5000000,
  quota_tokens_per_month INTEGER NOT NULL DEFAULT 22000000,
  quota_calls_per_day INTEGER NOT NULL DEFAULT 1000,
  quota_calls_per_week INTEGER NOT NULL DEFAULT 5000,
  quota_calls_per_month INTEGER NOT NULL DEFAULT 22000,
  is_default INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
```

**ModelConfig 接口**：
```typescript
interface ModelConfig {
  id: string;
  userId: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  maxTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
  quotaTokensPerDay: number;
  quotaTokensPerWeek: number;
  quotaTokensPerMonth: number;
  quotaCallsPerDay: number;
  quotaCallsPerWeek: number;
  quotaCallsPerMonth: number;
  isDefault: boolean;
  status: 'active' | 'disabled' | 'error';
  createdAt: number;
  updatedAt: number;
  name: string;
  type: 'openai' | 'anthropic' | 'google';
  endpoint: string;
  apiKey: string;
  defaultParameters: { temperature: number; maxTokens: number; contextWindow: number };
  priority: number;
}
```

### 3.6 Base 基础构件层

#### 3.6.1 LLMWrapper

**功能描述**：LLM 厂商适配

**支持厂商**：OpenAI、Anthropic、Google

#### 3.6.2 MCPWrapper

**功能描述**：MCP 协议适配

#### 3.6.3 SkillWrapper

**功能描述**：Skill 运行时适配

#### 3.6.4 Database Wrappers

**功能描述**：数据库封装

| 封装器 | 后端 | 用途 |
|--------|------|------|
| RelationalDB | SQLite | 结构化数据 |
| VectorDB | 向量存储 | 向量数据 |
| GraphDB | TinyGraphDB | 图数据 |

#### 3.6.5 MessageQueue

**功能描述**：消息队列封装（SQLite 实现）

***

## 四、数据库设计

### 4.1 存储组件映射

| 存储组件 | 用途 | 对应表 |
|----------|------|--------|
| SQLite | 结构化数据 | memory_nodes, working_memory, tag_neural_memory, memory_ratio_config, memory_evaluation, users, skills, mcps, souls, works, system_config |
| SQLite FTS5 | 全文检索 | episodic_memory |
| VectorDB | 向量数据 | memory_nodes.embedding |
| GraphDB | 图数据 | tag_graph_edges |

### 4.2 核心表结构

#### 4.2.1 用户表

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  avatar_url TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

#### 4.2.2 用户问答表

**说明**：用户的所有问答统一存储在这张表中，工作记忆、情节记忆等都是对这张表的索引和分类。工作记忆通过按时间倒序获取前 n 条实现。

```sql
CREATE TABLE user_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  tokens INTEGER DEFAULT 0,
  keywords TEXT[], -- 切词结果，用于 BM25 检索
  embedding_id TEXT, -- 【存储：VectorDB】向量数据库中的 ID，用于向量召回
  metadata JSON,
  tags TEXT[],
  is_learning_memory BOOLEAN DEFAULT FALSE, -- 学习产生的记忆标识，不能返回给用户
  message_index INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, chat_id, message_index)
);

-- 时间倒序索引，用于工作记忆查询
CREATE INDEX idx_user_messages_time ON user_messages(user_id, chat_id, created_at DESC);

-- 关键词索引，用于 BM25 检索
CREATE INDEX idx_user_messages_keywords ON user_messages(user_id, keywords);

-- 学习记忆标识索引
CREATE INDEX idx_user_messages_learning ON user_messages(user_id, is_learning_memory);
```

**FTS5 全文索引（用于 BM25 检索）**：

```sql
CREATE VIRTUAL TABLE user_messages_fts USING fts5(
  message_id,
  content,
  keywords,
  tokenize='porter'
);

-- FTS5 触发器
CREATE TRIGGER user_messages_fts_insert AFTER INSERT ON user_messages
BEGIN
  INSERT INTO user_messages_fts(message_id, content, keywords)
  VALUES(new.id, new.content, json_group_array(new.keywords));
END;

CREATE TRIGGER user_messages_fts_update AFTER UPDATE ON user_messages
BEGIN
  UPDATE user_messages_fts SET content = new.content, keywords = json_group_array(new.keywords)
  WHERE message_id = old.id;
END;

CREATE TRIGGER user_messages_fts_delete AFTER DELETE ON user_messages
BEGIN
  DELETE FROM user_messages_fts WHERE message_id = old.id;
END;
```

#### 4.2.3 向量索引表

**说明**：向量数据存储在向量数据库中，此表用于关联用户问答表和向量数据库

```sql
CREATE TABLE vector_index (
  id TEXT PRIMARY KEY, -- 向量数据库中的 ID
  message_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  embedding BLOB, -- 【存储：VectorDB】实际向量数据
  similarity_threshold REAL DEFAULT 0.7,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (message_id) REFERENCES user_messages(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 4.2.4 语义记忆表

```sql
CREATE TABLE semantic_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  topic TEXT,
  related_topics TEXT[],
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (message_id) REFERENCES user_messages(id)
);
```

#### 4.2.5 程序记忆表

**说明**：Skill、MCP、Soul 作为一个类型，将 skill_id、work_id、mcp_id 合并为 tool_id，将问答 id 与 tool_id 作为联合主键进行存储

```sql
CREATE TABLE procedural_memory (
  message_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  tool_type TEXT NOT NULL, -- 'skill' | 'work' | 'mcp' | 'soul'
  user_id TEXT NOT NULL,
  matched_content TEXT,
  similarity_score REAL DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (message_id, tool_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (message_id) REFERENCES user_messages(id)
  -- 根据 tool_type 分别关联 skills、works、mcps、souls 表
);

-- 根据 tool_type 建立联合索引
CREATE INDEX idx_procedural_memory_type ON procedural_memory(user_id, tool_type);
```

#### 4.2.6 Tag 神经网络记忆表

```sql
CREATE TABLE tag_neural_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  message_id TEXT NOT NULL,
  relevance_score REAL DEFAULT 1.0,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (message_id) REFERENCES user_messages(id)
);
```

#### 4.2.7 Tag 关系图表

**说明**：Tag 连接建立和老化的功能加入到自学习的模块。老化规则为：
1. 最后激活时间超过 1 个月的立即老化
2. 最近一周激活次数小于 10 的激活次数正序排列前 10% 的连接老化掉

```sql
CREATE TABLE tag_graph_edges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_tag TEXT NOT NULL,
  to_tag TEXT NOT NULL,
  weight REAL DEFAULT 0.5,
  edge_type TEXT DEFAULT 'related', -- 'related' | 'hierarchical' | 'synonym'
  activation_count INTEGER DEFAULT 0, -- 节点被激活的次数
  last_activation_time INTEGER DEFAULT (strftime('%s', 'now')), -- 最后激活时间
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  is_active BOOLEAN DEFAULT TRUE, -- 是否活跃（未老化）
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 激活次数索引
CREATE INDEX idx_tag_graph_activation_count ON tag_graph_edges(user_id, activation_count);

-- 最后激活时间索引
CREATE INDEX idx_tag_graph_last_activation ON tag_graph_edges(user_id, last_activation_time);

-- 活跃状态索引
CREATE INDEX idx_tag_graph_active ON tag_graph_edges(user_id, is_active);
```

#### 4.2.8 Tag 节点激活事件表

**说明**：记录节点被激活的事件，用于统计激活次数和判断老化

```sql
CREATE TABLE tag_activation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  edge_id TEXT NOT NULL,
  from_tag TEXT NOT NULL,
  to_tag TEXT NOT NULL,
  activation_time INTEGER DEFAULT (strftime('%s', 'now')),
  trigger_type TEXT DEFAULT 'user_query', -- 'user_query' | 'learning' | 'system'
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (edge_id) REFERENCES tag_graph_edges(id)
);

-- 时间范围查询索引
CREATE INDEX idx_tag_activation_time ON tag_activation_events(user_id, activation_time);

-- 边ID索引
CREATE INDEX idx_tag_activation_edge ON tag_activation_events(edge_id);
```

**老化规则实现**：

```typescript
// 自学习模块中的 Tag 连接老化逻辑
interface TagGraphAgingService {
  ageOldEdges(userId: string): Promise<number>;
  ageLowActivationEdges(userId: string): Promise<number>;
  activateEdge(userId: string, fromTag: string, toTag: string): Promise<void>;
  createEdge(userId: string, fromTag: string, toTag: string, edgeType?: string): Promise<void>;
}

// 老化规则 1：最后激活时间超过 1 个月的立即老化
const ONE_MONTH_SECONDS = 30 * 24 * 60 * 60;

async function ageOldEdges(userId: string): Promise<number> {
  const cutoffTime = Date.now() / 1000 - ONE_MONTH_SECONDS;
  const result = await db.run(`
    UPDATE tag_graph_edges 
    SET is_active = FALSE 
    WHERE user_id = ? AND last_activation_time < ? AND is_active = TRUE
  `, [userId, cutoffTime]);
  return result.changes;
}

// 老化规则 2：最近一周激活次数小于 10 的激活次数正序排列前 10% 的连接老化掉
const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;

async function ageLowActivationEdges(userId: string): Promise<number> {
  const cutoffTime = Date.now() / 1000 - ONE_WEEK_SECONDS;
  
  // 获取最近一周激活次数小于 10 的边
  const lowActivationEdges = await db.all(`
    SELECT e.id, e.activation_count
    FROM tag_graph_edges e
    LEFT JOIN tag_activation_events ae ON e.id = ae.edge_id
    WHERE e.user_id = ? AND e.is_active = TRUE
    GROUP BY e.id
    HAVING COUNT(CASE WHEN ae.activation_time > ? THEN 1 END) < 10
    ORDER BY e.activation_count ASC
  `, [userId, cutoffTime]);
  
  // 计算前 10% 的数量
  const threshold = Math.ceil(lowActivationEdges.length * 0.1);
  const edgesToAge = lowActivationEdges.slice(0, threshold);
  
  // 执行老化
  for (const edge of edgesToAge) {
    await db.run(`
      UPDATE tag_graph_edges SET is_active = FALSE WHERE id = ?
    `, [edge.id]);
  }
  
  return edgesToAge.length;
}
```

#### 4.2.9 记忆比例配置表

```sql
CREATE TABLE memory_ratio_config (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  working_memory REAL DEFAULT 0.35,
  tag_neural_memory REAL DEFAULT 0.40, -- Tag 神经网络驱动
  semantic_memory REAL DEFAULT 0.15,
  episodic_memory REAL DEFAULT 0.15,
  procedural_memory REAL DEFAULT 0.10,
  random_memory REAL DEFAULT 0.20, -- 随机问题提取
  user_profile_memory REAL DEFAULT 0.05, -- 用户肖像比例
  knowledge_base_memory REAL DEFAULT 0.15, -- 本地知识库用户资料
  context_window_tokens INTEGER DEFAULT 8192,
  context_window_messages INTEGER DEFAULT 50,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id)
);
```

#### 4.2.10 记忆评估记录表

```sql
CREATE TABLE memory_evaluation (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  relevance_score REAL DEFAULT 0,
  usage_frequency INTEGER DEFAULT 0,
  reference_accuracy REAL DEFAULT 0,
  compression_rate REAL DEFAULT 0,
  overall_score REAL DEFAULT 0,
  evaluated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 4.2.11 Skill 表

```sql
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  config JSON,
  is_temporary BOOLEAN DEFAULT FALSE,
  is_installed BOOLEAN DEFAULT FALSE,
  effectiveness_score REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 4.2.12 MCP 表

```sql
CREATE TABLE mcps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  description TEXT,
  config JSON,
  is_temporary BOOLEAN DEFAULT FALSE,
  is_installed BOOLEAN DEFAULT FALSE,
  effectiveness_score REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 4.2.13 Soul 表

```sql
CREATE TABLE souls (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config JSON,
  is_temporary BOOLEAN DEFAULT FALSE,
  effectiveness_score REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id)
);
```

#### 4.2.14 Work 表

```sql
CREATE TABLE works (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  config JSON,
  is_temporary BOOLEAN DEFAULT FALSE,
  effectiveness_score REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 4.2.15 用户肖像表

```sql
CREATE TABLE user_portraits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  dimensions JSON,
  confidence REAL DEFAULT 0,
  last_updated INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id)
);
```

#### 4.2.16 系统配置表

```sql
CREATE TABLE system_config (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  category TEXT,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

#### 4.2.17 模型配置表

**说明**：存储用户已配置的模型记录，与模型商模型表分离。

```sql
CREATE TABLE user_model_config (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT '',
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL DEFAULT '',
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  supports_tools INTEGER NOT NULL DEFAULT 0,
  quota_tokens_per_day INTEGER NOT NULL DEFAULT 100000,
  quota_tokens_per_week INTEGER NOT NULL DEFAULT 5000000,
  quota_tokens_per_month INTEGER NOT NULL DEFAULT 22000000,
  quota_calls_per_day INTEGER NOT NULL DEFAULT 1000,
  quota_calls_per_week INTEGER NOT NULL DEFAULT 5000,
  quota_calls_per_month INTEGER NOT NULL DEFAULT 22000,
  is_default INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
```

#### 4.2.18 模型统计表

```sql
CREATE TABLE model_statistics (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  date TEXT NOT NULL,
  total_tokens INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  call_count INTEGER DEFAULT 0,
  avg_latency REAL DEFAULT 0,
  success_rate REAL DEFAULT 0,
  error_rate REAL DEFAULT 0,
  UNIQUE(model_id, date)
);
```

#### 4.2.19 系统运行指标表

```sql
CREATE TABLE system_metrics (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  daily_qa_count INTEGER DEFAULT 0,
  skill_reuse_rate REAL DEFAULT 0,
  mcp_reuse_rate REAL DEFAULT 0,
  work_reuse_rate REAL DEFAULT 0,
  soul_reuse_rate REAL DEFAULT 0,
  avg_qa_latency REAL DEFAULT 0,
  learning_volume INTEGER DEFAULT 0,
  agent_count INTEGER DEFAULT 0,
  agent_reuse_rate REAL DEFAULT 0,
  memory_hit_rates JSON,
  context_compression_rate REAL DEFAULT 0,
  self_learning_success_rate REAL DEFAULT 0,
  temporary_capability_promotion_rate REAL DEFAULT 0,
  UNIQUE(date)
);
```

#### 4.2.20 调用链路追踪表

**说明**：用于记录完整的调用链路，支持前端通过指定的问答 ID 进行可视化流程展示。数据保留时间为 7 天。

```sql
CREATE TABLE call_traces (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  user_id TEXT,
  message_id TEXT, -- 关联用户问答表，支持前端通过问答 ID 查询
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  duration INTEGER,
  user_input TEXT,
  intent TEXT,
  intent_confidence REAL,
  model_interactions JSON,
  capabilities_loaded JSON,
  dag JSON,
  agent_strategies JSON,
  self_calls JSON,
  final_output TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 问答ID索引，支持前端通过问答ID查询
CREATE INDEX idx_call_traces_message ON call_traces(message_id);

-- 用户ID索引
CREATE INDEX idx_call_traces_user ON call_traces(user_id);

-- 时间索引，用于7天数据清理
CREATE INDEX idx_call_traces_time ON call_traces(created_at);
```

#### 4.2.21 反馈表

```sql
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT NOT NULL, -- 'content' | 'strategy' | 'answer' | 'error'
  source TEXT NOT NULL, -- 'right_click' | 'button' | 'auto'
  rating TEXT, -- 'positive' | 'negative' | 'neutral'
  comment TEXT,
  metadata JSON,
  timestamp INTEGER DEFAULT (strftime('%s', 'now'))
);
```

***

## 五、接口设计

### 5.1 Access 层接口

#### 5.1.1 Chat 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/chat` | POST | 发送消息 |
| `/api/chat/history` | GET | 获取聊天历史 |
| `/api/chat/:id` | DELETE | 删除聊天记录 |
| `/api/chat/:id/messages` | GET | 获取单条聊天消息 |

**POST /api/chat**

请求参数：
```json
{
  "userId": "string",
  "message": "string",
  "chatId": "string (可选)",
  "metadata": "object (可选)"
}
```

响应参数：
```json
{
  "chatId": "string",
  "messageId": "string",
  "response": "string",
  "stream": "boolean",
  "traceId": "string"
}
```

实现描述：
1. 验证用户身份
2. 创建或获取聊天会话
3. 构建上下文（调用 InfoService）
4. 调用 ChatService 处理消息
5. 返回响应或建立 WebSocket 连接

#### 5.1.2 Gateway 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/gateway/wechat` | POST | 微信消息回调 |
| `/api/gateway/feishu` | POST | 飞书消息回调 |
| `/api/gateway/dingtalk` | POST | 钉钉消息回调 |

**POST /api/gateway/wechat**

请求参数：微信平台消息格式

响应参数：
```json
{
  "success": "boolean",
  "message": "string"
}
```

实现描述：
1. 验证平台签名
2. 解析消息格式
3. 转换为统一格式
4. 转发到 ChatService
5. 处理响应并回调

#### 5.1.3 Config 接口

**系统配置接口**：

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/config` | GET | 获取所有配置（含提供商列表，API Key 掩码） |
| `/api/config/migrate` | POST | 数据迁移 |

**模型提供商接口**：

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/config/provider` | POST | 添加模型提供商（默认不启用） |
| `/api/config/provider/:id` | PUT | 更新提供商配置（掩码 Key 不覆盖真实 Key） |
| `/api/config/provider/:id` | DELETE | 删除自定义提供商 / 重置默认提供商 |
| `/api/config/provider/:id/test` | POST | 测试提供商连接（先保存配置再测试） |
| `/api/config/provider/:id/fetch-models` | POST | 调用提供商 API 获取模型列表，更新模型商模型表 |
| `/api/config/provider/:id/models` | GET | 获取指定提供商的模型列表（从 DB 读取） |

**模型配置接口**（操作 `user_model_config` 表）：

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/config/model` | GET | 获取模型配置列表（支持 `?userId=` 参数） |
| `/api/config/model` | POST | 创建单个模型配置 |
| `/api/config/model/batch` | POST | 批量保存模型配置（事务内增删改） |
| `/api/config/model/:id` | PUT | 更新模型配置 |
| `/api/config/model/:id` | DELETE | 删除模型配置 |
| `/api/config/model/:id/default` | PUT | 设为默认模型配置 |
| `/api/config/model/:id/default` | DELETE | 取消默认模型配置 |

**其他能力接口**（LLM/MCP/Skill/Soul/Work）：

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/config/llm` | GET/POST | LLM 配置列表 / 创建 |
| `/api/config/llm/:id` | PUT/DELETE | LLM 配置更新 / 删除 |
| `/api/config/mcp` | GET | MCP 列表 |
| `/api/config/mcp/install` | POST | 安装 MCP |
| `/api/config/mcp/uninstall/:name` | POST | 卸载 MCP |
| `/api/config/mcp/:id` | PUT | 更新 MCP |
| `/api/config/skill` | GET/POST | Skill 列表 / 注册 |
| `/api/config/skill/:name` | DELETE | 注销 Skill |
| `/api/config/skill/:id` | PUT | 更新 Skill |
| `/api/config/soul` | GET/POST | Soul 列表 / 创建 |
| `/api/config/soul/:id` | PUT/DELETE | Soul 更新 / 删除 |
| `/api/config/work` | GET/POST | Work 列表 / 创建 |
| `/api/config/work/:id` | PUT/DELETE | Work 更新 / 删除 |
| `/api/config/verify/:providerId` | POST | 验证提供商（支持 `?model=` 参数） |

**POST /api/config/provider/:id/fetch-models（获取最新模型）**

请求参数：无（providerId 在路径中）

响应参数（成功）：
```json
{ "code": 200, "msg": "获取成功", "models": [...] }
```

响应参数（失败）：
```json
{ "code": 400, "msg": "获取失败", "content": "API Key 未配置或不可用（掩码值），请先保存真实的 API Key" }
```

**POST /api/config/model/batch（批量保存模型配置）**

请求参数：
```json
{
  "providerId": "volcengine",
  "userId": "default-user",
  "models": [
    {
      "modelId": "doubao-1.5-pro-32k",
      "modelName": "豆包 1.5 Pro 32K",
      "maxTokens": 32768,
      "supportsVision": false,
      "supportsTools": true,
      "quotaTokensPerDay": 100000,
      "quotaTokensPerWeek": 5000000,
      "quotaTokensPerMonth": 22000000,
      "quotaCallsPerDay": 1000,
      "quotaCallsPerWeek": 5000,
      "quotaCallsPerMonth": 22000
    }
  ]
}
```

#### 5.1.4 Statistic 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/stats/model` | GET | 获取模型统计 |
| `/api/stats/system` | GET | 获取系统指标 |
| `/api/stats/daily` | GET | 获取每日统计 |
| `/api/stats/reuse` | GET | 获取重用率统计 |

**GET /api/stats/model**

请求参数：
```json
{
  "modelId": "string (可选)",
  "timeRange": "string" // "today" | "week" | "month" | "year"
}
```

响应参数：
```json
{
  "modelId": "string",
  "totalTokens": "number",
  "inputTokens": "number",
  "outputTokens": "number",
  "callCount": "number",
  "avgLatency": "number",
  "successRate": "number",
  "errorRate": "number"
}
```

#### 5.1.5 Visual 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/visual/call-chain` | GET | 获取调用链路 |
| `/api/visual/dag` | GET | 获取 DAG 可视化 |
| `/api/visual/traces` | GET | 获取最近追踪 |

**GET /api/visual/call-chain**

请求参数：
```json
{
  "traceId": "string"
}
```

响应参数：
```json
{
  "traceId": "string",
  "startTime": "number",
  "endTime": "number",
  "duration": "number",
  "userInput": "string",
  "intentRecognition": { ... },
  "modelInteractions": [...],
  "capabilitiesLoaded": [...],
  "dag": { ... },
  "agentStrategies": [...],
  "selfCalls": [...],
  "finalOutput": "string"
}
```

#### 5.1.6 Feedback 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/feedback` | POST | 提交反馈 |
| `/api/feedback/list` | GET | 获取反馈列表 |
| `/api/feedback/stats` | GET | 获取反馈统计 |

**POST /api/feedback**

请求参数：
```json
{
  "type": "string", // "content" | "strategy" | "answer" | "error"
  "source": "string", // "right_click" | "button" | "auto"
  "rating": "string (可选)", // "positive" | "negative" | "neutral"
  "comment": "string (可选)",
  "metadata": {
    "traceId": "string (可选)",
    "agentId": "string (可选)",
    "logSnippet": "string (可选)",
    "operationPath": "array (可选)"
  }
}
```

实现描述：
1. 过滤敏感信息（不存储用户问答内容）
2. 存储到 feedback 表
3. 触发评估 Agent 分析

### 5.2 Core 层接口

#### 5.2.1 LLM 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/llm/models` | GET | 获取模型列表 |
| `/api/llm/models` | POST | 创建模型配置 |
| `/api/llm/models/:id` | GET | 获取模型配置 |
| `/api/llm/models/:id` | PUT | 更新模型配置 |
| `/api/llm/models/:id` | DELETE | 删除模型配置 |
| `/api/llm/chat` | POST | 调用模型聊天 |
| `/api/llm/embedding` | POST | 生成向量嵌入 |

#### 5.2.2 MCP 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/mcp/list` | GET | 获取 MCP 列表 |
| `/api/mcp/install` | POST | 安装 MCP |
| `/api/mcp/uninstall/:id` | POST | 卸载 MCP |
| `/api/mcp/:id` | GET | 获取 MCP 详情 |
| `/api/mcp/:id` | PUT | 更新 MCP |
| `/api/mcp/:id/execute` | POST | 执行 MCP |

#### 5.2.3 Skill 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/skill/list` | GET | 获取 Skill 列表 |
| `/api/skill/create` | POST | 创建 Skill |
| `/api/skill/:id` | GET | 获取 Skill 详情 |
| `/api/skill/:id` | PUT | 更新 Skill |
| `/api/skill/:id` | DELETE | 删除 Skill |
| `/api/skill/:id/install` | POST | 安装 Skill |
| `/api/skill/:id/uninstall` | POST | 卸载 Skill |
| `/api/skill/:id/execute` | POST | 执行 Skill |

#### 5.2.4 Soul 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/soul/get` | GET | 获取 Soul |
| `/api/soul/update` | PUT | 更新 Soul |
| `/api/soul/reset` | POST | 重置 Soul |

#### 5.2.5 Work 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/work/list` | GET | 获取 Work 列表 |
| `/api/work/create` | POST | 创建 Work |
| `/api/work/:id` | GET | 获取 Work 详情 |
| `/api/work/:id` | PUT | 更新 Work |
| `/api/work/:id` | DELETE | 删除 Work |

#### 5.2.6 Info 接口

| 接口 | 方法 | 功能描述 |
|------|------|----------|
| `/api/info/working` | GET | 获取工作记忆 |
| `/api/info/episodic` | GET | 获取情节记忆 |
| `/api/info/semantic` | GET | 获取语义记忆 |
| `/api/info/procedural` | GET | 获取程序记忆 |
| `/api/info/tag-neural` | GET | 获取 Tag 神经网络记忆 |
| `/api/info/random` | GET | 获取随机记忆 |
| `/api/info/ratio-config` | GET | 获取记忆比例配置 |
| `/api/info/ratio-config` | PUT | 更新记忆比例配置 |
| `/api/info/search` | GET | 统一检索 |

***

## 六、配置参数设计

### 6.1 配置参数表

所有配置参数存储在 `system_config` 表中：

#### 6.1.1 LLM 配置

| Key | Value | Description |
|-----|-------|-------------|
| `llm.default_model` | `openai-gpt4` | 默认模型 |
| `llm.model_priority` | `["openai-gpt4", "anthropic-claude", "google-gemini"]` | 模型优先级 |
| `llm.context_window_tokens` | `8192` | 上下文窗口 Token 数 |
| `llm.temperature` | `0.7` | 温度参数 |
| `llm.max_tokens` | `4096` | 最大输出 Token 数 |

#### 6.1.2 记忆配置

| Key | Value | Description |
|-----|-------|-------------|
| `memory.working_memory_ratio` | `0.35` | 工作记忆比例 |
| `memory.tag_neural_memory_ratio` | `0.20` | Tag 神经网络记忆比例 |
| `memory.semantic_memory_ratio` | `0.15` | 语义记忆比例 |
| `memory.episodic_memory_ratio` | `0.15` | 情节记忆比例 |
| `memory.procedural_memory_ratio` | `0.10` | 程序记忆比例 |
| `memory.random_memory_ratio` | `0.05` | 随机记忆比例 |
| `memory.bm25_k1` | `1.2` | BM25 k1 参数 |
| `memory.bm25_b` | `0.75` | BM25 b 参数 |
| `memory.bm25_min_score` | `0.8` | BM25 最小评分阈值 |
| `memory.vector_top_k` | `10` | 向量搜索 TopK |
| `memory.similarity_threshold` | `0.7` | 相似度阈值 |

#### 6.1.3 学习配置

| Key | Value | Description |
|-----|-------|-------------|
| `learning.batch_size` | `20` | 学习任务批大小 |
| `learning.source_tag_neural_ratio` | `0.50` | Tag 神经网络学习比例 |
| `learning.source_random_qa_ratio` | `0.30` | 随机问答学习比例 |
| `learning.source_hot_topics_ratio` | `0.05` | 网络热词学习比例 |
| `learning.source_industry_tag_ratio` | `0.10` | 行业 Tag 学习比例 |
| `learning.source_random_tag_ratio` | `0.05` | 随机 Tag 学习比例 |
| `learning.sliding_window_days` | `7` | 滑动窗口天数 |
| `learning.max_single_adjustment` | `0.00005` | 单次最大调整幅度 |

#### 6.1.4 策略配置

| Key | Value | Description |
|-----|-------|-------------|
| `strategy.default_level` | `application` | 默认策略层级 |
| `strategy.thinking_strategy` | `react` | 默认思考策略 |
| `strategy.max_task_depth` | `3` | 最大任务拆分深度 |
| `strategy.max_execution_time` | `30` | 单任务最大执行时间（秒） |

#### 6.1.5 系统配置

| Key | Value | Description |
|-----|-------|-------------|
| `system.port` | `8000` | 服务端口 |
| `system.host` | `127.0.0.1` | 服务地址 |
| `system.log_level` | `info` | 日志级别 |
| `system.data_path` | `./data` | 数据存储路径 |
| `system.trace_retention_days` | `1` | 追踪数据保留天数 |
| `system.statistics_retention_years` | `5` | 统计数据保留年数 |

### 6.2 配置初始化脚本

```sql
INSERT OR IGNORE INTO system_config (id, key, value, description, category) VALUES
('1', 'llm.default_model', '"openai-gpt4"', '默认模型', 'llm'),
('2', 'llm.model_priority', '["openai-gpt4","anthropic-claude","google-gemini"]', '模型优先级', 'llm'),
('3', 'llm.context_window_tokens', '8192', '上下文窗口Token数', 'llm'),
('4', 'llm.temperature', '0.7', '温度参数', 'llm'),
('5', 'llm.max_tokens', '4096', '最大输出Token数', 'llm'),
('6', 'memory.working_memory_ratio', '0.35', '工作记忆比例', 'memory'),
('7', 'memory.tag_neural_memory_ratio', '0.20', 'Tag神经网络记忆比例', 'memory'),
('8', 'memory.semantic_memory_ratio', '0.15', '语义记忆比例', 'memory'),
('9', 'memory.episodic_memory_ratio', '0.15', '情节记忆比例', 'memory'),
('10', 'memory.procedural_memory_ratio', '0.10', '程序记忆比例', 'memory'),
('11', 'memory.random_memory_ratio', '0.05', '随机记忆比例', 'memory'),
('12', 'memory.bm25_k1', '1.2', 'BM25 k1参数', 'memory'),
('13', 'memory.bm25_b', '0.75', 'BM25 b参数', 'memory'),
('14', 'memory.bm25_min_score', '0.8', 'BM25最小评分阈值', 'memory'),
('15', 'memory.vector_top_k', '10', '向量搜索TopK', 'memory'),
('16', 'memory.similarity_threshold', '0.7', '相似度阈值', 'memory'),
('17', 'learning.batch_size', '20', '学习任务批大小', 'learning'),
('18', 'learning.source_tag_neural_ratio', '0.50', 'Tag神经网络学习比例', 'learning'),
('19', 'learning.source_random_qa_ratio', '0.30', '随机问答学习比例', 'learning'),
('20', 'learning.source_hot_topics_ratio', '0.05', '网络热词学习比例', 'learning'),
('21', 'learning.source_industry_tag_ratio', '0.10', '行业Tag学习比例', 'learning'),
('22', 'learning.source_random_tag_ratio', '0.05', '随机Tag学习比例', 'learning'),
('23', 'learning.sliding_window_days', '7', '滑动窗口天数', 'learning'),
('24', 'learning.max_single_adjustment', '0.00005', '单次最大调整幅度', 'learning'),
('25', 'strategy.default_level', '"application"', '默认策略层级', 'strategy'),
('26', 'strategy.thinking_strategy', '"react"', '默认思考策略', 'strategy'),
('27', 'strategy.max_task_depth', '3', '最大任务拆分深度', 'strategy'),
('28', 'strategy.max_execution_time', '30', '单任务最大执行时间(秒)', 'strategy'),
('29', 'system.port', '8000', '服务端口', 'system'),
('30', 'system.host', '"127.0.0.1"', '服务地址', 'system'),
('31', 'system.log_level', '"info"', '日志级别', 'system'),
('32', 'system.data_path', '"./data"', '数据存储路径', 'system'),
('33', 'system.trace_retention_days', '1', '追踪数据保留天数', 'system'),
('34', 'system.statistics_retention_years', '5', '统计数据保留年数', 'system');
```

***

## 七、工作流程设计

### 7.1 用户 Chat/Gateway 任务流程

```
用户发送消息
    │
    ▼
┌──────────────────────┐
│ Access/Chat/Gateway  │  协议转换
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Application/Chat     │  获取用户肖像
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Core/Info            │  构建六层上下文
│ - 工作记忆 (35%)     │
│ - Tag神经网络 (20%)  │
│ - 语义记忆 (15%)     │
│ - 情节记忆 (15%)     │
│ - 程序记忆 (10%)     │
│ - 随机记忆 (5%)      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Solution/AgentPlan   │  任务分解与编排
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Strategy/Agent       │  Agent 执行
│ - PlannerAgent       │  生成 DAG
│ - WorkerAgent        │  执行子任务
│ - SynthesizerAgent   │  汇总结果
│ - EvaluatorAgent     │  评分调整
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Core/LLM             │  LLM 调用
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 更新记忆 + 肖像分析   │
│ - InfoService        │
│ - PortraitAgent      │
└──────────┬───────────┘
           │
           ▼
      返回响应
```

**详细流程说明**：

1. **协议转换**：Access 层接收用户消息，进行协议转换（WebSocket/HTTP/IM回调）
2. **获取肖像**：ChatService 调用 UserProfileService 获取用户肖像
3. **构建上下文**：InfoService 按比例获取六种记忆，拼接成上下文
4. **任务编排**：AgentPlan 分析任务复杂度，生成 DAG 图
5. **Agent 执行**：
   - PlannerAgent：生成 DAG
   - WorkerAgent：并行执行子任务（DAG + Pregel）
   - SynthesizerAgent：收集结果，生成 HTML，验证语法
   - EvaluatorAgent：评分，调整记忆比例
6. **LLM 调用**：工作 Agent 根据任务调用 LLM
7. **更新记忆**：将对话内容存入工作记忆，异步更新其他记忆
8. **肖像分析**：PortraitAgent 分析新对话，加权更新用户肖像
9. **返回响应**：返回给用户

### 7.2 自学习任务流程

```
定时/事件触发
    │
    ▼
┌──────────────────────┐
│ 选择学习内容         │  按来源比例选择
│ - Tag神经网络(50%)   │
│ - 随机问答(30%)      │
│ - 网络热词(5%)       │
│ - 行业Tag(10%)      │
│ - 随机Tag(5%)        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 产生学习任务         │  每批20个任务
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ AgentPlan 编排       │  生成学习任务 DAG
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ WorkerAgent 执行     │  执行学习任务
│ - 生成临时Skill/MCP  │
│ - 生成临时Work/Soul  │
│ - 临时安装执行        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ EvaluatorAgent 评分  │  滑动窗口7天
│ - 效果评分(1-10)     │
│ - 使用频率           │
│ - 综合得分           │
└──────────┬───────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
达标(得分≥阈值)  未达标
     │           │
     ▼           ▼
正式安装       释放临时资源
     │
     ▼
调用Manager保存
```

**详细流程说明**：

1. **触发机制**：定时任务（每日）或事件触发（对话完成）
2. **内容选择**：按比例从五个来源选择学习内容
3. **任务生成**：每批生成 20 个学习任务，按来源比例分配
4. **任务编排**：AgentPlan 将学习任务编排为 DAG
5. **执行学习**：WorkerAgent 执行任务，生成临时能力组件
6. **评分评估**：EvaluatorAgent 使用滑动窗口（7天）评分
7. **结果处理**：达标则正式安装，未达标则释放临时资源
8. **保存安装**：调用 Core 层 Manager 保存正式能力

### 7.3 用户画像任务流程

```
新对话触发
    │
    ▼
┌──────────────────────┐
│ PortraitAgent 分析   │  独立 Agent
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 提取特征维度         │  动态维度识别
│ - 基础属性           │
│ - 兴趣领域           │
│ - 行为模式           │
│ - 偏好设置           │
│ - 技能偏好           │
│ - 对话风格           │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 加权收敛计算         │  EWMA算法
│ newWeight = α×new   │  α=0.3
│           +(1-α)×old│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 更新用户肖像         │  存储到 user_portraits 表
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 更新维度置信度       │  置信度=min(1, 当前+0.05)
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 扩展/收缩维度        │  根据数据丰富度动态调整
└──────────────────────┘
```

**详细流程说明**：

1. **触发时机**：每次新对话完成后触发
2. **独立分析**：PortraitAgent 独立于对话流程进行分析
3. **维度提取**：从对话内容中提取动态维度特征
4. **加权收敛**：使用 EWMA 算法，新数据权重 0.3，保证肖像收敛
5. **存储更新**：更新 user_portraits 表中的 dimensions 字段
6. **置信度更新**：每次更新增加 0.05，最大为 1
7. **维度调整**：根据数据丰富度动态扩展或收缩维度

### 7.4 Skill/MCP/Work/Soul 生成流程

```
学习模块选择内容
    │
    ▼
┌──────────────────────┐
│ 产生任务交给AgentPlan│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ WorkerAgent 执行     │  分析任务需求
│ - 选择/生成能力       │  生成临时能力
│ - 临时安装执行        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 提交评价             │  任务上下文+结果+临时能力
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ EvaluatorAgent 评分  │
│ - 效果评分(1-10)×60% │
│ - 使用频率×40%       │
│ - 综合得分计算        │
└──────────┬───────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
达标(≥阈值)     未达标
     │           │
     ▼           ▼
正式安装       释放资源
     │
     ▼
调用Manager保存
│
├── SkillManager.createSkill()
├── MCPManager.installMCP()
├── SoulManager.updateSoul()
└── WorkManager.createWork()
```

**详细流程说明**：

1. **学习触发**：学习模块根据 Info 信息选择要学习的内容
2. **任务编排**：产生任务交给 AgentPlan 进行编排
3. **能力选择/生成**：WorkerAgent 分析任务，选择已有能力或生成临时能力
4. **临时安装**：临时能力组件临时安装并执行
5. **评价提交**：将任务上下文、执行结果、临时能力提交给评价 Agent
6. **综合评分**：
   - 效果评分（1-10）占 60%
   - 使用频率占 40%
   - 综合得分 = 效果×0.6 + 频率×权重
7. **结果处理**：达标则正式安装，未达标则释放临时资源
8. **保存安装**：调用对应 Manager 的 CRUD 方法保存

***

## 八、总结

本 PRD 文档详细描述了 Brian Agent 后端系统的设计方案，包括：

1. **六层架构**：Access、Application、Solution、Strategy、Core、Base
2. **四类 Agent**：规划 Agent、工作 Agent、结果汇总 Agent、评估 Agent
3. **六层记忆模型**：工作记忆、Tag 神经网络、语义记忆、情节记忆、程序记忆、随机记忆
4. **完整的数据库设计**：21 张核心表，包含存储组件映射
5. **详细的接口设计**：6 大类接口，包含请求/响应参数和实现描述
6. **配置参数表**：5 大类配置，包含具体值和初始化脚本
7. **四个核心流程图**：用户 Chat、自学习、用户画像、能力生成

系统设计遵循模块化、可替换、可扩展的原则，支持多模型调用、动态记忆比例调整、自学习等核心能力。