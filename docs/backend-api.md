# Brian-Agent 后端 API 技术文档

> 版本：2.0.0  
> 最后更新：2026-07-14  
> 用于指导前端对接开发

---

## 1. 概述

Brian-Agent 是一个基于 Express 的 Node.js 后端服务，提供 AI 对话、记忆管理、技能管理、配置管理等核心功能。

### 1.1 基础信息

| 属性 | 值 |
|------|-----|
| **基础 URL** | `http://localhost:3000/api` |
| **协议** | HTTP/HTTPS |
| **内容类型** | `application/json` |
| **请求体大小限制** | 10MB |

### 1.2 技术栈

- **框架**: Express 4.x
- **运行时**: Node.js 20+
- **数据库**: SQLite + Graph Database (LevelDB/TinyGraphDB)
- **SSE**: Server-Sent Events
- **WebSocket**: `/ws`

---

## 2. 请求头规范

### 2.1 必需请求头

| 头名称 | 类型 | 说明 |
|--------|------|------|
| `Content-Type` | string | `application/json` |
| `X-Trace-Id` | string | 追踪ID（可选，后端自动生成） |

### 2.2 响应头

| 头名称 | 说明 |
|--------|------|
| `X-Trace-Id` | 本次请求的追踪ID |
| `X-RateLimit-Limit` | 限流上限 |
| `X-RateLimit-Remaining` | 剩余请求次数 |
| `X-RateLimit-Reset` | 重置时间戳（秒） |

---

## 3. 限流策略

后端采用 IP 级别的限流策略：

| 限制项 | 值 |
|--------|-----|
| **请求频率** | 200次/分钟 |
| **超出处理** | 返回 429 状态码 |

**限流响应示例**:
```json
{
  "error": "Too many requests. Please try again later.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 30
}
```

---

## 4. SSE 协议

### 4.1 流式对话端点

**URL**: `POST /api/chat/stream`

### 4.2 SSE 事件类型

| 事件名 | 说明 | 数据结构 |
|--------|------|----------|
| `start` | 连接建立 | `{ conversationId: string, messageId: string }` |
| `analysis` | 任务分析结果 | `{ intent: string, complexity: number, domain: string, requiredCapabilities: string[] }` |
| `delta` | 响应内容片段 | `{ content: string }` |
| `done` | 响应完成 | `{ messageId: string, conversationId: string, usage: LLMUsage }` |
| `error` | 错误发生 | `{ error: string }` |

**`analysis` 事件字段说明**:
- `intent`: 意图类型，如 `general`, `debugging`, `code_generation`, `explanation`, `analysis`, `creation`, `search`, `summarization`, `transformation`, `planning`
- `complexity`: 复杂度评分，范围 0-1，越高越复杂
- `domain`: 领域，如 `general`, `frontend`, `backend`, `data_science`, `devops`, `security`, `mobile`
- `requiredCapabilities`: 所需能力列表，如 `code_generation`, `search`, `analysis`

### 4.3 SSE 客户端示例

> **注意**：由于流式对话接口为 `POST` 请求且需要发送请求体，不能使用标准的 `EventSource` API（仅支持 GET），需使用 `fetch` API 配合 ReadableStream。

```javascript
async function streamChat(message, conversationId = null) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      conversationId,
      // 可选参数
      // modelId: 'gpt-4o',
      // temperature: 0.7,
      // maxTokens: 4096
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // 处理 SSE 格式：event: xxx\ndata: xxx\n\n
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const eventStr of events) {
      if (!eventStr.trim()) continue;

      const lines = eventStr.split('\n');
      let eventType = 'message';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          eventData = line.substring(5).trim();
        }
      }

      try {
        const data = JSON.parse(eventData);
        handleSSEEvent(eventType, data);
      } catch (e) {
        console.warn('Failed to parse SSE data:', eventData);
      }
    }
  }
}

function handleSSEEvent(type, data) {
  switch (type) {
    case 'start':
      console.log('对话开始:', data.conversationId, data.messageId);
      break;
    case 'analysis':
      console.log('任务分析:', data.intent, data.complexity);
      break;
    case 'delta':
      console.log('收到内容:', data.content);
      break;
    case 'done':
      console.log('对话完成:', data.usage);
      break;
    case 'error':
      console.error('对话错误:', data.error);
      break;
    default:
      console.log('未知事件:', type, data);
  }
}

// 使用示例
streamChat('Hello, Brian!');
```

---

## 5. WebSocket

### 5.1 连接地址

```
ws://localhost:3000/ws
```

### 5.2 消息格式

```json
{
  "type": "string",
  "payload": {},
  "timestamp": 1234567890
}
```

### 5.3 事件类型

| 类型 | 说明 |
|------|------|
| `connected` | 连接成功，返回 `{ clientId }` |

> **注意**：当前后端仅在连接建立时发送 `connected` 事件，客户端发送的消息会被服务器记录日志但不会返回响应。如需双向通信，请使用 HTTP API 或 SSE 接口。

---

## 6. API 端点参考

### 6.1 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 服务健康检查 |

**响应**:
```json
{
  "status": "ok",
  "timestamp": "2026-07-14T06:00:00.000Z",
  "version": "2.0.0",
  "uptime": 3600
}
```

---

### 6.2 对话模块 (`/api/chat`)

#### POST /api/chat - 非流式对话

**请求体**:
```json
{
  "message": "string",        // 必需，用户消息内容
  "conversationId": "string", // 可选，会话ID，不传则自动生成
  "modelId": "string",        // 可选，模型ID
  "temperature": 0.7,         // 可选，温度参数 0-2
  "maxTokens": 4096           // 可选，最大令牌数
}
```

**成功响应** (200):
```json
{
  "conversationId": "uuid",
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "string"
  },
  "analysis": {
    "intent": "string",
    "complexity": "low|medium|high",
    "tags": ["tag1", "tag2"]
  },
  "usage": {
    "promptTokens": 100,
    "completionTokens": 200,
    "totalTokens": 300
  },
  "latencyMs": 1500
}
```

#### POST /api/chat/stream - 流式对话

**请求体**: 同非流式对话

**响应**: SSE 流（见第 4 节）

#### GET /api/chat/chain/:messageId - 获取消息链

**路径参数**:
- `messageId`: string - 消息ID

**成功响应** (200):
```json
{
  "messageId": "uuid",
  "chain": [
    {
      "id": "uuid",
      "type": "agent|memory",
      "content": "..."
    }
  ]
}
```

---

### 6.3 记忆模块 (`/api/memory`)

#### GET /api/memory - 获取记忆

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | string | 搜索关键词 |
| `maxResults` | number | 最大返回数量（默认10） |
| `tag` | string | 按标签筛选 |
| `start` | number | 开始时间戳 |
| `end` | number | 结束时间戳 |

**成功响应** (200):
```json
{
  "memories": [
    {
      "id": "uuid",
      "type": "episodic|semantic|procedural",
      "rawContent": "string",
      "summary": "string",
      "tags": {
        "domain": ["tag1"],
        "industry": ["tag2"],
        "concept": ["tag3"],
        "action": ["tag4"],
        "sentiment": "positive|neutral|negative"
      },
      "createdAt": 1234567890,
      "lastAccessedAt": 1234567890
    }
  ],
  "count": 5
}
```

#### GET /api/memory/tags - 获取所有标签

**成功响应** (200):
```json
{
  "tags": ["domain:frontend", "industry:healthcare", "concept:architecture"],
  "count": 100
}
```

#### GET /api/memory/tag-graph - 获取标签图谱

**成功响应** (200):
```json
{
  "nodes": [
    { "id": "tag1", "name": "tag1", "weight": 10, "degree": 5 }
  ],
  "edges": [
    { "source": "tag1", "target": "tag2", "weight": 3, "label": "3 co-occurrences" }
  ]
}
```

#### GET /api/memory/by-tag/:tag - 按标签获取记忆

**路径参数**:
- `tag`: string - 标签名

**成功响应** (200):
```json
{ "memories": [...], "count": 5 }
```

#### GET /api/memory/groups - 获取记忆分组

**成功响应** (200):
```json
{
  "groups": {
    "episodic": [...],
    "semantic": [...],
    "procedural": [...]
  },
  "counts": {
    "episodic": 10,
    "semantic": 5,
    "procedural": 3
  }
}
```

#### POST /api/memory/organize - 整理记忆

**请求体**:
```json
{
  "conversationId": "string"  // 可选，会话ID
}
```

**成功响应** (200):
```json
{ "success": true, "message": "Memories organized successfully" }
```

#### DELETE /api/memory/:id - 删除记忆

**路径参数**:
- `id`: string - 记忆ID

**成功响应** (200):
```json
{ "success": true }
```

#### POST /api/memory/pin/:id - 固定/取消固定记忆

**路径参数**:
- `id`: string - 记忆ID

**请求体**:
```json
{
  "pinned": true  // true=固定，false=取消固定
}
```

**成功响应** (200):
```json
{ "success": true, "pinned": true }
```

---

### 6.4 配置模块 (`/api/config`)

#### GET /api/config - 获取配置

**成功响应** (200):
```json
{
  "selectedProviderId": "openai",
  "selectedModelId": "gpt-4o",
  "temperature": 0.7,
  "maxTokens": 4096,
  "rateLimits": {
    "daily": 100000,
    "weekly": 500000,
    "monthly": 2000000
  },
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "type": "openai-compatible",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "••••••••sk-xxx",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "maxTokens": 128000,
          "supportsVision": true,
          "supportsTools": true
        }
      ],
      "enabled": true
    }
  ]
}
```

#### PUT /api/config - 更新配置

**请求体**:
```json
{
  "selectedProviderId": "string",  // 可选
  "selectedModelId": "string",     // 可选
  "temperature": 0.7,              // 可选
  "maxTokens": 4096,               // 可选
  "rateLimits": {                  // 可选
    "daily": 100000,
    "weekly": 500000,
    "monthly": 2000000
  }
}
```

**成功响应** (200): 返回更新后的完整配置

#### POST /api/config/provider - 添加模型提供商

**请求体**:
```json
{
  "id": "string",           // 必需，唯一标识
  "name": "string",         // 必需，显示名称
  "type": "openai-compatible|anthropic|google|custom",  // 必需
  "baseUrl": "string",      // 可选，API地址
  "apiKey": "string",       // 可选，API密钥
  "models": [               // 可选，模型列表
    {
      "id": "string",
      "name": "string",
      "maxTokens": 4096,
      "supportsVision": false,
      "supportsTools": true
    }
  ]
}
```

**成功响应** (201): 返回新建的提供商（API Key 已脱敏）

#### PUT /api/config/provider/:id - 更新提供商

**路径参数**:
- `id`: string - 提供商ID

**请求体**: 同添加提供商（字段均为可选）

**成功响应** (200): 返回更新后的提供商

#### DELETE /api/config/provider/:id - 删除提供商

**路径参数**:
- `id`: string - 提供商ID

**成功响应** (200):
```json
{ "success": true }
```

#### POST /api/config/model - 添加模型

**请求体**:
```json
{
  "providerId": "string",   // 必需
  "id": "string",           // 必需，模型ID
  "name": "string",         // 必需，显示名称
  "maxTokens": 4096,       // 可选
  "supportsVision": false,  // 可选
  "supportsTools": true     // 可选
}
```

**成功响应** (201): 返回新建的模型

#### PUT /api/config/model/:id - 更新模型

**路径参数**:
- `id`: string - 模型ID

**请求体**:
```json
{
  "providerId": "string",   // 必需
  "name": "string",         // 可选
  "maxTokens": 4096,       // 可选
  "supportsVision": false,  // 可选
  "supportsTools": true     // 可选
}
```

**成功响应** (200): 返回更新后的模型

#### DELETE /api/config/model/:id - 删除模型

**路径参数**:
- `id`: string - 模型ID

**查询参数**:
- `providerId`: string - 必需，提供商ID

**成功响应** (200):
```json
{ "success": true }
```

#### POST /api/config/verify/:providerId - 验证提供商连接

**路径参数**:
- `providerId`: string - 提供商ID

**成功响应** (200):
```json
{
  "ok": true,
  "message": "连接成功"
}
```

#### GET /api/config/quota/:providerId - 获取配额信息

**路径参数**:
- `providerId`: string - 提供商ID

**成功响应** (200):
```json
{
  "used": 5000,
  "total": 100000,
  "currency": "tokens",
  "isEstimated": true
}
```

---

### 6.5 技能模块 (`/api/skill`)

#### GET /api/skill - 列出技能

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `search` | string | 搜索关键词 |
| `status` | string | 状态筛选 |

**成功响应** (200):
```json
{
  "skills": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string",
      "mode": "user|manual",
      "active": true,
      "createdAt": "2026-07-14T06:00:00.000Z",
      "updatedAt": "2026-07-14T06:00:00.000Z"
    }
  ],
  "count": 10
}
```

#### GET /api/skill/:id - 获取技能详情

**路径参数**:
- `id`: string - 技能ID

**成功响应** (200): 返回完整技能对象

#### POST /api/skill/create - 创建技能

**请求体**:
```json
{
  "mode": "user|manual",      // 必需
  "name": "string",           // 必需
  "description": "string",    // 必需
  
  // user模式必需
  "userInput": "string",
  "userOutput": "string",
  "userProcess": "string",
  
  // manual模式必需
  "manualContent": "string"
}
```

**成功响应** (201): 返回新建的技能

#### PUT /api/skill/:id - 更新技能

**路径参数**:
- `id`: string - 技能ID

**请求体**:
```json
{
  "name": "string",
  "description": "string",
  "active": true
}
```

**成功响应** (200): 返回更新后的技能

#### DELETE /api/skill/:id - 删除技能

**路径参数**:
- `id`: string - 技能ID

**成功响应** (200):
```json
{ "success": true }
```

#### POST /api/skill/:id/toggle - 切换技能状态

**路径参数**:
- `id`: string - 技能ID

**成功响应** (200): 返回更新后的技能

#### POST /api/skill/:id/preview - 预览技能规格

**请求体**:
```json
{
  "userInput": "string",
  "userOutput": "string",
  "userProcess": "string"
}
```

**成功响应** (200):
```json
{
  "input": {},
  "output": {},
  "process": "string",
  "constraints": ["constraint1"],
  "examples": [
    { "input": "string", "output": "string" }
  ]
}
```

#### POST /api/skill/:id/review - 审核技能

**请求体**:
```json
{
  "manualContent": "string"
}
```

**成功响应** (200):
```json
{
  "score": 0.85,
  "breakdown": {
    "completeness": 0.9,
    "clarity": 0.8,
    "executability": 0.85,
    "safety": 0.9
  },
  "summary": "string",
  "suggestions": ["suggestion1"]
}
```

---

### 6.6 智能体模块 (`/api/agent`)

#### GET /api/agent - 列出智能体

**查询参数**:
- `search`: string - 搜索关键词

**成功响应** (200):
```json
{
  "agents": [
    {
      "id": "uuid",
      "name": "string",
      "role": "string",
      "description": "string",
      "active": true,
      "createdAt": "2026-07-14T06:00:00.000Z"
    }
  ],
  "count": 5
}
```

#### GET /api/agent/models - 获取可用模型

**成功响应** (200): 返回可用模型列表

#### GET /api/agent/:id - 获取智能体详情

**路径参数**:
- `id`: string - 智能体ID

**成功响应** (200): 返回完整智能体对象

#### POST /api/agent/create - 创建智能体

**请求体**:
```json
{
  "name": "string",          // 必需
  "role": "string",          // 必需
  "description": "string",   // 必需
  "strategy": {              // 可选
    "type": "react|plan-execute|cot|conditional-graph|hybrid",
    "maxIterations": 10,
    "stopConditions": []
  },
  "llm": {},                 // 可选
  "prompt": {                // 可选
    "system": "string",
    "instruction": "string",
    "variables": []
  },
  "skills": [],              // 可选
  "mcpEndpoints": [],        // 可选
  "soul": {},                // 可选
  "sources": {               // 可选
    "knowledgeBase": [],
    "webSearch": false
  }
}
```

**成功响应** (201): 返回新建的智能体

#### PUT /api/agent/:id - 更新智能体

**路径参数**:
- `id`: string - 智能体ID

**请求体**: 同创建智能体（字段均为可选）

**成功响应** (200): 返回更新后的智能体

#### DELETE /api/agent/:id - 删除智能体

**路径参数**:
- `id`: string - 智能体ID

**成功响应** (200):
```json
{ "success": true }
```

#### POST /api/agent/:id/toggle - 切换智能体状态

**路径参数**:
- `id`: string - 智能体ID

**成功响应** (200): 返回更新后的智能体

#### POST /api/agent/generate-prompt - 生成系统提示词

**请求体**:
```json
{
  "purpose": "string",       // 必需
  "constraints": "string"    // 可选
}
```

**成功响应** (200):
```json
{
  "prompt": "string",
  "variables": [
    { "name": "string", "description": "string", "required": true }
  ]
}
```

#### POST /api/agent/generate-soul - 生成灵魂配置

**请求体**:
```json
{
  "purpose": "string",       // 必需
  "preference": "string"     // 可选
}
```

**成功响应** (200):
```json
{
  "style": "string",
  "personality": "string",
  "contentRules": [],
  "constraints": [],
  "temperatureProfile": {
    "creative": 0.8,
    "analytical": 0.3,
    "factual": 0.2
  }
}
```

#### POST /api/agent/suggest-skills - 推荐技能

**请求体**:
```json
{
  "purpose": "string",       // 必需
  "description": "string"    // 可选
}
```

**成功响应** (200):
```json
{
  "skills": [
    { "id": "string", "name": "string", "score": 0.9 }
  ],
  "count": 5
}
```

#### POST /api/agent/suggest-mcps - 推荐MCP包

**请求体**:
```json
{
  "purpose": "string",       // 必需
  "description": "string"    // 可选
}
```

**成功响应** (200):
```json
{
  "mcps": [
    { "id": "string", "name": "string", "score": 0.9 }
  ],
  "count": 5
}
```

---

### 6.7 反馈模块 (`/api/feedback`)

#### POST /api/feedback - 提交反馈

**请求体**:
```json
{
  "messageId": "string",      // 必需
  "conversationId": "string", // 必需
  "userId": "string",         // 必需
  "rating": "good|neutral|bad", // 必需
  "reason": "string",         // 可选
  "errorInfo": {              // 可选
    "errorType": "string",
    "errorMessage": "string",
    "stackTrace": "string",
    "timestamp": 1234567890
  },
  "includeContext": true,     // 可选
  "logTraceId": "string"      // 可选
}
```

**成功响应** (201):
```json
{ "id": "uuid" }
```

#### GET /api/feedback/list - 列出反馈

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | string | pending/reviewed/resolved/dismissed |
| `rating` | string | good/neutral/bad |
| `start` | number | 开始时间戳 |
| `end` | number | 结束时间戳 |

**成功响应** (200):
```json
{
  "feedbacks": [...],
  "count": 10
}
```

#### GET /api/feedback/stats - 获取反馈统计

**查询参数**:
- `start`: number - 开始时间戳
- `end`: number - 结束时间戳

**成功响应** (200):
```json
{
  "analysis": {
    "totalCount": 100,
    "ratingDistribution": { "good": 80, "neutral": 10, "bad": 10 },
    "errorStats": {
      "totalErrors": 10,
      "commonErrors": [{ "type": "timeout", "count": 5 }]
    },
    "commonIssues": [],
    "suggestions": [],
    "trend": { "period": "...", "ratingTrend": [], "errorTrend": [] }
  },
  "distribution": { "good": 80, "neutral": 10, "bad": 10 },
  "trend": { "period": "...", "ratingTrend": [], "errorTrend": [] }
}
```

#### GET /api/feedback/:id - 获取反馈详情

**路径参数**:
- `id`: string - 反馈ID

**成功响应** (200): 返回完整反馈对象

#### PUT /api/feedback/:id/status - 更新反馈状态

**路径参数**:
- `id`: string - 反馈ID

**请求体**:
```json
{
  "status": "pending|reviewed|resolved|dismissed"
}
```

**成功响应** (200):
```json
{ "success": true, "status": "reviewed" }
```

---

### 6.8 统计模块 (`/api/stats`)

#### GET /api/stats - 获取系统统计

**成功响应** (200):
```json
{
  "system": {
    "uptime": 3600,
    "memory": {
      "heapUsed": 128.5,
      "heapTotal": 256.0,
      "rss": 512.0
    },
    "nodeVersion": "v20.10.0",
    "platform": "linux"
  },
  "models": [...],
  "tokenMatrix": {
    "totalTokens": 100000,
    "totalCalls": 500,
    "avgLatency": 1500,
    "byProvider": {}
  },
  "rateLimits": {
    "daily": 100000,
    "weekly": 500000,
    "monthly": 2000000,
    "used": 10000,
    "dailyRemaining": 90000
  },
  "storage": {
    "memoryNodes": 100,
    "conversations": 10,
    "dbPath": "/path/to/db"
  }
}
```

---

### 6.9 库管理模块 (`/api/library`)

#### GET /api/library/paths - 列出库路径

**成功响应** (200):
```json
{
  "paths": [
    {
      "id": "uuid",
      "name": "string",
      "path": "/path/to/library",
      "category": "string",
      "description": "string",
      "metadata": {},
      "active": true,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ],
  "count": 5
}
```

#### POST /api/library/paths - 添加库路径

**请求体**:
```json
{
  "name": "string",         // 必需
  "path": "/path/to/lib",   // 必需
  "category": "string",     // 必需
  "description": "string",  // 可选
  "metadata": {}            // 可选
}
```

**成功响应** (201): 返回新建的库路径

#### DELETE /api/library/paths/:id - 删除库路径

**路径参数**:
- `id`: string - 路径ID

**成功响应** (200):
```json
{ "success": true }
```

#### POST /api/library/check-path - 检查路径

**请求体**:
```json
{
  "path": "/path/to/check"  // 必需
}
```

**成功响应** (200):
```json
{
  "path": "/absolute/path",
  "exists": true,
  "isDirectory": true,
  "isReadable": true,
  "isWritable": true
}
```

---

### 6.10 MCP 模块 (`/api/mcp`)

#### GET /api/mcp/market - 获取MCP市场

**查询参数**:
- `search`: string - 搜索关键词
- `category`: string - 分类筛选

**成功响应** (200):
```json
{
  "packages": [
    {
      "id": "string",
      "name": "string",
      "displayName": "string",
      "description": "string",
      "author": "string",
      "version": "string",
      "category": "string",
      "tags": [],
      "tools": [],
      "installed": false
    }
  ],
  "count": 20
}
```

#### POST /api/mcp/market/sync - 同步MCP市场

**成功响应** (200):
```json
{ "success": true, "message": "Marketplace synced" }
```

#### GET /api/mcp/market/:id - 获取MCP包详情

**路径参数**:
- `id`: string - MCP包ID

**成功响应** (200): 返回完整MCP包对象

#### POST /api/mcp/market/:id - 安装MCP包

**路径参数**:
- `id`: string - MCP包ID

**成功响应** (201): 返回安装结果

#### DELETE /api/mcp/market/:id - 卸载MCP包

**路径参数**:
- `id`: string - MCP包ID

**成功响应** (200):
```json
{ "success": true }
```

#### GET /api/mcp/installed - 获取已安装MCP包

**成功响应** (200):
```json
{
  "installed": [
    {
      "id": "string",
      "packageName": "string",
      "displayName": "string",
      "version": "string",
      "tools": [],
      "active": true,
      "serverStatus": "running|stopped|error",
      "installedAt": "2026-07-14T06:00:00.000Z"
    }
  ],
  "count": 3
}
```

---

### 6.11 学习模块 (`/api/learning`)

#### GET /api/learning/queue - 获取学习队列

**成功响应** (200):
```json
{
  "queue": [
    {
      "id": "uuid",
      "knowledgeItem": { "content": "string", "source": "string", "confidence": 0.9 },
      "priority": 5,
      "status": "pending|approved|skipped|learning|completed",
      "createdAt": 1234567890
    }
  ],
  "stats": {
    "pending": 10,
    "approved": 5,
    "completed": 100
  }
}
```

#### GET /api/learning/queue/stats - 获取队列统计

**成功响应** (200): 返回队列统计数据

#### PUT /api/learning/queue/:id/priority - 更新优先级

**路径参数**:
- `id`: string - 队列项ID

**请求体**:
```json
{
  "priority": 5  // 必需，数字
}
```

**成功响应** (200):
```json
{ "success": true, "id": "uuid" }
```

#### PUT /api/learning/queue/:id/skip - 跳过学习项

**路径参数**:
- `id`: string - 队列项ID

**成功响应** (200):
```json
{ "success": true, "id": "uuid" }
```

#### POST /api/learning/queue/batch-approve - 批量批准

**请求体**:
```json
{
  "ids": ["uuid1", "uuid2"]  // 必需，ID数组
}
```

**成功响应** (200):
```json
{ "success": true, "count": 2 }
```

#### GET /api/learning/batches - 获取学习批次

**成功响应** (200):
```json
{
  "batches": [
    {
      "id": "uuid",
      "topic": "string",
      "items": [],
      "relevanceScore": 0.85,
      "createdAt": 1234567890
    }
  ],
  "count": 5
}
```

#### POST /api/learning/plans - 创建学习计划

**请求体**:
```json
{
  "batchId": "uuid"  // 必需
}
```

**成功响应** (201):
```json
{
  "id": "uuid",
  "batchId": "uuid",
  "phases": [
    { "phase": 1, "name": "learning", "status": "pending", "items": [] }
  ],
  "createdAt": 1234567890
}
```

#### GET /api/learning/plans/:id/next-phase - 获取下一阶段

**路径参数**:
- `id`: string - 计划ID

**成功响应** (200): 返回下一阶段信息

#### POST /api/learning/plans/:id/complete-phase - 完成阶段

**路径参数**:
- `id`: string - 计划ID

**请求体**:
```json
{
  "phase": 1  // 必需，阶段号
}
```

**成功响应** (200):
```json
{ "success": true }
```

#### GET /api/learning/progress - 获取学习进度

**成功响应** (200): 返回学习进度数据

#### GET /api/learning/knowledge - 获取已学知识

**查询参数**:
- `source`: string - 来源筛选

**成功响应** (200):
```json
{
  "knowledge": [...],
  "count": 50
}
```

#### GET /api/learning/knowledge/graph - 获取知识图谱

**成功响应** (200): 返回知识图谱数据

#### GET /api/learning/insights - 获取洞察

**查询参数**:
- `limit`: number - 返回数量（默认10）

**成功响应** (200):
```json
{
  "insights": [
    {
      "content": "string",
      "insight": "string",
      "timestamp": 1234567890
    }
  ],
  "count": 10
}
```

#### GET /api/learning/is-idle - 检查空闲状态

**成功响应** (200):
```json
{ "isIdle": true }
```

#### POST /api/learning/schedule - 调度学习

**请求体**:
```json
{
  "intervalMs": 300000  // 可选，默认300000ms (5分钟)
}
```

**成功响应** (200):
```json
{ "success": true, "intervalMs": 300000 }
```

#### GET /api/learning/starvation - 检查学习饥饿

**成功响应** (200):
```json
{ "isStarvation": false }
```

#### POST /api/learning/rebalance - 重新平衡

**成功响应** (200):
```json
{ "success": true }
```

---

## 7. 错误处理

### 7.1 错误响应格式

所有错误响应统一格式：

```json
{
  "error": "string",  // 错误描述
  "code": "string"    // 错误代码
}
```

### 7.2 常见错误码

| 错误码 | HTTP状态 | 说明 |
|--------|----------|------|
| `VALIDATION_ERROR` | 400 | 请求参数验证失败 |
| `INVALID_MESSAGE` | 400 | 无效的消息内容 |
| `NOT_FOUND` | 404 | 资源未找到 |
| `DUPLICATE_PROVIDER` | 409 | 提供商已存在 |
| `DUPLICATE_MODEL` | 409 | 模型已存在 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 |
| `CHAT_ERROR` | 500 | 对话错误 |
| `MEMORY_ERROR` | 500 | 记忆模块错误 |
| `CONFIG_ERROR` | 500 | 配置错误 |
| `SKILL_CREATE_ERROR` | 500 | 技能创建错误 |
| `AGENT_CREATE_ERROR` | 500 | 智能体创建错误 |
| `FEEDBACK_CREATE_ERROR` | 500 | 反馈创建错误 |
| `MCP_INSTALL_ERROR` | 500 | MCP安装错误 |
| `INTERNAL_ERROR` | 500 | 内部服务器错误 |

---

## 8. 类型定义

### 8.1 核心类型

```typescript
// 记忆类型
type MemoryType = 'episodic' | 'semantic' | 'procedural';

// 标签维度
type TagDimension = 'domain' | 'industry' | 'concept' | 'action' | 'sentiment';

// 反馈评级
type FeedbackRating = 'good' | 'neutral' | 'bad';

// 反馈状态
type FeedbackStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

// 策略类型
type StrategyType = 'react' | 'plan-execute' | 'cot' | 'conditional-graph' | 'hybrid';
```

### 8.2 标签集合

```typescript
interface TagSet {
  domain: string[];       // 领域标签：frontend, backend, ai-ml, etc.
  industry: string[];     // 行业标签：finance, healthcare, gaming, etc.
  concept: string[];      // 概念标签：architecture, performance, reliability, etc.
  action: string[];       // 动作标签：create, modify, analyze, search, etc.
  sentiment: string;      // 情感：positive, neutral, negative, frustrated, excited
}
```

### 8.3 统一记忆项

```typescript
interface UnifiedMemoryItem {
  id: string;
  type: MemoryType;
  rawContent: string;
  summary: string;
  semanticFingerprint: string;
  role: 'user' | 'assistant' | 'system' | 'agent';
  tags: TagSet;
  accessHistory: { timestamp: number; context: string; score: number }[];
  createdAt: number;
  lastAccessedAt: number;
  temporalDecay: number;
  relatedMemories: { memoryId: string; relation: string; weight: number }[];
}
```

### 8.4 对话消息

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

### 8.5 模型提供商

```typescript
interface ModelProvider {
  id: string;
  name: string;
  type: 'openai-compatible' | 'anthropic' | 'google' | 'custom';
  baseUrl: string;
  apiKey: string;           // 返回时已脱敏
  models: ModelConfig[];
  enabled: boolean;
}

interface ModelConfig {
  id: string;
  name: string;
  maxTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
}
```

---

## 9. cURL 示例

### 9.1 非流式对话

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, how are you?",
    "conversationId": "abc123"
  }'
```

### 9.2 流式对话

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "message": "Explain JavaScript closures"
  }'
```

### 9.3 获取记忆

```bash
curl http://localhost:3000/api/memory?query=React\&maxResults=5
```

### 9.4 获取配置

```bash
curl http://localhost:3000/api/config
```

---

## 10. WebSocket 连接示例

### 10.1 基础连接示例

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  console.log('WebSocket connected');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data.type, data.payload);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = (event) => {
  console.log('WebSocket closed:', event.code, event.reason);
};
```

### 10.2 完整客户端示例（含消息发送）

```javascript
class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.clientId = null;
    this.listeners = {};
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.clientId = null;
      };
    });
  }

  handleMessage(message) {
    const { type, payload, timestamp } = message;
    
    switch (type) {
      case 'connected':
        this.clientId = payload.clientId;
        console.log('Connected with clientId:', this.clientId);
        break;
      default:
        console.log('Unknown message type:', type, payload);
    }

    // 触发事件监听
    if (this.listeners[type]) {
      this.listeners[type].forEach(callback => callback(payload, timestamp));
    }
  }

  on(type, callback) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(callback);
  }

  send(type, payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      type,
      payload,
      timestamp: Date.now(),
    };

    this.ws.send(JSON.stringify(message));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// 使用示例
const client = new WebSocketClient('ws://localhost:3000/ws');

client.connect().then(() => {
  client.on('connected', (payload) => {
    console.log('Received clientId:', payload.clientId);
    // 连接成功后可以发送消息
    // client.send('ping', { timestamp: Date.now() });
  });
});
```

---

## 附录：默认模型配置

后端预配置了以下模型提供商：

| 提供商ID | 名称 | 类型 | 默认状态 |
|----------|------|------|----------|
| `openai` | OpenAI | openai-compatible | 启用 |
| `anthropic` | Anthropic | anthropic | 禁用 |
| `google` | Google | google | 禁用 |
| `deepseek` | DeepSeek | openai-compatible | 禁用 |
| `zhipu` | 智谱AI | openai-compatible | 禁用 |
| `moonshot` | Moonshot | openai-compatible | 禁用 |
| `qwen` | 通义千问 | openai-compatible | 禁用 |
| `custom` | 自定义端点 | custom | 禁用 |

> **注意**: 首次使用需要配置各提供商的 API Key 才能正常使用。