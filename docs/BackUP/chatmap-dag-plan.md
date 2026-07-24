# ChatMap DAG 改造方案

> 状态：✅ 已全部实施完成（2026-07-19）
> 约束：**改动集中在 application 层（及必要的 access/schema 薄层），不侵入 core / infrastructure 业务逻辑**

## 背景与需求

「对话」页面 ChatMap 区重写为 canvas 风格 DAG 图，展示并控制用户/LLM 消息：

1. 每个节点 = 一条消息（用户输入 或 模型输出），不再是 exchange 级
2. 节点展示 summary（≤20 字，**LLM 语义生成**），支持「查看详情」看完整内容
3. 节点带复选框；勾选后发送消息时，上下文 = **选中消息 + 沿顺序边/引用边向上回溯的祖先传递闭包**（时间正序），选中节点以下的消息不进上下文 → 用户自主控制上下文
4. 边语义：**向下 = 顺序流；向右 = 引用**
5. 对话区 ↔ ChatMap 联动：点击对话区消息 → ChatMap **整体平移居中**（不改节点相对位置）；节点圆圈徽标显示 引用数/被引用数，点击徽标弹窗列出双方 summary，点击条目两侧同时定位并关闭弹窗
6. 复杂图连线美观：技术选型 = **Vue Flow（@vue-flow/core，MIT）+ dagre（@dagrejs/dagre，MIT）**；升级路径 elkjs
7. 涉及后端 / 数据表 / Agent 编排改造

## 现状关键事实（调研结论）

- 引用关系唯一持久化位置 = 用户消息 `metadata.selectedMessageIds`（JSON），无关系表，「被谁引用」无法高效查询
- `referenceCount` 字段死代码，恒为 0
- 既有 bug：`buildContext` 按行 `id` 匹配选中消息，`getExchanges` 按 `msg_id` 反解 → 两套 ID 混用
- 既有 bug：当前消息先落库再 buildContext → prompt 中重复出现
- 既有 bug：`getWorkingMemory` 返回 DESC 倒序未反转
- 前端无 selectedMessageIds 传参 UI；ChatMap 为 SVG+div 手工布局，无平移缩放

## 分层改动设计

| 层 | 文件 | 改动 |
|---|---|---|
| infrastructure | `database.ts` | 仅 schema：新建 `message_references(id, session_id, msg_id, referenced_msg_id, created_at, UNIQUE(msg_id, referenced_msg_id))` + 3 索引 + 存量 metadata 迁移回填 |
| core | `InformationService.ts` | 仅数据访问薄方法：`saveReferences / getReferencesBySession / getMessageByMsgId / getMessagesByMsgIds / updateMessageSummary / getMessagesNeedingSummary` |
| **application** | `ChatDagService.ts`（新增） | DAG 构建（节点+边+引用计数）、祖先闭包计算、引用记录、LLM 语义摘要生成与回填 —— 核心业务逻辑全在此 |
| application | `ChatService.ts` | buildContext 改用 ChatDagService 闭包；保存消息后记录引用 + 触发异步摘要；修三个既有 bug |
| access | `chatRoutes.ts` | 薄路由：`GET /chat/dag/:sessionId`、`GET /chat/message/:msgId` |
| frontend | 见下 | |

## 数据表

```sql
CREATE TABLE IF NOT EXISTS message_references (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  msg_id TEXT NOT NULL,             -- 发起引用的消息（用户消息）
  referenced_msg_id TEXT NOT NULL,  -- 被引用的消息
  created_at INTEGER NOT NULL,
  UNIQUE(msg_id, referenced_msg_id)
);
CREATE INDEX idx_msg_refs_session ON message_references(session_id);
CREATE INDEX idx_msg_refs_msg ON message_references(msg_id);
CREATE INDEX idx_msg_refs_referenced ON message_references(referenced_msg_id);
```

迁移：扫描 `user_messages.metadata` 含 `selectedMessageIds` 的行，解析后回填（referenced id 先按 msg_id 匹配，失配再按行 id 解析为 msg_id）。

引用数/被引用数 = `COUNT(*)` 实时查询，不写冗余列。

## 后端 API

- `GET /api/chat/dag/:sessionId?userId=`
  → `{ nodes: [{ msgId, exchangeId, role, summary, createdAt, messageIndex, referencesOut, referencesIn }], edges: [{ from, to, type: 'sequence'|'reference' }] }`
  summary 为空时 fallback `content.slice(0,20)`
- `GET /api/chat/message/:msgId`
  → `{ msgId, role, content, summary, createdAt, referencesOut[], referencesIn[] }`（含双向引用消息 summary 列表，供徽标弹窗）
- `/send`、`/stream`：保存用户消息后把 `selectedMessageIds` 写入 `message_references`（msg_id 维度）

## 上下文构建（buildContext 重写）

```
if (selectedMessageIds?.length) {
  context = ChatDagService.resolveAncestorContext()  // 选中 + 祖先闭包，msg_id 维度，message_index 正序
  // 不注入 workingMemory（避免稀释用户控制的上下文）
} else {
  context = workingMemory.reverse()  // 修倒序 bug
}
// 排除刚落库的当前用户消息（修重复 bug）
```

## LLM 语义摘要（≤20 字）

- `ChatDagService.generateAndSaveSummary(msgId, content)`：调默认模型 `chatCompletion`，prompt 约束 ≤20 字只输出概括；失败/超时 → `content.slice(0,20)` fallback；fire-and-forget 不阻塞响应
- 触发点：用户消息保存后、assistant 消息保存/流结束后
- 存量回填：服务启动后后台任务扫描 `summary='' OR length(summary)>20` 批量补生成（LLM 未配置则跳过）

## 前端改动

- 依赖：`npm i @vue-flow/core @dagrejs/dagre -w frontend`
- `ChatMap.vue` 重写：Vue Flow 画布（pan/zoom 内置）；dagre `rankdir=TB` **只用顺序边布局**（保持主链垂直干净），引用边渲染为节点右侧出/入的平滑虚线曲线（向右=引用）
- 自定义节点 `ChatMapNode.vue`：角色图标 + summary(≤20字) + 复选框 + 引用徽标（圆圈 引用/被引用 计数）
- store：`selectedMsgIds`、`dagNodes/dagEdges`、`loadDag()`、`focusMsgId`（居中信号）
- InputBox：发送带 `selectedMessageIds`，发送后清空；输入区显示已选数量
- 联动：
  - 对话区消息点击（MessageBubble 加 `data-msg-id`）→ `focusMsgId` → Vue Flow `setCenter()` 平移居中
  - 徽标点击 → 弹窗（`GET /chat/message/:msgId` 双向引用列表）→ 点击条目 → DAG 居中 + 对话区 `scrollToMessage` + 关弹窗
  - 节点点击 → 对话区滚动定位；assistant 节点保留 agent chain 入口
- 详情弹窗：节点「查看详情」→ 完整 content
- 流式 `done` 后 `loadDag()` 刷新

## TODO List（实施顺序）

- [x] 1. `database.ts`：message_references 表 + 索引 + 存量迁移
- [x] 2. `InformationService`：6 个数据访问薄方法
- [x] 3. `ChatDagService`：DAG 构建 / 祖先闭包 / 引用记录 / 摘要生成与回填
- [x] 4. `ChatService`：buildContext 重写 + 引用记录接线 + 摘要触发 + 3 个 bug 修复
- [x] 5. `chatRoutes` + `app.ts`：新路由与 DI 装配
- [x] 6. 后端测试：references 表、闭包、DAG API、摘要 fallback（17 单测 + 3 集成测试通过）
- [x] 7. 前端依赖安装 + api/store 扩展（@vue-flow/core@1.48.2 + @dagrejs/dagre@3.0.0）
- [x] 8. `ChatMap.vue` + `ChatMapNode.vue` 重写
- [x] 9. InputBox 选择发送 + 详情/引用弹窗
- [x] 10. 对话区 ↔ ChatMap 双向联动
- [x] 11. 前端 lint + vue-tsc 验证；vite build 通过；后端启动冒烟测试通过

## 实施结果备注

- 节点点击 = 对话区定位 + 打开 Agent 编排执行图（保留原有行为）；assistant 节点 Footer 也保留 GitBranch 入口
- **分支语义（exchange 级）**：通过勾选复选框发送的问答对（整个 exchange）不参与主序列链，仅通过引用边关联到被选中消息；分支 exchange 内部 user→assistant 仍保持顺序边。主链 = 无引用关系的自然对话流
- 分支节点在前端定位到被引用节点右侧（同 exchange 垂直排列）
- 详情/引用弹窗合并为一个 popup（两种模式），引用条目点击 → DAG 居中 + 对话区定位 + 关弹窗
- 流式 done 后同时刷新 loadExchanges + loadDag + loadChatHistory（后者让气泡获得真实 msgId 保证联动）
- dagre 仅主链顺序边参与布局（rankdir=TB），引用边右侧出/入虚线曲线渲染
- 既有失败测试（mcp/tools 3 个）与本改动无关，基线确认一致
