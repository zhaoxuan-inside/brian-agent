# Brian-Agent 前端对接集成检查清单

> 版本：1.0.0  
> 最后更新：2026-07-14  
> 基于后端 API 技术文档生成

---

## 目录

1. [基础设施层](#1-基础设施层)
2. [API 模块对接](#2-api-模块对接)
3. [SSE 流式对话](#3-sse-流式对话)
4. [WebSocket 实时通信](#4-websocket-实时通信)
5. [错误处理与异常](#5-错误处理与异常)
6. [数据类型与接口契约](#6-数据类型与接口契约)
7. [安全与性能](#7-安全与性能)
8. [测试与验证](#8-测试与验证)

---

## 1. 基础设施层

### 1.1 基础配置

**环境配置**:
- [ ] 开发环境: `http://localhost:3000/api`
- [ ] 测试环境: 配置对应测试环境 URL
- [ ] 生产环境: 配置对应生产环境 URL（建议使用 HTTPS）
- [ ] 通过环境变量管理基础 URL，避免硬编码

**基础配置**:
- [ ] 配置基础 URL: `http://localhost:3000/api`
- [ ] 设置 `Content-Type: application/json` 请求头
- [ ] 处理请求体大小限制（10MB）
- [ ] 配置 CORS 跨域支持
- [ ] 设置 `X-Trace-Id` 请求头（可选，后端自动生成）
- [ ] 捕获响应头中的 `X-Trace-Id` 用于调试和错误报告
- [ ] 将 `X-Trace-Id` 传递到反馈接口的 `logTraceId` 字段

### 1.2 HTTP 客户端封装

- [ ] 封装统一的 HTTP 请求工具（axios/fetch）
- [ ] 配置请求拦截器（添加公共请求头）
- [ ] 配置响应拦截器（统一错误处理）
- [ ] 支持请求超时配置
- [ ] 支持请求取消/中断

### 1.3 限流处理

- [ ] 处理 429 状态码（请求频率超限）
- [ ] 读取限流响应头（`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`）
- [ ] 实现自动重试机制（基于 `retryAfter` 字段）
- [ ] 前端限流提示 UI

---

## 2. API 模块对接

### 2.1 健康检查

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/health` | GET | [ ] | 服务健康检查 |

### 2.2 对话模块 (`/api/chat`)

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/chat` | POST | [ ] | 非流式对话 |
| `/api/chat/stream` | POST | [ ] | 流式对话（SSE） |
| `/api/chat/chain/:messageId` | GET | [ ] | 获取消息链 |

**非流式对话请求参数**:
- [ ] `message`: string（必需）
- [ ] `conversationId`: string（可选）
- [ ] `modelId`: string（可选）
- [ ] `temperature`: number（可选，0-2）
- [ ] `maxTokens`: number（可选）

**响应字段**:
- [ ] `conversationId`, `message`, `analysis`, `usage`, `latencyMs`

### 2.3 记忆模块 (`/api/memory`)

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/memory` | GET | [ ] | 获取记忆列表 |
| `/api/memory/tags` | GET | [ ] | 获取所有标签 |
| `/api/memory/tag-graph` | GET | [ ] | 获取标签图谱 |
| `/api/memory/by-tag/:tag` | GET | [ ] | 按标签获取记忆 |
| `/api/memory/groups` | GET | [ ] | 获取记忆分组 |
| `/api/memory/organize` | POST | [ ] | 整理记忆 |
| `/api/memory/:id` | DELETE | [ ] | 删除记忆 |
| `/api/memory/pin/:id` | POST | [ ] | 固定/取消固定记忆 |

**记忆查询参数**:
- [ ] `query`: string（搜索关键词）
- [ ] `maxResults`: number（默认10）
- [ ] `tag`: string（按标签筛选）
- [ ] `start`: number（开始时间戳）
- [ ] `end`: number（结束时间戳）

### 2.4 配置模块 (`/api/config`)

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/config` | GET | [ ] | 获取配置 |
| `/api/config` | PUT | [ ] | 更新配置 |
| `/api/config/provider` | POST | [ ] | 添加模型提供商 |
| `/api/config/provider/:id` | PUT | [ ] | 更新提供商 |
| `/api/config/provider/:id` | DELETE | [ ] | 删除提供商 |
| `/api/config/model` | POST | [ ] | 添加模型 |
| `/api/config/model/:id` | PUT | [ ] | 更新模型 |
| `/api/config/model/:id` | DELETE | [ ] | 删除模型（需 `providerId` 查询参数） |
| `/api/config/verify/:providerId` | POST | [ ] | 验证提供商连接 |
| `/api/config/quota/:providerId` | GET | [ ] | 获取配额信息 |

### 2.5 技能模块 (`/api/skill`)

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/skill` | GET | [ ] | 列出技能 |
| `/api/skill/:id` | GET | [ ] | 获取技能详情 |
| `/api/skill/create` | POST | [ ] | 创建技能 |
| `/api/skill/:id` | PUT | [ ] | 更新技能 |
| `/api/skill/:id` | DELETE | [ ] | 删除技能 |
| `/api/skill/:id/toggle` | POST | [ ] | 切换技能状态 |
| `/api/skill/:id/preview` | POST | [ ] | 预览技能规格 |
| `/api/skill/:id/review` | POST | [ ] | 审核技能 |

### 2.6 智能体模块 (`/api/agent`)

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/agent` | GET | [ ] | 列出智能体 |
| `/api/agent/models` | GET | [ ] | 获取可用模型 |
| `/api/agent/:id` | GET | [ ] | 获取智能体详情 |
| `/api/agent/create` | POST | [ ] | 创建智能体 |
| `/api/agent/:id` | PUT | [ ] | 更新智能体 |
| `/api/agent/:id` | DELETE | [ ] | 删除智能体 |
| `/api/agent/:id/toggle` | POST | [ ] | 切换智能体状态 |
| `/api/agent/generate-prompt` | POST | [ ] | 生成系统提示词 |
| `/api/agent/generate-soul` | POST | [ ] | 生成灵魂配置 |
| `/api/agent/suggest-skills` | POST | [ ] | 推荐技能 |
| `/api/agent/suggest-mcps` | POST | [ ] | 推荐MCP包 |

### 2.7 反馈模块 (`/api/feedback`)

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/feedback` | POST | [ ] | 提交反馈 |
| `/api/feedback/list` | GET | [ ] | 列出反馈 |
| `/api/feedback/stats` | GET | [ ] | 获取反馈统计 |
| `/api/feedback/:id` | GET | [ ] | 获取反馈详情 |
| `/api/feedback/:id/status` | PUT | [ ] | 更新反馈状态 |

**反馈提交参数**:
- [ ] `messageId`: string（必需）
- [ ] `conversationId`: string（必需）
- [ ] `userId`: string（必需）
- [ ] `rating`: 'good' | 'neutral' | 'bad'（必需）
- [ ] `reason`: string（可选）
- [ ] `errorInfo`: object（可选）
- [ ] `includeContext`: boolean（可选）
- [ ] `logTraceId`: string（可选）

### 2.8 统计模块 (`/api/stats`)

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/stats` | GET | [ ] | 获取系统统计 |

### 2.9 库管理模块 (`/api/library`)

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/library/paths` | GET | [ ] | 列出库路径 |
| `/api/library/paths` | POST | [ ] | 添加库路径 |
| `/api/library/paths/:id` | DELETE | [ ] | 删除库路径 |
| `/api/library/check-path` | POST | [ ] | 检查路径 |

### 2.10 MCP 模块 (`/api/mcp`)

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/mcp/market` | GET | [ ] | 获取MCP市场 |
| `/api/mcp/market/sync` | POST | [ ] | 同步MCP市场 |
| `/api/mcp/market/:id` | GET | [ ] | 获取MCP包详情 |
| `/api/mcp/market/:id` | POST | [ ] | 安装MCP包 |
| `/api/mcp/market/:id` | DELETE | [ ] | 卸载MCP包 |
| `/api/mcp/installed` | GET | [ ] | 获取已安装MCP包 |

### 2.11 学习模块 (`/api/learning`)

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/learning/queue` | GET | [ ] | 获取学习队列 |
| `/api/learning/queue/stats` | GET | [ ] | 获取队列统计 |
| `/api/learning/queue/:id/priority` | PUT | [ ] | 更新优先级 |
| `/api/learning/queue/:id/skip` | PUT | [ ] | 跳过学习项 |
| `/api/learning/queue/batch-approve` | POST | [ ] | 批量批准 |
| `/api/learning/batches` | GET | [ ] | 获取学习批次 |
| `/api/learning/plans` | POST | [ ] | 创建学习计划 |
| `/api/learning/plans/:id/next-phase` | GET | [ ] | 获取下一阶段 |
| `/api/learning/plans/:id/complete-phase` | POST | [ ] | 完成阶段 |
| `/api/learning/progress` | GET | [ ] | 获取学习进度 |
| `/api/learning/knowledge` | GET | [ ] | 获取已学知识 |
| `/api/learning/knowledge/graph` | GET | [ ] | 获取知识图谱 |
| `/api/learning/insights` | GET | [ ] | 获取洞察 |
| `/api/learning/is-idle` | GET | [ ] | 检查空闲状态 |
| `/api/learning/schedule` | POST | [ ] | 调度学习 |
| `/api/learning/starvation` | GET | [ ] | 检查学习饥饿 |
| `/api/learning/rebalance` | POST | [ ] | 重新平衡 |

---

## 3. SSE 流式对话

### 3.1 连接实现

- [ ] 使用 `fetch` API（非 `EventSource`）
- [ ] 设置 `Accept: text/event-stream` 请求头
- [ ] 配置请求超时处理
- [ ] 实现连接中断重连机制

### 3.2 SSE 事件处理

| 事件类型 | 处理逻辑 | 状态 |
|----------|----------|------|
| `start` | 记录 `conversationId` 和 `messageId` | [ ] |
| `analysis` | 展示意图分析结果（`intent`, `complexity`, `domain`, `requiredCapabilities`） | [ ] |
| `delta` | 增量追加内容到 UI | [ ] |
| `done` | 结束流式响应，显示使用量统计 | [ ] |
| `error` | 显示错误信息，关闭连接 | [ ] |

### 3.3 SSE 数据结构

**`analysis` 事件**:
- [ ] `intent`: string（意图类型）
- [ ] `complexity`: number（0-1）
- [ ] `domain`: string（领域）
- [ ] `requiredCapabilities`: string[]（所需能力）

**`done` 事件**:
- [ ] `messageId`: string
- [ ] `conversationId`: string
- [ ] `usage`: LLMUsage（令牌使用统计）

---

## 4. WebSocket 实时通信

### 4.1 连接配置

- [ ] 连接地址: `ws://localhost:3000/ws`
- [ ] 处理连接状态变化（open, close, error）
- [ ] 实现连接重连机制
- [ ] 处理网络中断自动重连

### 4.2 消息格式

- [ ] 发送消息格式: `{ type, payload, timestamp }`
- [ ] 接收消息解析: JSON.parse
- [ ] 处理 `connected` 事件（获取 `clientId`）

### 4.3 注意事项

- [ ] 服务器仅在连接时发送 `connected` 事件
- [ ] 客户端消息会被服务器记录但不返回响应
- [ ] 如需双向通信，使用 HTTP API 或 SSE

---

## 5. 错误处理与异常

### 5.1 统一错误格式

- [ ] 所有错误响应包含 `error` 和 `code` 字段
- [ ] 实现全局错误处理组件
- [ ] 根据错误码显示不同提示

### 5.2 常见错误码处理

| 错误码 | HTTP状态 | 处理方式 | 状态 |
|--------|----------|----------|------|
| `VALIDATION_ERROR` | 400 | 表单验证失败提示 | [ ] |
| `INVALID_MESSAGE` | 400 | 无效消息内容提示 | [ ] |
| `NOT_FOUND` | 404 | 资源未找到提示 | [ ] |
| `DUPLICATE_PROVIDER` | 409 | 提供商已存在提示 | [ ] |
| `DUPLICATE_MODEL` | 409 | 模型已存在提示 | [ ] |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限，显示重试倒计时 | [ ] |
| `CHAT_ERROR` | 500 | 对话错误提示 | [ ] |
| `MEMORY_ERROR` | 500 | 记忆模块错误提示 | [ ] |
| `CONFIG_ERROR` | 500 | 配置错误提示 | [ ] |
| `SKILL_CREATE_ERROR` | 500 | 技能创建错误提示 | [ ] |
| `AGENT_CREATE_ERROR` | 500 | 智能体创建错误提示 | [ ] |
| `FEEDBACK_CREATE_ERROR` | 500 | 反馈创建错误提示 | [ ] |
| `MCP_INSTALL_ERROR` | 500 | MCP安装错误提示 | [ ] |
| `INTERNAL_ERROR` | 500 | 内部服务器错误提示 | [ ] |

### 5.3 网络异常处理

- [ ] 处理网络请求超时
- [ ] 处理断网重连
- [ ] 处理请求取消
- [ ] 显示加载状态和错误状态

---

## 6. 数据类型与接口契约

### 6.1 核心类型定义

- [ ] `MemoryType`: 'episodic' | 'semantic' | 'procedural'
- [ ] `TagDimension`: 'domain' | 'industry' | 'concept' | 'action' | 'sentiment'
- [ ] `FeedbackRating`: 'good' | 'neutral' | 'bad'
- [ ] `FeedbackStatus`: 'pending' | 'reviewed' | 'resolved' | 'dismissed'
- [ ] `StrategyType`: 'react' | 'plan-execute' | 'cot' | 'conditional-graph' | 'hybrid'

### 6.2 标签集合 (`TagSet`)

- [ ] `domain`: string[]
- [ ] `industry`: string[]
- [ ] `concept`: string[]
- [ ] `action`: string[]
- [ ] `sentiment`: string

### 6.3 统一记忆项 (`UnifiedMemoryItem`)

- [ ] `id`: string
- [ ] `type`: MemoryType
- [ ] `rawContent`: string
- [ ] `summary`: string
- [ ] `semanticFingerprint`: string
- [ ] `role`: 'user' | 'assistant' | 'system' | 'agent'
- [ ] `tags`: TagSet
- [ ] `accessHistory`: { timestamp, context, score }[]
- [ ] `createdAt`: number
- [ ] `lastAccessedAt`: number
- [ ] `temporalDecay`: number
- [ ] `relatedMemories`: { memoryId, relation, weight }[]

### 6.4 模型提供商 (`ModelProvider`)

- [ ] `id`: string
- [ ] `name`: string
- [ ] `type`: 'openai-compatible' | 'anthropic' | 'google' | 'custom'
- [ ] `baseUrl`: string
- [ ] `apiKey`: string（已脱敏）
- [ ] `models`: ModelConfig[]
- [ ] `enabled`: boolean

---

## 7. 安全与性能

### 7.1 请求安全

- [ ] 避免敏感信息在 URL 中传递
- [ ] API Key 在响应中已脱敏（`••••••••sk-xxx`）
- [ ] 配置 HTTPS（生产环境）

### 7.2 性能优化

- [ ] 实现请求缓存策略
- [ ] 分页加载（如记忆列表、技能列表）
- [ ] 请求防抖（搜索等高频操作）
- [ ] SSE 连接复用
- [ ] 图片/资源懒加载

### 7.3 用户体验

- [ ] 请求加载状态指示
- [ ] 响应时间显示
- [ ] 错误提示友好
- [ ] 操作成功反馈

---

## 8. 测试与验证

### 8.1 接口测试

- [ ] 所有接口正常返回（200/201）
- [ ] 参数验证（必填项、格式校验）
- [ ] 错误响应格式正确
- [ ] 限流策略生效（429）

### 8.2 SSE 测试

- [ ] 流式对话正常连接
- [ ] `start` 事件正常接收
- [ ] `analysis` 事件正常接收
- [ ] `delta` 事件正常接收（增量内容）
- [ ] `done` 事件正常接收
- [ ] `error` 事件正常处理
- [ ] 连接中断重连正常

### 8.3 WebSocket 测试

- [ ] 连接成功（`connected` 事件）
- [ ] `clientId` 正常获取
- [ ] 连接状态变化处理
- [ ] 网络中断重连

### 8.4 集成测试

- [ ] 对话流程完整（非流式）
- [ ] 对话流程完整（流式）
- [ ] 记忆管理流程
- [ ] 智能体创建与管理
- [ ] 技能创建与审核
- [ ] 反馈提交流程

---

## 检查清单使用说明

### 使用方法

1. 将此清单分发给前端开发团队
2. 每个模块负责人勾选已完成的项
3. 定期（如每日站会）更新进度
4. 完成所有勾选后进行集成测试

### 状态标记

- `[ ]` - 未开始
- `[x]` - 已完成
- `[~]` - 进行中
- `[!]` - 有问题/阻塞

### 优先级说明

- **高优先级**：对话模块（流式/非流式）、配置模块
- **中优先级**：记忆模块、智能体模块、技能模块
- **低优先级**：统计模块、库管理模块、MCP模块（按需）

---

> **备注**: 此清单基于 [backend-api.md](backend-api.md) 生成，如有接口变更请同步更新此清单。
