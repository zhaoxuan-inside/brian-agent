# Brian-Agent 前端页面 PRD

> 版本: v1.0 | 日期: 2026-07-16 | 状态: 已完成

---

## 目录

1. [架构总览](#一架构总览)
2. [页面 1：对话 (Chat)](#二页面-1对话-chat)
3. [页面 2：历史会话 (History)](#三页面-2历史会话-history)
4. [页面 3：记忆 (Memory)](#四页面-3记忆-memory)
5. [页面 4：监控 (Monitor)](#五页面-4监控-monitor)
6. [页面 5：可视化 (Visual)](#六页面-5可视化-visual)
7. [页面 6：学习 (Learning)](#七页面-6学习-learning)
8. [页面 7：资料库 (Library)](#八页面-7资料库-library)
9. [页面 8：Soul](#九页面-8soul)
10. [页面 9：Work](#十页面-9work)
11. [页面 10：Skill](#十一页面-10skill)
12. [页面 11：MCP](#十二页面-11mcp)
13. [页面 12：模型配置 (ModelConfig)](#十三页面-12模型配置-modelconfig)
14. [页面 13：用户画像 (Profile)](#十四页面-13用户画像-profile)
15. [页面 14：设置 (Settings)](#十五页面-14设置-settings)
16. [数据存储原则](#十六数据存储原则)

---

## 一、架构总览

### 1.1 前端架构

```
frontend/src/
├── views/              # 14 个页面视图（薄包装层）
├── components/         # 通用组件
│   ├── Header.vue      # 顶部导航栏
│   ├── NeuralBackground.vue  # 动态粒子背景
│   ├── ChatArea.vue    # 对话区域
│   ├── InputBox.vue    # 聊天输入框
│   ├── FunctionPanel.vue  # 模态面板系统
│   └── panels/         # 12 个功能面板（核心逻辑所在）
├── stores/             # Pinia 状态管理
│   ├── session.ts      # 对话状态
│   ├── config.ts       # 配置状态
│   ├── auth.ts         # 认证状态
│   ├── theme.ts        # 主题状态
│   ├── panel.ts        # 面板状态
│   └── soul.ts         # Soul 状态
├── api/
│   └── index.ts        # 所有后端 API 封装
└── router/
    └── index.ts        # 路由配置
```

### 1.2 页面与后端路由对应关系

| 前端页面 | 路由路径 | 后端 API 前缀 | 后端路由文件 |
|---------|---------|-------------|-------------|
| 对话 | `/` | `/api/chat` | `access/chatRoutes.ts` |
| 历史会话 | `/history` | `/api/chat/list` | `access/chatRoutes.ts` |
| 记忆 | `/memory` | `/api/memory` | `access/memoryRoutes.ts` |
| 监控 | `/monitor` | `/api/statistics` | `access/statisticRoutes.ts` |
| 可视化 | `/visual` | `/api/visual` | `access/visualRoutes.ts` |
| 学习 | `/learning` | `/api/learning` | `access/learningRoutes.ts` |
| 资料库 | `/library` | `/api/library` | `access/libraryRoutes.ts` |
| Soul | `/soul` | `/api/config/soul` | `access/configRoutes.ts` |
| Work | `/work` | `/api/config/work` | `access/configRoutes.ts` |
| Skill | `/skill` | `/api/config/skill` + `/api/skill` | `access/configRoutes.ts` + `access/skillRoutes.ts` |
| MCP | `/mcp` | `/api/config/mcp` + `/api/mcp` | `access/configRoutes.ts` + `access/mcpRoutes.ts` |
| 模型配置 | `/models` | `/api/config/*` | `access/configRoutes.ts` |
| 用户画像 | `/profile` | `/api/profile` | `access/profileRoutes.ts` |
| 设置 | `/settings` | `/api/config` | `access/configRoutes.ts` |

---

## 二、页面 1：对话 (Chat)

**路由**: `/` | **视图文件**: `views/ChatView.vue` | **核心组件**: `ChatArea.vue`, `InputBox.vue`, `FunctionPanel.vue`

### 2.1 功能描述

AI 对话主界面，支持多轮对话、流式响应、历史会话切换、Agent 调度链可视化。

### 2.2 页面布局

- **左侧可折叠侧边栏**：历史会话列表，点击可切换会话
- **中央区域**：消息气泡列表（ChatArea）
- **底部**：聊天输入框（InputBox），支持 Enter 发送 / Shift+Enter 换行
- **右侧**：Agent 调度链侧边栏（AgentChainSidebar，有 Agent 时显示）
- **模态层**：功能面板（FunctionPanel），可打开记忆/资料库/学习等面板

### 2.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 发送消息 | `POST` | `/api/chat/send` | 发送用户消息，返回 AI 回复 |
| 流式对话 | `POST` | `/api/chat/stream` | SSE 流式响应 |
| 获取历史 | `GET` | `/api/chat/history/:sessionId?page=1&pageSize=100` | 按时间倒序分页获取，每页100条 |
| 会话列表 | `GET` | `/api/chat/list` | 获取所有会话列表 |

**请求体示例 (send)**:
```json
{
  "userId": "default-user",
  "message": "用户输入内容",
  "sessionId": "会话ID（可选，不传则新建会话）",
  "exchangeId": "本轮问答ID（前端生成，时间序UUID v7，一次提问+回复+中间过程共用）",
  "selectedMessageIds": ["选中的历史消息ID数组（可选）"]
}
```

**响应体示例**:
```json
{
  "msgId": "本条消息ID（时间序UUID v7）",
  "exchangeId": "本轮问答ID（与请求一致）",
  "sessionId": "会话ID",
  "userId": "default-user",
  "role": "assistant",
  "content": "AI 回复内容",
  "timestamp": 1752681600000
}
```

**ID 规范**: 系统中所有 ID 均使用时间序 UUID（UUID v7），以毫秒精度时间戳为前缀，保证按时间排序和全局唯一。
- `sessionId`：一次会话的唯一标识，会话内所有消息共享
- `exchangeId`：一轮问答（一问一答及中间Agent过程）的唯一标识，用户消息和AI回复使用同一个 exchangeId
- `msgId`：单条消息的唯一标识，区分用户发送的每条消息和AI的每条回复

**消息时间标注**: 历史消息列表中按时间展示分割线，标注"最近1小时"、"今天"、"昨天"、"本周"、"本月"等时间分组。

**数据存储**: 所有消息存储在 `user_messages` 表中，按 `session_id` + `exchange_id` + `msg_id` 唯一索引。

### 2.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ sessionStore.listChats()                     // 加载历史会话列表
```

**消息发送流程**：
```
用户输入消息（Enter 发送 / Shift+Enter 换行）
  │
  ├─ 0. 前端生成 exchangeId（UUID v7）和 msgId（UUID v7）
  │     ├─ exchangeId：本轮问答唯一标识，一次提问+回复+中间过程共用
  │     └─ msgId：本条消息唯一标识
  │
  ├─ 1. 调用 sessionStore.sendMessage(content, options)
  │     ├─ POST /api/chat/send 或 /api/chat/stream
  │     ├─ 请求体: { userId, message, sessionId?, exchangeId, selectedMessageIds? }
  │     ├─ 响应体: { msgId, exchangeId, sessionId, role, content, timestamp }
  │     └─ 更新 messages 列表（追加用户消息 + AI 回复）
  │
  └─ 2. 如果产生 Agent 调度链 → 更新 agentChainHistory（关联 exchangeId）
```

**会话切换**：
```
用户点击侧边栏会话
  └─ sessionStore.loadChatHistory(sessionId, page=1)
       └─ GET /api/chat/history/:sessionId?page=1&pageSize=100
            └─ 更新 messages 列表（按时间倒序，每页100条）
            └─ 上滑加载更多 → page++ 追加历史消息
```

**新建会话**：
```
handleNewChat() → 清空当前 messages，重置 sessionId（前端生成新的时间序UUID）
```

**Store 交互**：`sessionStore` 提供 `sendMessage`, `loadChatHistory`, `listChats`, `currentChatId`, `messages`, `agentChainHistory`

---

## 三、页面 2：历史会话 (History)

**路由**: `/history` | **视图文件**: `views/HistoryView.vue` | **面板组件**: `panels/HistoryPanel.vue`

### 3.1 功能描述

展示所有历史会话列表，支持搜索、删除会话、查看 Agent 调度链。

### 3.2 Tab 结构

**单页面无 Tab**，包含以下功能区域：

- **搜索框**：按关键词搜索历史会话
- **会话列表**：每条会话显示标题、最后消息、时间戳、消息数、Agent 调度标签
- **操作按钮**：删除会话、查看 Agent 调度链

### 3.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取会话列表 | `GET` | `/api/chat/list?userId=default-user` | 返回所有会话汇总 |
| 删除会话 | 本地操作 | 无后端删除接口 | 当前仅前端删除，需后端补充 `DELETE /api/chat/:sessionId` |

**数据存储**: 会话列表从 `user_messages` 表按 `session_id` 分组聚合查询。

### 3.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ sessionStore.listChats()
       └─ GET /api/chat/list?userId=default-user
            └─ 返回 [{ sessionId, lastMessage, lastTime }, ...]
            └─ 赋值给 chatList ref
```

**搜索过滤**：
```
filteredSessions() — computed
  ├─ 根据 searchQuery 过滤 title 和 lastMessage
  └─ sessions computed 预处理：
       ├─ title: 截取 lastMessage 前30字符
       ├─ tags: 检查 agentChainHistory 中是否有该 sessionId
       └─ formatTime(timestamp): 今天显示时间、昨天显示"昨天"、其他显示日期
```

**时间分割线**（历史消息列表）：
```
消息按时间倒序渲染，插入时间分割线：
  ├─ 最近1小时内 → "最近1小时"
  ├─ 今天（1小时前~今天0点） → "今天"
  ├─ 昨天 → "昨天"
  ├─ 本周内 → "本周"
  └─ 本月内 → "本月"
更早的消息按月份分组 → "X月"
```

**分页加载**：
```
上滑/滚动到底部触发 loadMore()：
  └─ GET /api/chat/history/:sessionId?page=page+1&pageSize=100
       └─ 追加到 messages 列表头部
```

**删除会话**：
```
handleDeleteMessage(id)
  ├─ chatList.value = chatList.value.filter(c => c.sessionId !== id)  // 前端删除
  └─ delete sessionStore.agentChainHistory[id]                         // 清理 Agent 链缓存
  // 注意：当前仅前端删除，无后端 DELETE /api/chat/:sessionId 接口
```

**查看 Agent 调度链**：
```
viewAgentChain(exchangeId)
  └─ sessionStore.loadAgentChainForExchange(exchangeId)
  └─ Agent 调度链通过 exchangeId 标识，一次问答中的所有 Agent 调度过程共享同一个 exchangeId
```

**Store 交互**：`sessionStore.listChats()`, `sessionStore.agentChainHistory`, `sessionStore.loadAgentChainForMessage()`

---

## 四、页面 3：记忆 (Memory)

**路由**: `/memory` | **视图文件**: `views/MemoryView.vue` | **面板组件**: `panels/MemoryPanel.vue`

### 4.1 功能描述

六层记忆系统（CoALA 认知框架）的可视化管理界面，支持记忆检索、标签图谱、分组浏览。

### 4.2 Tab 结构

#### Tab 1: 最近 (Recent)

- 按时间倒序展示所有记忆条目
- 每条记忆显示：角色图标（用户/助手/系统）、内容摘要、标签徽章、相对时间
- 点击可展开查看完整内容

#### Tab 2: 标签 (Tags)

- **SVG 力导向图**：展示标签之间的共现关系图谱
  - 节点大小反映关联度（degree）
  - 节点颜色反映关联度（蓝→绿→橙→红）
  - 支持缩放、拖拽
  - 悬停边显示共现次数
- 点击节点可跳转到"标签组"Tab 查看该标签下的记忆

#### Tab 3: 标签组 (Groups)

- 按记忆类型分组展示（episodic/semantic/procedural）
- 点击特定标签后，展示该标签下的所有记忆条目

### 4.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取所有记忆 | `GET` | `/api/memory?userId=default-user` | 按时间倒序 |
| 获取标签列表 | `GET` | `/api/memory/tags` | 聚合所有标签 |
| 获取分组 | `GET` | `/api/memory/groups` | 按类型分组 |
| 获取标签图 | `GET` | `/api/memory/tag-graph` | 节点 + 边数据 |
| 按标签查记忆 | `GET` | `/api/memory/by-tag/:tag` | 标签筛选 |
| 创建工作记忆 | `GET` | `/api/memory/working/:userId/:chatId` | 获取工作记忆 |
| 语义检索 | `GET` | `/api/memory/semantic/:userId?query=` | 语义搜索 |
| 情节记忆 | `GET` | `/api/memory/episodic/:userId` | 情节记忆 |
| 程序记忆 | `GET` | `/api/memory/procedural/:userId` | 程序记忆 |
| 搜索记忆 | `GET` | `/api/memory/search/:userId?query=` | 关键词搜索 |
| 写入记忆 | `POST` | `/api/memory` | 创建新记忆 |
| 更新记忆 | `PUT` | `/api/memory/:id` | 修改记忆 |
| 删除记忆 | `DELETE` | `/api/memory/:id` | 删除记忆 |

**数据存储**: 记忆存储在 `memory_nodes` 表（结构化数据）+ `memory_edges` 表（关联图）+ 向量数据库（语义向量）。

### 4.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ fetchMemories()
       └─ 并行请求 4 个 API（非 Promise.all，各自独立错误处理）：
            ├─ GET /api/memory → recentMemories (按 createdAt 降序)
            ├─ GET /api/memory/tags → tags[]
            ├─ GET /api/memory/groups → groups[] (展开为 { name, count, degree })
            └─ GET /api/memory/tag-graph → tagGraph { nodes, edges }
                 └─ 如果 nodes.length > 0 → initGraphSimulation() 初始化力导向图
```

**标签力导向图模拟**：
```
initGraphSimulation()
  ├─ 节点初始位置：圆形排列（半径 = min(350, nodes.length * 30)）
  ├─ 力模拟（200 次迭代，requestAnimationFrame 驱动）：
  │   ├─ 节点间斥力：force = 800 / dist²
  │   ├─ 边吸引力：force = (dist - 80) * 0.01 * edgeWeight
  │   ├─ 中心引力：向 (400, 300) 中心靠拢
  │   └─ 速度衰减：damping = 0.85
  ├─ 节点颜色：degree ≥ 5 = 蓝色, ≥ 3 = 紫色, ≥ 2 = 紫色, 其他 = 淡紫色
  ├─ 交互：拖拽节点（mousedown/mousemove/mouseup）、滚轮缩放（0.3~3x）
  └─ 悬停边：计算点到线段距离，距离 < 8 时显示 tooltip（源标签、目标标签、权重）
```

**标签点击 → 跳转标签组**：
```
fetchTagMemories(tag)
  ├─ activeTab = 'groups'
  └─ GET /api/memory/by-tag/:tag
       └─ tagMemories 按 createdAt 降序
```

**展开/折叠记忆详情**：
```
toggleExpand(id)
  └─ expandedMemoryId = (expandedMemoryId === id ? null : id)
```

**清理**：
```
onUnmounted → cancelAnimationFrame(graphAnimFrame)  // 停止力导向图动画
```

**直接 API 调用**：此页面使用 `fetch(API_BASE)` 直接调用后端，不使用 `api/index.ts` 封装层。

---

## 五、页面 4：监控 (Monitor)

**路由**: `/monitor` | **视图文件**: `views/MonitorView.vue` | **面板组件**: `panels/MonitorPanel.vue`

### 5.1 功能描述

系统运行监控仪表盘，展示系统资源、Token 用量、模型统计等指标。数据分为实时数据（自动刷新）和历史数据（一次性获取）。

### 5.2 刷新策略

| 数据类型 | 刷新间隔 | 说明 |
|---------|---------|------|
| CPU 使用率 | 每 10 秒 | 实时系统资源 |
| 内存使用率 | 每 10 秒 | 实时系统资源 |
| 磁盘使用率 | 每 10 分钟 | 变化较慢 |
| 运行时间 | 从后端获取启动时间后前端自动计算 | 基于 `startTime` 差值 |
| Token 用量、总调用次数、平均延迟 | 每 10 秒 | 后端 AOP 切面记录，每次模型调用时更新 |
| 记忆节点数、会话数 | 每 10 秒 | 后端在记忆节点/会话变更时更新 |
| VectorDB 状态 | 每 10 秒 | 检查组件健康状态 |
| 环形图（今日/本周/本月） | 进入页面时调用一次 | 历史统计 |
| 贡献矩阵热力图 | 进入页面时调用一次 | 按月分割的 Token 用量热力图 |
| 按模型统计 | 进入页面时调用一次 | 各模型调用次数、调用量、首Token时延 |

### 5.3 Tab 结构

#### Tab 1: 实时统计 (Realtime)

- **系统资源卡片**：CPU 使用率、内存使用率、磁盘使用率、运行时间
- **累计统计**：总 Token 用量、总调用次数、平均延迟
- **存储状态**：记忆节点数、会话数
- **存储引擎状态**：关系型 DB（SQLite）、向量 DB、图 DB（TinyGraphDB/SQLite/Memory）

#### Tab 2: Token 统计 (Tokens)

- **多层环形图**：由内到外分别代表今日（红色）、本周（绿色）、本月（黄色）Token 使用百分比
  - 环的内部显示用量数值（如 10M / 50M / 220M），自动转换单位避免数据与环重叠
  - 调用时机：进入页面时调用一次
- **贡献矩阵热力图**（GitHub 风格）：
  - 按月分割，可左右滑动查看滑动窗口内的热力图
  - 热力图填满整个展示矩形
  - 最多显示到当前月
  - 调用时机：进入页面时调用一次

#### Tab 3: 按模型 (By Model)

- 用户可以配置多个模型，顶部展示所有模型的汇总统计
- **模型切换器**：下拉选择具体模型，切换后展示该模型的贡献矩阵热力图
- 贡献矩阵热力图（与 Tab 2 相同样式，按具体模型过滤）
- 调用次数、调用量、首Token时延（TTFT）
- 调用时机：进入页面时调用一次
- **不使用柱状图**

### 5.4 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取系统资源 | `GET` | `/api/stats` | CPU/内存/磁盘/启动时间（10s/10min 轮询） |
| 获取 Token 统计 | `GET` | `/api/statistics/token-usage` | 按模型分组的 Token 统计（10s 轮询） |
| 获取综合统计 | `GET` | `/api/statistics/summary` | 记忆节点数、会话数（10s 轮询） |
| 获取 VectorDB 状态 | `GET` | `/api/stats/vector-db` | 向量数据库健康状态（10s 轮询） |
| 获取环形图数据 | `GET` | `/api/statistics/token-ring` | 今日/本周/本月 Token 用量（进入时一次） |
| 获取贡献矩阵 | `GET` | `/api/statistics/contribution?year=2026` | 日历热力图数据（进入时一次） |
| 按模型获取贡献矩阵 | `GET` | `/api/statistics/contribution/:modelId?year=2026` | 具体模型热力图（切换模型时一次） |

**数据写入**: Token 用量由后端 AOP 切面在每次 LLM 调用时记录到 `model_statistics` 表（按模型+日期），自学习等场景的模型调用也通过同一切面记录。记忆节点数和会话数在对应数据变更时更新。

**数据存储**: Token 用量存储在 `model_statistics` 表（按模型+日期），系统指标存储在 `system_metrics` 表（按日期），时序数据存储在 `time_series` 表。

### 5.5 处理逻辑

**页面生命周期**：
```
onMounted
  ├─ fetchSystemStats()        // 立即加载系统资源
  ├─ fetchTokenStats()         // 立即加载 Token 统计
  ├─ fetchSummary()            // 立即加载存储统计
  ├─ fetchVectorDBStatus()     // 立即加载向量DB状态
  ├─ fetchTokenRing()          // 一次性：环形图数据
  ├─ fetchContribution()       // 一次性：贡献矩阵
  ├─ fetchPerModelStats()      // 一次性：按模型统计
  │
  ├─ cpuMemTimer = setInterval(fetchSystemStats, 10000)     // 10 秒
  ├─ diskTimer = setInterval(fetchDiskStats, 600000)        // 10 分钟
  ├─ tokenTimer = setInterval(fetchTokenStats, 10000)       // 10 秒
  ├─ summaryTimer = setInterval(fetchSummary, 10000)        // 10 秒
  └─ vectorDbTimer = setInterval(fetchVectorDBStatus, 10000) // 10 秒

onUnmounted
  └─ 清理所有定时器（cpuMemTimer, diskTimer, tokenTimer, summaryTimer, vectorDbTimer）
```

**运行时间计算**：
```
fetchSystemStats() → 获取 startTime（服务启动时间戳）
  └─ uptime computed：每秒自动计算 (Date.now() - startTime) / 1000
       └─ formatUptime(s): Xh Ym 或 Xm
```

**多层环形图渲染**：
```
环形图数据：
  └─ todayRing: 今日用量/今日限额（红色 #ef4444）
  └─ weekRing: 本周用量/本周限额（绿色 #10b981）
  └─ monthRing: 本月用量/本月限额（黄色 #f59e0b）

SVG 渲染（由内到外三层环）：
  ├─ 内环（今日）：半径 60-80，红色
  ├─ 中环（本周）：半径 85-105，绿色
  ├─ 外环（本月）：半径 110-130，黄色
  └─ 中心文字：格式化后的用量数值（如 10M/50M/220M），字体大小随环自动适配

donutColor(pct): >80% 红色, >50% 黄色, 其他 蓝色
donutArc(pct): SVG 弧形路径，>50% 时 largeArc=1
```

**贡献矩阵（GitHub 风格）**：
```
贡献矩阵渲染：
  └─ 按月分割列，每列为一周（7天）
  └─ 每个单元格颜色深度表示当天 Token 用量（0=浅灰，max=深绿）
  └─ 横向滚动：overflow-x: auto，支持触摸滑动
  └─ 最多显示到当前月
  └─ 热力图填满整个矩形容器

按模型切换：
  └─ selectedModelId 变化时
       └─ GET /api/statistics/contribution/:modelId?year=currentYear
            └─ 更新贡献矩阵数据
```

**格式化函数**：
- `formatHuman(n)`: 1B+ = X.XB, 1M+ = X.XM, 1K+ = X.XK
- `formatBytes(mb)`: >1024 = X.X GB
- `formatUptime(s)`: Xh Ym 或 Xm
- `formatTokens(n)`: 同 formatHuman

---

## 六、页面 5：可视化 (Visual)

**路由**: `/visual` | **视图文件**: `views/VisualView.vue` | **面板组件**: `panels/VisualPanel.vue`

### 6.1 功能描述

Multi-Agent 流程可视化，展示 DAG 任务图、对话时间线、Agent 调用链。

### 6.2 Tab 结构

#### Tab 1: DAG 图 (DAG)

- **SVG 有向图**：展示记忆节点之间的关联关系
  - 节点颜色由 ID 哈希决定（确定性颜色）
  - 箭头表示关系方向
  - 节点详情列表（ID、类型、标签）

#### Tab 2: 时间线 (Timeline)

- **垂直时间线**：展示对话消息的时间顺序
  - 用户消息（蓝色气泡）
  - 助手/Agent 消息（灰色气泡）
  - 显示时间戳

#### Tab 3: 调用链 (Call Chain)

- **Agent 状态列表**：显示每个 Agent 的运行状态（running/idle）和最后活跃时间
- **静态回退**：无 Agent 数据时，展示标准 Agent 链路（Planner → Worker → Synthesizer → Evaluator）

### 6.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取记忆图 | `GET` | `/api/visual/memory-graph/:userId` | 节点 + 边数据 |
| 获取对话流 | `GET` | `/api/visual/chat-flow/:chatId?userId=` | 对话消息时间线 |
| 获取 Agent 状态 | `GET` | `/api/visual/agent-status` | Agent 运行状态 |

**数据存储**: 调用链路追踪数据存储在 `call_traces` 表（保留 7 天），Agent 状态由 `AgentOrchestrator` 维护在内存中。

### 6.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ loadData()
       └─ 并行请求 3 个 API（Promise.allSettled，各自独立错误处理）：
            ├─ visualApi.memoryGraph(userId) → graphData
            │    └─ GET /api/visual/memory-graph/:userId
            │    └─ 无数据时不展示 DAG 图区域，显示"暂无数据"
            ├─ chatId 存在时 visualApi.chatFlow(chatId, userId) → chatFlow
            │    └─ GET /api/visual/chat-flow/:chatId?userId=
            │    └─ 无数据时不展示时间线区域，显示"暂无数据"
            └─ visualApi.agentStatus() → agentStatus
                 └─ GET /api/visual/agent-status
                 └─ 无数据时不展示调用链区域，显示"暂无数据"
```

**chatId 来源**：
```
chatId = route.query.chatId as string  // 从 URL 查询参数获取，可从历史会话页面跳转
```

**DAG 图渲染**：
```
graphData.nodes + graphData.edges
  ├─ 节点颜色：getNodeColor(nodeId) → 基于 ID 哈希的确定性颜色（6 色调色板）
  │    colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
  │    hash = nodeId 各字符 charCode 求和 % 6
  ├─ SVG 布局：
  │   ├─ 节点圆形：cx 按索引等分宽度，cy = 20%，r = 24，填充 = getNodeColor
  │   ├─ 节点标签：显示 label || type || id 的前 2 字符（白色文字）+ 完整名称（下方）
  │   └─ 边箭头：line 从 source_node_id 到 target_node_id，marker-end 箭头
  └─ 节点详情列表：底部网格展示每个节点的颜色圆点 + 名称
```

**时间线渲染**：
```
chatFlow 数组
  └─ 每条消息：
       ├─ 角色图标：user → 蓝色圆形 "U"，assistant → 绿色圆形 "A"
       ├─ 连接线：消息间垂直连接线（除最后一条）
       ├─ 角色名称："用户" / "助手"
       ├─ 时间戳：formatTime(ts) → HH:MM:SS
       └─ 内容：line-clamp-3 截断（最多 3 行）
```

**调用链渲染**：
```
agentStatus.agents 存在时：
  └─ 每个 Agent：
       ├─ 状态指示灯：running → 绿色脉冲动画，idle → 灰色
       ├─ 名称 + 策略/类型
       └─ 状态标签：running/idle
agentStatus.agents 不存在时（静态回退）：
  └─ 标准 Agent 链路：Planner → Worker → Synthesizer → Evaluator
       └─ 每个节点显示蓝色圆点 + 名称，箭头连接
```

**Store 交互**：此页面直接使用 `visualApi` 调用，不依赖 Pinia Store。

---

## 七、页面 6：学习 (Learning)

**路由**: `/learning` | **视图文件**: `views/LearningView.vue` | **面板组件**: `panels/LearningPanel.vue`

### 7.1 功能描述

自学习系统管理界面，展示学习队列、学习进度、已学知识、洞察。

### 7.2 Tab 结构

#### Tab 1: 学习队列 (Queue)

- **统计卡片**（5 列）：待处理、已批准、已跳过、学习中、已完成
- **批量操作**：批量批准按钮
- **队列列表**：每条学习项显示内容、来源、优先级、状态
  - 操作按钮：批准（提升优先级至 90）、跳过

#### Tab 2: 学习进度 (Progress)

- **4 阶段进度条**：探索 (Exploration) → 理解 (Comprehension) → 应用 (Application) → 精通 (Mastery)
- **学习来源分布**：展示各来源的学习任务比例

#### Tab 3: 知识图谱 (Knowledge)

- **知识卡片网格**：每个卡片显示知识内容、来源标签
- 支持按来源筛选

#### Tab 4: 洞察 (Insights)

- **洞察卡片列表**：灯泡图标 + 洞察内容 + 时间戳

### 7.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取学习队列 | `GET` | `/api/learning/queue` | 队列项列表 |
| 获取队列统计 | `GET` | `/api/learning/queue/stats` | 各状态计数 |
| 获取学习进度 | `GET` | `/api/learning/progress` | 4 阶段进度 |
| 获取已学知识 | `GET` | `/api/learning/knowledge` | 知识列表 |
| 获取洞察 | `GET` | `/api/learning/insights` | 洞察列表 |
| 批准单个 | `PUT` | `/api/learning/queue/:id/priority` | 设置优先级为 90 |
| 跳过单个 | `PUT` | `/api/learning/queue/:id/skip` | 标记为跳过 |
| 批量批准 | `POST` | `/api/learning/queue/batch-approve` | 批量批准 |
| 上传文档 | `POST` | `/api/learning/upload` | 上传学习文档 |
| 文档列表 | `GET` | `/api/learning/documents/:userId` | 列出文档 |
| 文档详情 | `GET` | `/api/learning/document/:userId/:documentId` | 获取文档 |
| 删除文档 | `DELETE` | `/api/learning/document/:userId/:documentId` | 删除文档 |
| 搜索文档 | `GET` | `/api/learning/search/:userId?query=` | 搜索文档 |
| 从对话学习 | `POST` | `/api/learning/chat/:chatId` | 从对话中学习 |
| 从文档学习 | `POST` | `/api/learning/document/:documentId` | 从文档中学习 |

**数据存储**: 学习队列项存储在 `learning_queue` 表，学习进度存储在 `learning_progress` 表，知识存储在 `learned_knowledge` 表，文档存储在 `documents` 表。

### 7.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ loadData()
       └─ 并行请求 5 个 API（Promise.allSettled，各自独立错误处理）：
            ├─ GET /api/learning/queue → queueItems[]
            ├─ GET /api/learning/queue/stats → queueStats { pending, approved, learning, completed, skipped }
            ├─ GET /api/learning/progress → progress { phases[] }
            ├─ GET /api/learning/knowledge → knowledge[]（验证 Array.isArray）
            └─ GET /api/learning/insights → insights[]（验证 Array.isArray）
```

**学习队列 (Queue Tab)**：
```
统计卡片（5 列网格）：pending / approved / learning / completed / skipped 各状态计数
  ├─ 批量批准按钮：过滤 status === 'pending' 的项，POST /api/learning/queue/batch-approve { ids }
  │    └─ 成功后刷新 loadData()
  └─ 队列列表：
       ├─ 每项显示：knowledgeItem.content || content || id（截断）
       ├─ 优先级 + 置信度
       ├─ 状态徽章：getStatusBadge(status) → 颜色映射
       │    pending=黄, approved=蓝, learning=紫, completed=绿, skipped=灰
       └─ pending 状态项操作按钮：
            ├─ 批准 → PUT /api/learning/queue/:id/priority { priority: 90 }
            └─ 跳过 → PUT /api/learning/queue/:id/skip
```

**学习进度 (Progress Tab)**：
```
4 阶段进度条网格：
  └─ Phase 1 (Exploration 探索) → Phase 2 (Comprehension 理解) → Phase 3 (Application 应用) → Phase 4 (Mastery 掌握)
       ├─ 进度条宽度：completed=100%, active=50%, 其他=0%
       └─ 每阶段显示项数
学习来源分布（静态配置展示）：
  └─ 图连通性驱动 40% (蓝色) / 节点激活驱动 40% (紫色) / 近期输入驱动 20% (绿色)
```

**知识图谱 (Knowledge Tab)**：
```
knowledge 数组 → 2 列网格卡片
  └─ 每张卡片：
       ├─ 标题：content || topic || id
       ├─ 来源标签：source || '被动学习'（蓝色徽章）
       └─ 标签列表：tags 数组渲染为灰色徽章
```

**洞察 (Insights Tab)**：
```
insights 数组 → 垂直列表
  └─ 每条洞察：
       ├─ 灯泡图标（琥珀色）
       ├─ 主标题：insight || content
       ├─ 副标题：content
       └─ 时间戳：new Date(timestamp).toLocaleString()
```

**Store 交互**：此页面使用 `fetch()` 直接调用后端，不依赖 Pinia Store 或 `api/index.ts` 封装层。

---

## 八、页面 7：资料库 (Library)

**路由**: `/library` | **视图文件**: `views/LibraryView.vue` | **面板组件**: `panels/LibraryPanel.vue`

### 8.1 功能描述

本地资料库路径管理，配置索引目录，作为自学习系统的知识来源之一（占比 15%）。

### 8.2 Tab 结构

**单页面无 Tab**，包含以下功能区域：

- **索引统计卡片**：已配置路径数、已索引文件数
- **添加路径表单**：输入名称、分类、目录路径
  - 点击"确认"时先调用 `check-path` 验证路径存在性和可读性
  - 验证通过后调用 `addPath` 持久化
- **路径列表**：每条显示名称、路径、分类标签
  - 删除按钮：乐观删除 + 失败回滚

### 8.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取路径列表 | `GET` | `/api/library/paths` | 所有活跃路径 |
| 添加路径 | `POST` | `/api/library/paths` | 创建新路径 |
| 删除路径 | `DELETE` | `/api/library/paths/:id` | 软删除（active=0） |
| 检查路径 | `POST` | `/api/library/check-path` | 验证路径是否存在/可读/可写 |

**添加路径请求体**:
```json
{
  "name": "路径名称",
  "path": "/absolute/path",
  "category": "分类（如：文档、代码）",
  "description": "描述（可选）",
  "metadata": {}
}
```

**数据存储**: 路径配置存储在 `library_paths` 表中。

### 8.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ libraryApi.paths()
       └─ GET /api/library/paths
            └─ 返回 { paths: [...], count }
            └─ 映射为 PathEntry[] { id, name, path, category, description }
```

**添加路径流程**：
```
handleCheckPath()
  ├─ 1. 表单验证：name、path、category 三者必填，否则显示 "请填写完整信息"
  ├─ 2. libraryApi.checkPath(path)
  │    └─ POST /api/library/check-path { path }
  │         └─ 返回 { exists, isDirectory, isReadable, isWritable }
  │    ├─ !exists → pathError = "路径不存在"
  │    └─ !isDirectory → pathError = "路径不是目录"
  ├─ 3. libraryApi.addPath({ name, path, category, description })
  │    └─ POST /api/library/paths
  │         └─ 返回创建的路径对象 { id, ... }
  ├─ 4. 乐观更新：paths.value.push({ id, name, path, category })
  └─ 5. 关闭表单，清空输入
```

**删除路径**：
```
handleRemovePath(p)
  ├─ 1. 乐观删除：paths.value = paths.value.filter(x => x.id !== p.id)
  ├─ 2. libraryApi.deletePath(p.id)
  │    └─ DELETE /api/library/paths/:id（软删除，active=0）
  └─ 3. 失败时回滚：paths.value = prev
```

**Store 交互**：使用 `libraryApi` 封装层调用，不依赖 Pinia Store。

---

## 九、页面 8：Soul

**路由**: `/soul` | **视图文件**: `views/SoulView.vue` | **面板组件**: `panels/SoulPanel.vue`

### 9.1 功能描述

Soul（AI 人格/沉淀）管理，定义大类任务的底层沉淀策略，包括 System Prompt、Temperature 等。

### 9.2 Tab 结构

**单页面无 Tab**，包含以下功能区域：

- **新建表单**：名称、描述、分类（代码/写作/数据/通用）、System Prompt、Temperature（0-2）
- **Soul 卡片列表**：
  - 显示名称、描述、分类标签、Temperature
  - System Prompt 预览
  - 编辑按钮（展开内联编辑表单，修改后调用 API 保存）
  - 删除按钮

### 9.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取列表 | `GET` | `/api/config/soul` | 所有 Soul 配置 |
| 创建 | `POST` | `/api/config/soul` | 新建 Soul |
| 更新 | `PUT` | `/api/config/soul/:id` | 修改 Soul |
| 删除 | `DELETE` | `/api/config/soul/:id` | 删除 Soul |

**数据存储**: Soul 配置存储在 `souls` 表中，支持临时 Soul（`is_temporary=true`）和永久 Soul，通过滑动窗口评分机制决定临时 Soul 是否转正。

### 9.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ soulStore.loadFromServer()
       └─ GET /api/config/soul → 更新 soulStore.souls[]
```

**新建 Soul**：
```
addNew()
  ├─ 1. 构造 SoulItem { id: `soul-${Date.now()}`, name, description, category, prompt, temperature, createdAt }
  ├─ 2. soulStore.add(soul)
  │    └─ POST /api/config/soul { name, description, category, prompt, temperature }
  └─ 3. 重置表单，关闭新建面板
```

**编辑 Soul**：
```
startEdit(s)
  └─ editingId = s.id，editForm = { name, description, category, prompt, temperature }
       └─ 展开内联编辑表单（卡片下方）

saveEdit()
  └─ soulStore.update(editingId, { ...editForm })
       └─ PUT /api/config/soul/:id
```

**删除 Soul**：
```
remove(id)
  └─ soulStore.remove(id)
       └─ DELETE /api/config/soul/:id
```

**Store 交互**：`soulStore`（`stores/soul.ts`）提供 `souls`, `loadFromServer()`, `add()`, `update()`, `remove()`。

---

## 十、页面 9：Work

**路由**: `/work` | **视图文件**: `views/WorkView.vue` | **面板组件**: `panels/WorkPanel.vue`

### 10.1 功能描述

Work（方案）管理，定义具体细分方案沉淀，关联 Soul、绑定工具、配置 Prompt。

### 10.2 Tab 结构

**单页面无 Tab**，包含以下功能区域：

- **新建表单**：方案名称、描述、关联 Soul（下拉选择）、工具绑定（shell/api/browser/file/database 多选）、Work Prompt
- **Work 卡片列表**：
  - 显示名称、描述、关联的 Soul 名称、绑定的工具徽章
  - Work Prompt 预览
  - 编辑按钮（内联编辑，调用 API 保存）
  - 删除按钮（乐观删除 + 失败回滚）

### 10.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取列表 | `GET` | `/api/config/work` | 所有 Work 配置 |
| 创建 | `POST` | `/api/config/work` | 新建 Work |
| 更新 | `PUT` | `/api/config/work/:id` | 修改 Work |
| 删除 | `DELETE` | `/api/config/work/:id` | 删除 Work |

**创建请求体**:
```json
{
  "name": "方案名称",
  "description": "描述",
  "soulId": "关联的 Soul ID",
  "prompt": "Work Prompt 内容",
  "tools": ["shell", "api"],
  "userId": "default-user",
  "category": "分类",
  "workflow": [],
  "inputs": [],
  "outputs": []
}
```

**数据存储**: Work 配置存储在 `works` 表中。

### 10.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ loadWorks()
       └─ configApi.work.list()
            └─ GET /api/config/work → ConfigItem[]
            └─ mapWork() 映射：提取 id, name, description, soulId, prompt, tools, createdAt
                 ├─ soulId: item.soulId || item.soul_id || item.category
                 ├─ prompt: item.prompt || item.systemPrompt
                 ├─ tools: item.tools || item.boundTools，确保数组且元素为 string
                 └─ createdAt: 兼容 number/string 格式
```

**新建 Work**：
```
addNew()
  ├─ 1. configApi.work.create({ name, description, soulId, prompt, tools, userId, category, workflow, inputs, outputs })
  │    └─ POST /api/config/work
  │         └─ 必填后端字段：userId='default-user', category=soulId, workflow=[], inputs=[], outputs=[]
  ├─ 2. 乐观更新：created 返回有效时 push mapWork(created)，否则 reload loadWorks()
  └─ 3. 重置表单，关闭新建面板
```

**工具选择**：
```
toggleTool(form, tool)
  └─ 切换 tools 数组中的 tool（已存在则移除，不存在则添加）
  └─ 可用工具：shell, api, browser, file, database
```

**编辑 Work**：
```
startEdit(w)
  └─ editingId = w.id，editForm = { name, description, soulId, prompt, tools: [...w.tools] }
       └─ 展开内联编辑表单（卡片下方）

saveEdit()
  └─ configApi.work.update(editingId, { name, description, soulId, prompt, tools })
       └─ PUT /api/config/work/:id
       └─ 成功后更新本地 works 数组（mapWork(updated)）
```

**删除 Work**：
```
remove(id)
  ├─ 1. 乐观删除：works.value = works.value.filter(w => w.id !== id)
  ├─ 2. configApi.work.delete(id)
  │    └─ DELETE /api/config/work/:id
  └─ 3. 失败时回滚：works.value = prev
```

**Soul 关联显示**：
```
soulStore.souls.find(s => s.id === w.soulId)?.name || '无'
  └─ 从 soulStore 获取 Soul 名称显示在卡片上
```

**Store 交互**：`configApi.work.*` 封装层 + `soulStore`（仅用于获取 Soul 名称列表）。

---

## 十一、页面 10：Skill

**路由**: `/skill` | **视图文件**: `views/SkillView.vue` | **面板组件**: `panels/SkillPanel.vue`

### 11.1 功能描述

Skill（Agent 技能）管理，定义 Agent 行为模板、触发关键词、工具绑定、首选模型。

### 11.2 Tab 结构

**单页面无 Tab**，包含以下功能区域：

- **新建表单**：
  - 技能名称、描述
  - 触发关键词（标签式输入，回车添加）
  - System Prompt 模板
  - 绑定工具（Web Search / File System / Shell / API Call / Browser / Code Interpreter 多选，带图标）
  - 首选模型（下拉选择）
  - 启用/禁用开关
- **Skill 卡片列表**：
  - 启用/禁用开关（点击调用 API 持久化）
  - 显示名称、描述、关键词徽章、工具图标、System Prompt 预览
  - 首选模型、启用状态
  - 编辑按钮（内联编辑，调用 API 保存）
  - 删除按钮（乐观删除 + 失败回滚）

### 11.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取列表 | `GET` | `/api/config/skill` | 所有 Skill 配置 |
| 创建 | `POST` | `/api/config/skill` | 新建 Skill |
| 更新 | `PUT` | `/api/config/skill/:id` | 修改 Skill（含启用/禁用） |
| 删除 | `DELETE` | `/api/config/skill/:name` | 按名称删除 |
| 列表（独立） | `GET` | `/api/skill` | 独立 Skill 路由（带搜索） |
| 详情（独立） | `GET` | `/api/skill/:id` | 获取 Skill 详情 |
| 创建（独立） | `POST` | `/api/skill/create` | 独立创建 |
| 更新（独立） | `PUT` | `/api/skill/:id` | 独立更新 |
| 删除（独立） | `DELETE` | `/api/skill/:id` | 独立删除 |
| 切换（独立） | `POST` | `/api/skill/:id/toggle` | 启用/禁用切换 |
| 安装（独立） | `POST` | `/api/skill/:id/install` | 安装 Skill |
| 卸载（独立） | `POST` | `/api/skill/:id/uninstall` | 卸载 Skill |

**数据存储**: Skill 配置存储在 `skills` 表中，支持临时 Skill（`is_temporary=true`）和永久 Skill，通过滑动窗口评分机制决定转正。

### 11.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ loadSkills()
       └─ configApi.skill.list()
            └─ GET /api/config/skill → ConfigItem[]
            └─ mapSkill() 映射：提取 id, name, description, triggerKeywords, systemPrompt, boundTools, preferredModel, enabled, createdAt
                 ├─ enabled: item.enabled !== undefined ? Boolean(item.enabled) : Boolean(item.active)
                 ├─ triggerKeywords: 数组元素转 string
                 ├─ boundTools: 数组元素转 string
                 ├─ preferredModel: 默认 'auto'
                 └─ createdAt: 兼容 number/string 格式
```

**新建 Skill**：
```
addNew()
  ├─ 1. configApi.skill.create({ name, description, triggerKeywords, systemPrompt, boundTools, preferredModel, enabled })
  │    └─ POST /api/config/skill
  ├─ 2. 乐观更新：created 返回有效时 push mapSkill(created)，否则 reload loadSkills()
  └─ 3. 重置表单，关闭新建面板
```

**触发关键词管理**：
```
addKeyword(form)
  └─ 从 newKeywordInput 读取，去重后 push 到 form.triggerKeywords

removeKeyword(form, kw)
  └─ form.triggerKeywords = form.triggerKeywords.filter(k => k !== kw)
```

**工具绑定选择**：
```
toggleTool(form, toolId)
  └─ 切换 form.boundTools 数组中的 toolId
  └─ 可用工具（6 种）：webSearch, fileSystem, shell, apiCall, browser, codeInterpreter
       └─ 每种工具对应图标：Globe, FileText, Terminal, Search, Monitor, Code2
```

**编辑 Skill**：
```
startEdit(s)
  └─ editingId = s.id，editForm = { name, description, triggerKeywords: [...], systemPrompt, boundTools: [...], preferredModel, enabled }
       └─ 展开内联编辑表单（卡片下方）

saveEdit()
  └─ configApi.skill.update(editingId, { name, description, triggerKeywords, systemPrompt, boundTools, preferredModel, enabled })
       └─ PUT /api/config/skill/:id
       └─ 成功后更新本地 skills 数组（mapSkill(updated)）
```

**启用/禁用切换**：
```
toggle(id)
  ├─ 1. 乐观切换：s.enabled = !s.enabled
  ├─ 2. configApi.skill.update(id, { enabled: s.enabled })
  │    └─ PUT /api/config/skill/:id
  └─ 3. 失败时回滚：s.enabled = !s.enabled
```

**删除 Skill**：
```
remove(id)
  ├─ 1. 乐观删除：skills.value = skills.value.filter(s => s.id !== id)
  ├─ 2. configApi.skill.delete(target.name)  // 注意：按名称删除
  │    └─ DELETE /api/config/skill/:name
  └─ 3. 失败时回滚：skills.value = prev
```

**Store 交互**：`configApi.skill.*` 封装层，不依赖 Pinia Store。

---

## 十二、页面 11：MCP

**路由**: `/mcp` | **视图文件**: `views/MCPView.vue` | **面板组件**: `panels/MCPPanel.vue`

### 12.1 功能描述

MCP（Model Context Protocol）服务器管理，支持社区市场浏览安装和已安装服务器的管理。

### 12.2 Tab 结构

#### Tab 1: 社区市场 (Market)

- **搜索框**：按名称/描述/包名搜索 MCP 服务器
- **MCP 列表**：每个 MCP 显示名称、描述、包名
  - 安装按钮：未安装时显示"安装"，已安装显示"已安装"（绿色禁用）
  - 安装中显示加载动画

#### Tab 2: 已安装 (Installed)

- **新建表单**（可折叠）：名称、描述、命令、参数、环境变量
- **MCP 服务器列表**：
  - 启用/禁用开关（调用 API 持久化）
  - 服务器图标 + 名称 + 描述
  - 运行状态指示灯（绿=运行中，红=错误，灰=已停止）
  - 启动/停止按钮
  - 编辑按钮（内联编辑，调用 API 保存）
  - 删除按钮（调用 API 卸载）

### 12.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取市场 | `GET` | `/api/mcp/market` | MCP 社区市场列表 |
| 同步市场 | `POST` | `/api/mcp/market/sync` | 同步社区市场 |
| 市场详情 | `GET` | `/api/mcp/market/:id` | MCP 包详情 |
| 安装 | `POST` | `/api/mcp/market/:id` | 从市场安装 |
| 卸载 | `DELETE` | `/api/mcp/market/:id` | 从市场卸载 |
| 已安装列表 | `GET` | `/api/mcp/installed` | 已安装的 MCP |
| 列表（config） | `GET` | `/api/config/mcp` | config 路由下的 MCP 列表 |
| 安装（config） | `POST` | `/api/config/mcp/install` | config 路由安装 |
| 卸载（config） | `POST` | `/api/config/mcp/uninstall/:name` | config 路由卸载 |
| 更新（config） | `PUT` | `/api/config/mcp/:id` | config 路由更新 |

**数据存储**: MCP 配置存储在 `mcps` 表中，安装记录存储在 `mcp_installed` 表中。

### 12.4 处理逻辑

**页面生命周期**：
```
onMounted
  ├─ 1. configApi.mcp.list()
  │    └─ GET /api/config/mcp → ConfigItem[]
  │    └─ 遍历映射为 MCPItem[]：
  │         ├─ id: item.id || `mcp-${Date.now()}`
  │         ├─ name: 去重（同名跳过）
  │         ├─ config: 从 item.config 提取 command, args, env
  │         ├─ enabled: item.enabled !== false
  │         └─ status: 默认 'stopped'
  └─ 2. mcpMarketApi.market()
       └─ GET /api/mcp/market → { packages: [...], count }
       └─ 映射为 CommunityMCP[] { id, name: displayName||name, package: packageName, description, command:'npx', args: [packageName] }
```

**社区市场 (Market Tab)**：
```
搜索过滤：
  filteredCommunity — computed
    └─ 根据 searchQuery 过滤 name、description、package（大小写不敏感）

安装判断：
  isMCPInstalled(mcp)
    └─ 已安装列表中查找同名 || installedFromApi Set 中查找 package

安装流程：
  installCommunity(mcp)
    ├─ 1. 防重复：isMCPInstalled(mcp) 时直接返回
    ├─ 2. installing Set 添加 mcp.id（显示加载动画）
    ├─ 3. configApi.mcp.install({ name, version: 'latest', url: mcp.package })
    │    └─ POST /api/config/mcp/install
    ├─ 4. 成功：installedFromApi 添加 package，mcps 列表 push 新项
    └─ 5. installing Set 移除 mcp.id
```

**已安装 (Installed Tab)**：
```
新建 MCP：
  addNew()
    ├─ 1. 解析环境变量：envStr 按行分割 KEY=VALUE
    ├─ 2. configApi.mcp.install({ name, version: 'latest', url: command })
    │    └─ POST /api/config/mcp/install
    └─ 3. mcps 列表 push 新项，重置表单

启用/禁用切换：
  toggle(id)
    ├─ 1. 乐观切换：m.enabled = !m.enabled
    ├─ 2. configApi.mcp.update(id, { enabled: m.enabled })
    │    └─ PUT /api/config/mcp/:id
    └─ 3. 失败时回滚：m.enabled = !m.enabled

启动/停止（仅前端状态切换）：
  toggleStatus(id)
    └─ m.status = m.status === 'running' ? 'stopped' : 'running'
    └─ 注意：当前仅前端状态切换，无后端启停接口

编辑 MCP：
  startEdit(m)
    └─ editingId = m.id，editForm = { name, description, command, argsStr: args.join(' '), envStr: env 键值对换行 }

  saveEdit()
    ├─ 1. 解析 envStr → env 对象
    ├─ 2. configApi.mcp.update(editingId, { name, description, command, args, env, enabled })
    │    └─ PUT /api/config/mcp/:id
    └─ 3. 更新本地 mcps 数组

删除 MCP：
  remove(id)
    ├─ 1. configApi.mcp.uninstall(target.name)
    │    └─ POST /api/config/mcp/uninstall/:name
    └─ 2. mcps.value = mcps.value.filter(m => m.id !== id)
```

**Store 交互**：`configApi.mcp.*` + `mcpMarketApi.*` 封装层，不依赖 Pinia Store。

---

## 十三、页面 12：模型配置 (ModelConfig)

**路由**: `/models` | **视图文件**: `views/ModelConfigView.vue` | **Store**: `stores/config.ts` | **API**: `api/index.ts` (`configApi`)

### 13.1 功能描述

模型提供商和模型配置管理，支持 29 个预置提供商（OpenAI、Anthropic、Google、DeepSeek、智谱、通义千问、火山方舟等），API Key 管理，模型列表获取与同步，配额限制配置。

**核心表结构**：
- `provider_config` 表：存储模型提供商配置（提供商名称、API URL、API Key、启用状态、速率限制等）
- `provider_model` 表：存储模型提供商下的模型列表（从提供商 API 获取的模型，按 providerId 关联）
- `user_model_config` 表：存储用户配置的模型（用户勾选启用哪些模型，按 providerId 关联）

### 13.2 数据模型

**ModelConfigView 核心状态**：

```typescript
// 提供商列表（从后端加载，API Key 掩码显示，仅卡片信息不含 API Key）
const providers = ref<Provider[]>([])

// 两个独立弹窗，尺寸相同
const showProviderModal = ref(false)          // 提供商配置弹窗
const showModelModal = ref(false)             // 模型配置弹窗
const selectedProviderForModal = ref<string | null>(null)  // 当前编辑的提供商ID

// 获取最新模型
const fetchingModels = ref<Record<string, boolean>>({})    // 加载状态
const fetchModelsResult = ref<Record<string, { ok: boolean; message: string } | null>>({})

// 模型选择（复选框）
const selectedOnlineModelIds = ref<Set<string>>(new Set())
const savedModelsForProvider = ref<Record<string, Set<string>>>({})

// 默认速率配置（从后端获取）
const defaultRateConfig = ref<{ dailyTokens: number; weeklyTokens: number; monthlyTokens: number }>()

// Toast 通知
const toastMessage = ref('')
const toastVisible = ref(false)
const toastType = ref<'success' | 'error'>('success')
```

### 13.3 Tab 结构

#### 顶层 Tab 1: 当前模型 (Current Config)

展示用户已配置的模型列表（从 `user_model_config` 表读取），每行显示：
- 模型名称、提供商、最大 Token、支持视觉、支持工具
- 默认模型标识（星形图标）
- 操作按钮：设为默认/取消默认、删除

**功能**：
- 按列搜索（提供商、模型ID、模型名称）
- 按列排序（提供商、模型ID、模型名称、Token、调用次数指标）
- 设为默认模型（一个用户只能有一个默认模型）
- 删除模型配置（默认模型不允许删除）

#### 顶层 Tab 2: 模型列表 (Model List / Providers)

**提供商卡片网格**（3 列响应式布局）：
- 每个卡片显示：提供商名称、类型、端点（**仅卡片信息，不含 API Key**）
- 双状态指示灯：提供商配置状态（已配置API Key且启用=绿色 / 未配置=灰色）+ 模型配置状态（已配置模型=绿色 / 未配置=灰色）
- 搜索框：按名称/ID/类型过滤提供商
- 排序：启用的提供商优先，同名按字母排序
- 操作按钮：
  - **提供商配置**：打开提供商配置弹窗
  - **模型配置**：打开模型配置弹窗
  - **删除**：删除自定义提供商 / 重置默认提供商

**添加模型提供商按钮**：
- 点击弹出表单：选择名称、输入 Base URL、API Key
- 新建提供商默认为不启用（`enabled: false`）
- 保存后调用后端 `POST /api/config/provider` 持久化到 `provider_config` 表

### 13.4 提供商配置弹窗（独立弹窗）

两个弹窗（提供商配置、模型配置）为独立弹窗，尺寸相同（如 640x560）。

#### 提供商配置弹窗

- **API Key 输入框**：支持可见性切换（Eye/EyeOff 图标），掩码值不覆盖真实 Key
- **Base URL 输入框**：提供商 API 地址
- **启用/禁用开关**：保存到 `provider_config` 表
- **测试连接按钮**：点击后先保存配置到后端，再调用 `POST /provider/:id/test` 测试连接
- **速率限制配置**：默认值从后端配置接口获取（`GET /api/config/defaults`），支持每日/每周/每月 Token 和调用次数限制
- **保存按钮**：将提供商配置（含启用状态）保存到 `provider_config` 表
- **重置按钮**

**API Key 保护机制**：
1. 后端返回的 API Key 为掩码格式（`••••••••` + 后4位）
2. 前端 `saveProviderConfig` 保存时，掩码值的 Key 会被删除，不发送到后端
3. 后端 `PUT /provider/:id` 收到请求时，如果 apiKey 以 `••••` 开头则跳过更新

### 13.5 模型配置弹窗（独立弹窗）

两个弹窗（提供商配置、模型配置）为独立弹窗，尺寸相同（如 640x560）。

- **在线模型列表**（从 `provider_model` 表获取）：
  - 复选框批量选择模型
  - 全选/取消全选
  - 按名称/ID 搜索过滤
  - 复选框状态判断：模型是否已在 `user_model_config` 表中配置（已配置=勾选，未配置=未勾选）
- **获取最新模型按钮**：点击后触发完整流程（见下方），模型数据保存到 `provider_model` 表
- **手动添加模型**：手动输入模型 ID、名称、Token 数等参数
- **配额限制设置**：每个模型可设置独立的速率限制
- **模型连通性测试按钮**：测试已配置模型是否能正常调用
- **保存按钮**：将最终勾选的模型 ID 列表通过 `POST /model/batch` 批量更新到 `user_model_config` 表（不存在创建接口，仅批量更新）
  - 对比前后勾选差异：新增勾选的模型插入，取消勾选的模型删除
  - 需要传 `providerId` 参数

### 13.6 "获取最新模型" 完整流程

```
用户点击"获取最新模型"
  │
  ▼
1. saveProviderConfig() — 保存当前提供商配置到 provider_config 表（含启用状态、掩码 Key 保护）
  │
  ▼
2. configStore.fetchAndSyncModels(providerId)
  │  └─ POST /api/config/provider/:id/fetch-models
  │     └─ 后端根据 providerId 从 provider_config 表获取 baseUrl/apiKey
  │        └─ 调用提供商 /models 接口
  │        └─ 返回的模型列表保存到 provider_model 表（按 providerId）
  │
  ├─ code === 200（成功）
  │  ├─ 按钮左侧显示 msg（绿色"获取成功"）
  │  ├─ 不弹 toast
  │  └─ 调用 GET /api/config/provider/:id/models 刷新模型列表（从 provider_model 表读取）
  │
  └─ code !== 200（失败）
     ├─ 按钮左侧显示 msg（红色"获取失败"）
     └─ toast 弹窗显示 content（错误详情，不自动消失）
```

**关键细节**：
- `canFetchModels` 为 `computed`，实时响应 `modalProvider.apiKey` 变化
- 用户在"提供商配置"弹窗输入 API Key 后，打开"模型配置"弹窗时按钮自动启用
- 配置了模型后，提供商卡片上的模型配置状态指示灯显示绿色
- 错误详情以 toast 形式弹出，不自动消失，方便用户阅读长错误信息

### 13.7 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取完整配置 | `GET` | `/api/config` | 含提供商列表（API Key 掩码，仅卡片信息） |
| 获取默认配置 | `GET` | `/api/config/defaults` | 获取默认速率限制等配置 |
| 添加提供商 | `POST` | `/api/config/provider` | 新建提供商（默认不启用），保存到 `provider_config` 表 |
| 更新提供商 | `PUT` | `/api/config/provider/:id` | 更新 `provider_config` 表（含启用状态），掩码 Key 不覆盖真实 Key |
| 测试连接 | `POST` | `/api/config/provider/:id/test` | 先保存配置再测试连接 |
| 删除提供商 | `DELETE` | `/api/config/provider/:id` | 删除自定义/重置默认 |
| 获取最新模型 | `POST` | `/api/config/provider/:id/fetch-models` | 调用提供商API，结果保存到 `provider_model` 表，返回 `{code, msg, content}` |
| 获取提供商模型 | `GET` | `/api/config/provider/:id/models` | 从 `provider_model` 表获取已同步模型 |
| 获取模型配置列表 | `GET` | `/api/config/model` | 从 `user_model_config` 表获取，支持 `?userId=` 参数 |
| 批量保存模型配置 | `POST` | `/api/config/model/batch` | 根据最终勾选的模型ID列表更新 `user_model_config` 表（传入 providerId） |
| 更新模型配置 | `PUT` | `/api/config/model/:id` | 部分更新 `user_model_config` 表 |
| 设为默认 | `PUT` | `/api/config/model/:id/default` | 先清除其他默认 |
| 取消默认 | `DELETE` | `/api/config/model/:id/default` | 取消默认标记 |
| 删除模型配置 | `DELETE` | `/api/config/model/:id` | 删除记录 |
| 模型连通性测试 | `POST` | `/api/config/model/:id/test` | 测试已配置模型是否可调用 |

**数据存储**: 
- 提供商配置 → `provider_config` 表（含启用状态、API URL、API Key、速率限制）
- 提供商模型 → `provider_model` 表（按 providerId 关联，从提供商 API 获取）
- 用户模型配置 → `user_model_config` 表（按 providerId 关联，用户勾选的模型）

### 13.8 Store 架构

`stores/config.ts` 中的 `useConfigStore`：

```
providers: ref<Provider[]>()          // 提供商列表（仅卡片信息，不含 API Key）
selectedProviderId: ref<string>()     // 当前选中的提供商
selectedModelId: ref<string>()        // 当前选中的模型
isLoaded: ref<boolean>()              // 是否已加载
defaultRateConfig: ref<object>()      // 从后端获取的默认速率配置

// 核心方法
loadFromServer()                      // 从后端加载配置
saveProviderConfig(providerId, data)  // 保存提供商配置到 provider_config 表（含启用状态）
deleteProvider(providerId)            // 删除提供商
fetchAndSyncModels(providerId)        // 获取最新模型，保存到 provider_model 表
getProviderModels(providerId)         // 从 provider_model 表获取模型列表
testModelConnection(modelId)          // 测试模型连通性
canFetchModels(providerId)            // 判断是否可获取模型
getAllUserModels()                    // 获取所有用户模型配置
setDefaultUserModel(configId, modelId)  // 设为默认
unsetDefaultUserModel(configId)       // 取消默认
deleteUserModel(configId, modelId)    // 删除模型
```

### 13.9 API 层

`api/index.ts` 中的 `configApi`：

```typescript
configApi = {
  getConfig: () => fetchApi('/config'),
  getDefaults: () => fetchApi('/config/defaults'),
  provider: {
    create: (data) => fetchApi('/config/provider', { method: 'POST', body: ... }),
    update: (id, data) => fetchApi(`/config/provider/${id}`, { method: 'PUT', body: ... }),
    test: (id) => fetchApi(`/config/provider/${id}/test`, { method: 'POST' }),
    delete: (id) => fetchApi(`/config/provider/${id}`, { method: 'DELETE' }),
    fetchModels: (id) => fetchApi(`/config/provider/${id}/fetch-models`, { method: 'POST' }),
    models: (id) => fetchApi(`/config/provider/${id}/models`),
  },
  model: {
    list: (userId?) => fetchApi(`/config/model${userId ? '?userId=' + userId : ''}`),
    batchSave: (data) => fetchApi('/config/model/batch', { method: 'POST', body: ... }),
    update: (id, data) => fetchApi(`/config/model/${id}`, { method: 'PUT', body: ... }),
    delete: (id) => fetchApi(`/config/model/${id}`, { method: 'DELETE' }),
    setDefault: (id) => fetchApi(`/config/model/${id}/default`, { method: 'PUT' }),
    unsetDefault: (id) => fetchApi(`/config/model/${id}/default`, { method: 'DELETE' }),
    test: (id) => fetchApi(`/config/model/${id}/test`, { method: 'POST' }),
  },
  // ... 其他 API（llm, mcp, skill, soul, work）
}
```

**注意**: 不存在 `model.create` 接口，模型配置仅通过 `batchSave` 批量更新，根据最终勾选的模型 ID 列表对比差异进行增删。

---

## 十四、页面 13：用户画像 (Profile)

**路由**: `/profile` | **视图文件**: `views/ProfileView.vue` | **面板组件**: `panels/ProfilePanel.vue`

### 14.1 功能描述

用户画像分析与管理，展示动态维度、兴趣领域、标签。**不展示姓名、邮箱、电话等敏感信息。**

### 14.2 Tab 结构

**单页面无 Tab**，包含以下功能区域：

- **动态维度卡片**：6 个维度（基础属性、兴趣领域、行为模式、偏好设置、技能偏好、对话风格）
  - 每个维度显示置信度进度条
- **兴趣卡片**：Top 10 兴趣领域柱状图
- **标签管理卡片**：标签列表 + 添加/删除标签

### 14.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取画像 | `GET` | `/api/profile/:userId` | 用户画像数据（不含敏感信息） |
| 获取兴趣 | `GET` | `/api/profile/:userId/interests` | 兴趣领域 + 分数 |
| 添加标签 | `POST` | `/api/profile/:userId/tags` | 添加兴趣标签 |
| 删除标签 | `DELETE` | `/api/profile/:userId/tags/:tag` | 删除兴趣标签 |

**数据存储**: 用户画像存储在 `user_portraits` 表（维度 JSON），**不存储姓名、邮箱、电话等敏感个人信息**。

### 14.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ loadData()
       └─ Promise.allSettled 并行请求 2 个 API：
            ├─ profileApi.get(userId) → profile { tags, updatedAt, confidence }
            │    └─ GET /api/profile/:userId
            └─ profileApi.interests(userId) → interests[] { topic, score }
                 └─ GET /api/profile/:userId/interests
```

**标签管理**：
```
handleAddTag()
  ├─ 1. 空值检查：newTag.trim() 为空时返回
  ├─ 2. profileApi.addTag(userId, newTag.trim())
  │    └─ POST /api/profile/:userId/tags { tag }
  ├─ 3. 清空输入，loadData() 刷新

handleRemoveTag(tag)
  ├─ 1. profileApi.removeTag(userId, tag)
  │    └─ DELETE /api/profile/:userId/tags/:tag
  └─ 2. loadData() 刷新
```

**动态维度显示**：
```
6 个维度遍历：basic, interests, behavior, preferences, skills, style
  └─ 维度标签映射：dimensionLabels[dim]
  └─ 置信度进度条：宽度 = (profile.confidence || 0.5) * 100%
  └─ 置信度百分比：((profile.confidence || 0.5) * 100).toFixed(0) + '%'
```

**兴趣领域显示**：
```
interests 数组 → 垂直列表
  └─ 每项：topic 名称 + 进度条 + score 数值
  └─ 进度条宽度 = (interest.score / maxInterestScore) * 100%
  └─ maxInterestScore = Math.max(1, ...interests.map(i => i.score))
```

**Store 交互**：使用 `profileApi` 封装层，不依赖 Pinia Store。

---

## 十五、页面 14：设置 (Settings)

**路由**: `/settings` | **视图文件**: `views/SettingsView.vue` | **无独立面板，逻辑内嵌于视图**

### 15.1 功能描述

系统设置页面，管理数据路径、安全命令白名单。**不包含深色模式设置。**

### 15.2 Tab 结构

#### Tab 1: 通用设置 (General)

- **数据路径**：
  - 当前数据目录路径
  - 数据库路径（`dbPath`）
  - 向量数据库路径（`vectorDbPath`）
  - 图数据库路径（`graphDbPath`）
  - 迁移按钮（调用 `/api/config/migrate`）

#### Tab 2: 安全与授权 (Security)

- **检测到的操作系统**：自动检测（Windows/macOS/Linux）
- **安全命令**（绿色）：允许执行的命令列表
- **警告命令**（橙色）：需确认的命令列表
- **危险命令**（红色）：禁止执行的命令列表

#### Tab 3: 关于 (About)

- 版本信息：Brian Agent v3.0.0
- 技术栈信息

### 15.3 后端 API 调用

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 数据迁移 | `POST` | `/api/config/migrate` | 迁移数据目录 |

### 15.4 处理逻辑

**页面生命周期**：
```
onMounted
  └─ 无异步数据加载，页面为纯本地配置
```

**操作系统检测**：
```
detectedOS — computed
  └─ 检测 navigator.platform || navigator.userAgent
       ├─ /win/i → 'windows'
       ├─ /mac/i → 'macos'
       └─ 其他 → 'linux'

osLabel — computed
  └─ windows → 'Windows', macos → 'macOS', linux → 'Linux'
```

**命令策略分类**（基于 detectedOS 动态适配）：
```
safeCommands:
  Windows: dir, type, echo, date, whoami, findstr, cd
  Linux/macOS: ls, cat, head, tail, grep, find, pwd, echo, date, whoami, df, du, wc, sort, uniq

warnCommands:
  Windows: copy, move, mkdir, npm, pip, git, curl
  Linux/macOS: cp, mv, mkdir, touch, chmod, chown, npm, pip, git, docker, curl, wget, kill

dangerCommands:
  Windows: del, rmdir, format, shutdown, regedit
  Linux/macOS: rm, rmdir, dd, mkfs, shutdown, reboot, sudo, su, iptables
```

**数据路径迁移**：
```
startEditDataDir()
  └─ dataDirInput = './data', editingDataDir = true

handleMigrate()
  ├─ 1. POST /api/config/migrate { oldPath: './data', newPath: dataDirInput, type: 'dataDir' }
  └─ 2. editingDataDir = false
```

**Store 交互**：此页面不依赖 Pinia Store。

---

## 十六、数据存储原则

### 16.1 核心原则

**所有业务数据存储在后端，前端不进行本地持久化（除 UI 偏好外）。**

### 16.2 数据分类

| 数据类型 | 存储位置 | 说明 |
|---------|---------|------|
| 对话消息 | 后端 `user_messages` 表 | 所有用户问答永久保存 |
| 记忆数据 | 后端 `memory_nodes` + `memory_edges` + 向量 DB | 六层记忆体系 |
| 学习数据 | 后端 `learning_queue` + `learning_progress` + `learned_knowledge` | 自学习队列与进度 |
| 文档数据 | 后端 `documents` 表 | 上传的文档内容 |
| 资料库路径 | 后端 `library_paths` 表 | 资料库索引路径 |
| Soul 配置 | 后端 `souls` 表 | AI 人格配置 |
| Work 配置 | 后端 `works` 表 | 工作流方案 |
| Skill 配置 | 后端 `skills` 表 | Agent 技能 |
| MCP 配置 | 后端 `mcps` + `mcp_installed` 表 | MCP 服务器 |
| 模型配置 | 后端 `provider_config` 表（提供商）+ `provider_model` 表（提供商模型）+ `user_model_config` 表（用户模型配置） | 提供商与模型 |
| 用户画像 | 后端 `user_portraits` 表 | 画像数据（不含敏感信息） |
| 系统配置 | 后端 `system_config` 表 | 全局配置参数 |
| 统计数据 | 后端 `model_statistics` + `system_metrics` + `time_series` | 监控指标 |
| 调用链 | 后端 `call_traces` 表 | 追踪数据（保留 7 天） |
| 反馈数据 | 后端 `feedback` 表 | 用户反馈 |

### 16.3 前端 API 调用规范

- 所有后端通信通过 `frontend/src/api/index.ts` 中的 API 模块进行
- 使用 `fetchApi<T>()` 封装统一的错误处理
- 请求自动携带 `Content-Type: application/json` 头
- 通过 Vite 代理转发：前端 `/api/*` → 后端 `http://localhost:8000`

---

> *PRD 版本: v1.0*  
> *最后更新: 2026-07-16*  
> *状态: 已完成，所有页面已实现*