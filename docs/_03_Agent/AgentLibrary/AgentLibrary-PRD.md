# AgentLibrary（Agent 库）

## 1. 设计目标

1. **Agent 存储**：将构建完成的 WorkAgent 持久化到图数据库（Graph DB），支持完整 Agent 配置（含策略、LLM、Skill、MCP、Soul、强度、可靠性、反馈历史）的存取。
2. **Agent 检索**：支持按 agent_id 精确获取、全量列表、活跃 Agent 过滤，以及基于任务特征相似度的模糊检索，为上层 Agent 复用提供检索能力。
3. **遗忘曲线**：基于艾宾浩斯遗忘曲线原理，对 Agent 强度（strength）进行指数衰减，未使用的 Agent 强度随时间递减，低于阈值的 Agent 被归档，实现记忆的自然淘汰。
4. **反馈强化**：通过用户反馈（good/neutral/bad）对 Agent 强度进行正/负强化，并基于指数移动平均（EMA）更新可靠性（reliability）评分，驱动 Agent 自优化闭环。
5. **概率优化**：基于可靠性、反馈分布、使用频率计算优化概率，触发 Agent 版本优化；支持版本对比、采纳与回滚，保证优化方向可控。
6. **定时维护**：周期性扫描闲置 Agent（衰减强度）、高可靠高频 Agent（增强强度）、低强度 Agent（标记废弃），保持 Agent 库健康度。

---

## 2. 功能设计

### 2.1. 存储 Agent（storeAgent）

**功能**：将 WorkAgent 持久化到图数据库，初始化强度、使用次数、反馈历史、可靠性等统计字段，返回 agent_id。

**入参**：
- input：WorkAgent 配置（不含 id/createdAt/updatedAt，由库自动生成）
- context：会话上下文（session_id, work_id 等）
- output：输出对象，承载生成的 `agent_id`

**处理流程**：

1. 取当前时间戳，初始化统计字段：strength 默认 1.0、useCount 默认 0、lastUsedAt 默认当前时间、feedbackHistory 默认空数组、reliability 默认 0.5；
2. 调用 `storage.graph.createNode` 创建图节点（type=concept），将 Agent 配置序列化为 JSON 存入 content，metadata 记录 agentType=work、agentName、strategy，salienceScore 与 strength 同步；
3. 回写节点 id 到 content（替换临时 ID），调用 `storage.graph.updateNode` 更新；
4. 将节点 id 作为 agent_id 写入 output 返回；

**返回**：Boolean，表示 Agent 存储是否完成

---

### 2.2. 获取 Agent（getAgent）

**功能**：根据 agent_id 从图数据库获取 Agent 详情。

**入参**：
- input：agent_id
- context：会话上下文
- output：输出对象，承载 WorkAgent 实例（不存在时为空）

**处理流程**：

1. 调用 `storage.graph.getNode`，传入 agent_id；
2. 若节点不存在，output 返回空；
3. 解析节点 content 为 WorkAgent 对象，写入 output 返回；解析失败时返回空；

**返回**：Boolean，表示 Agent 获取是否完成

---

### 2.3. 查找相似 Agent（findSimilarAgent）

**功能**：基于任务特征相似度，从 Agent 库中检索最匹配的 Agent 列表，供调用方复用。

**入参**：
- input：任务特征对象（含 intent、complexity、domain、requiredCapabilities 等）
- context：会话上下文
- output：输出对象，承载按相似度降序排列的 WorkAgent 列表

**处理流程**：

1. 调用 `getAll` 获取全量 Agent；
2. 对每个 Agent，调用 `calculateSimilarity` 计算其 taskFeatures 与入参任务特征的相似度：
   - 键重叠得分（Key Overlap）：共同键数 × 2 / (键A数 + 键B数)；
   - 值相似度得分：对共同键，值完全相同得 1.0，否则按词级 Jaccard 相似度计算；
   - 综合得分 = 0.4 × 键重叠 + 0.6 × 平均值相似度；
3. 过滤相似度低于阈值 0.3 的结果；
4. 按相似度降序排序，写入 output 返回；

**返回**：Boolean，表示相似 Agent 查找是否完成

---

### 2.4. 删除 Agent（deleteAgent）

**功能**：根据 agent_id 从图数据库删除 Agent。

**入参**：
- input：agent_id
- context：会话上下文
- output：输出对象

**处理流程**：

1. 调用 `storage.graph.deleteNode`，传入 agent_id 删除图节点；

**返回**：Boolean，表示 Agent 删除是否完成

---

### 2.5. 应用遗忘曲线（applyDecay）

**功能**：对全量 Agent 应用遗忘曲线衰减，基于指数衰减公式更新 strength，低于阈值的 Agent 被归档。

**入参**：
- input：无（扫描全量）
- context：维护上下文
- output：输出对象，承载 `{ decayed, archived }` 统计

**处理流程**：

1. 调用 `getAll` 获取全量 Agent；
2. 对每个 Agent，调用 `calculateStrength` 计算衰减后强度：
   - 距上次使用天数 daysSinceLastUse = (当前时间 - lastUsedAt) / 天毫秒数；
   - 原始强度 rawStrength = INITIAL_STRENGTH(1.0) × exp(-DECAY_RATE(0.05) × daysSinceLastUse)；
   - 叠加反馈修正 feedbackModifier（feedbackHistory 累计 score）；
   - 最终强度限制在 [0.0, 1.0] 区间，保留 3 位小数；
3. 若新强度与原强度不同，调用 `update` 更新，decayed 计数 +1；
4. 若新强度低于休眠阈值 0.2，将强度置为最小值 0.0（归档），archived 计数 +1；
5. 将统计结果写入 output 返回；

**返回**：Boolean，表示遗忘曲线应用是否完成

---

### 2.6. 应用反馈强化（applyFeedback）

**功能**：对指定 Agent 应用用户反馈，更新反馈历史、强度（正/负强化）与可靠性（EMA），驱动 Agent 自优化。

**入参**：
- input：agent_id 与反馈对象 `{ rating: good|neutral|bad, score: number }`
- context：会话上下文（session_id, msg_id, interact_id 等）
- output：输出对象

**处理流程**：

1. 调用 `get` 获取 Agent，不存在则抛出异常；
2. 将反馈条目 `{ rating, score, timestamp }` 追加到 feedbackHistory；
3. **强度强化**：rating 为 good 时 strengthDelta = +0.1；bad 时 strengthDelta = -0.15；neutral 时不变化；新强度限制在 [0.0, 1.0]；
4. 调用 `evaluateReliability` 计算新可靠性：遍历反馈历史，近期反馈权重高（weight = exp(-0.1 × age_days)，约 10 天衰减），good 计 1.0、bad 计 0.0、neutral 计 0.5，加权平均；
5. 更新 Agent 的 strength、reliability、useCount（+1）、lastUsedAt（当前时间）；
6. 调用 `update` 持久化；

**返回**：Boolean，表示反馈强化应用是否完成

---

### 2.7. 优化 Agent（optimizeAgent）

**功能**：对 Agent 进行概率优化，保存当前版本作为快照，支持版本对比、采纳与回滚。

**入参**：
- input：agent_id
- context：优化上下文
- output：输出对象，承载待优化的 WorkAgent（由调用方通过 LLM 修改）

**处理流程**：

1. 调用 `shouldOptimize` 判断是否触发优化（基于 `calculateOptimizeProbability` 概率抽签）：
   - 基础概率 0.1；reliability < 0.5 时 +0.3；反馈既有 good 又有 bad 时 +0.2；7 天内使用过 +0.1；useCount > 10 且 reliability < 0.6 时 +0.2；上限 1.0；
2. 调用 `get` 获取 Agent；
3. 生成 version_id（UUID），将当前 Agent 状态标记 `_version` 与 `_previousVersion`，作为版本快照；
4. 调用 `storage.graph.createNode` 存储版本快照节点（metadata 标记 agentType=work_version）；
5. 返回原始 Agent 供调用方通过 LLM 修改 prompt/strategy/llm/skill/mcp/soul；
6. 调用方修改后，可通过 `compare` 对比原始与优化版本的 reliability，采纳更优者并 `update` 持久化；
7. 若优化效果不佳，可通过 `rollback` 按 version_id 回滚到历史版本；

**返回**：Boolean，表示 Agent 优化是否完成

---

### 2.8. 定时维护（maintenanceAgent）

**功能**：周期性扫描 Agent 库，执行闲置衰减、高可靠强化、低强度废弃标记，保持 Agent 库健康度。

**入参**：
- input：无（扫描全量）
- context：维护上下文
- output：输出对象，承载 `{ decayed, boosted, deprecated }` 统计

**处理流程**：

1. 调用 `getAll` 获取全量 Agent；
2. 遍历每个 Agent，计算距上次使用天数 daysSinceLastUse：
   - **闲置衰减**：daysSinceLastUse > 7 且 strength > 0 时，strength -= 0.05（下限 0.0），decayed 计数 +1；
   - **高可靠强化**：reliability >= 0.8 且 useCount >= 5 且 strength < 1.0 时，strength += 0.05（上限 1.0），boosted 计数 +1；
   - **废弃标记**：strength <= 0.2 时，deprecated 计数 +1（标记为休眠/废弃）；
3. 调用 `update` 持久化变更；
4. 将统计结果写入 output 返回；

**返回**：Boolean，表示定时维护是否完成

---

## 3. 重要内容

1. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；

---

## 4. 表设计

### 4.1. Agent 存储表

- 表名：`agent_library`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识（agent_id） | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话 ID | UUID | Y | 普通索引 | 关联会话 |
| name | Agent 名称 | VARCHAR(128) | N | | 如 agent-{timestamp} |
| task_features | 任务特征 | JSONB | N | | 含 intent/complexity/domain/requiredCapabilities |
| strategy | 执行策略 | VARCHAR(32) | N | | react / plan-execute / cot / conditional-graph / hybrid |
| llm_config | LLM 配置 | JSONB | N | | 含 providerId/modelId/temperature/maxTokens |
| prompt | 提示词配置 | JSONB | N | | 含 system/instruction |
| skill_ids | Skill ID 列表 | JSONB | Y | | 数组 |
| mcp_ids | MCP ID 列表 | JSONB | Y | | 数组 |
| soul_id | Soul ID | UUID | Y | 外键 | 关联 soul 配置 |
| strength | 强度（遗忘曲线） | DECIMAL(4,3) | N | | 范围 [0.0, 1.0]，默认 1.0 |
| use_count | 使用次数 | INTEGER | N | | 默认 0 |
| last_used_at | 最后使用时间 | timestamp | N | | |
| reliability | 可靠性（EMA） | DECIMAL(4,3) | N | | 范围 [0.0, 1.0]，默认 0.5 |
| feedback_history | 反馈历史 | JSONB | Y | | 数组，每项含 rating/score/timestamp |

### 4.2. Agent 反馈历史表

- 表名：`agent_feedback_history`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 更新时间 | timestamp | N | 普通索引 | |
| agent_id | 关联 Agent ID | UUID | N | 外键 | 关联 agent_library 表 |
| session_id | 会话 ID | UUID | Y | 普通索引 | |
| msg_id | 消息 ID | UUID | Y | | 触发反馈的消息 |
| interact_id | 交互 ID | UUID | Y | | |
| rating | 反馈评级 | VARCHAR(16) | N | | good / neutral / bad |
| score | 反馈评分 | DECIMAL(4,3) | N | | 范围 [0.0, 1.0] |
| work_id | 工作 ID | UUID | Y | | 关联工作 |

### 4.3. Agent 版本快照表

- 表名：`agent_version`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 更新时间 | timestamp | N | 普通索引 | |
| agent_id | 原 Agent ID | UUID | N | 外键 | 关联 agent_library 表 |
| version_id | 版本 ID | UUID | N | 唯一索引 | 本次快照唯一标识 |
| previous_version | 上一版本 ID | UUID | Y | | 用于版本链追溯 |
| agent_snapshot | Agent 快照内容 | JSONB | N | | 完整 WorkAgent 序列化 |
