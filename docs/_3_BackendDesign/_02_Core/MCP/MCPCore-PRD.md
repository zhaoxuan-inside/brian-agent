# MCP Core

## 1. 设计目标

1. 根据工作为Agent匹配最佳的MCP；
2. 推动MCP的匹配优化；

## 2. 功能设计

### 2.1. 匹配MCP（matchMCP）

**功能**：为要处理的工作匹配所需要的 MCP。

**入参**：
- input：MatchMcpInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - context_id：交互上下文 ID
  - run_id：交互记录 ID
  - task_content：当前任务内容（无绑定时四层瀑布匹配的任务语义来源，2026-09-22 起必传）
  - bound_mcp_ids：调用方传入的既有绑定（传入时确定性水合，不再按任务重选）
  - bypass_cache：跳过匹配缓存
- context：McpCoreContext
- output：MatchMcpOutput，承载返回内容：
  - mcp_ids：匹配的 MCP ID 列表
  - mcp_details：匹配的 MCP 安装记录列表

**处理流程（四层瀑布，2026-09-22；无自建层 —— MCP 是常驻进程，无法即时生成即用）**：

1. **第 1 层 绑定水合**：`bound_mcp_ids` 非空 → 直接返回（绑定唯一事实源 = Agent 表 mcp_ids_json）；
2. **缓存命中水合**：MD5 + 任务向量两级缓存；正缓存命中 → 返回；**负缓存命中**（曾判定不需要 MCP）→ 返回空；
3. **第 2 层 LLM 需求判定与排序合并**（空库也判定，防闲聊任务触发市场安装）：
   - 渲染模板（"MCP 匹配推荐"，输出契约 `{"need": bool, "keywords": [...], "candidates": [{"id","score"}]}`）；
   - need=false → 写负缓存，返回空；
   - 本地命中（过 score_threshold）→ 正缓存返回；
   - 模板/LLM 失败 → 保守返回空（不写缓存、不触发市场获取，可重试）；
4. **第 3 层 提供商市场获取**（need=true 且本地无命中；`market_install_enabled` 可关）：
   - 遍历启用中的 `mcp_provider` → `listMcp` 拉市场清单（mcp_cache，TTL 内零 API 调用；单提供商失败跳过）；
   - LLM 对市场候选按任务排序（"MCP 市场匹配"模板，旧数组契约，取最高分）；
   - 命中 → `installMcp` 安装（npm 安装 + mcp_install 落库 enable=1）→ `startMcp` 启动（stdio 拉起进程 / http 远程注册，本次任务即可用；启动失败不回滚安装）→ 返回新 mcp_install id；
5. 全部无果 → 返回空。

### 2.2. 自动优化任务（optimizeMCP）

**功能**：优化MCP
**入参**：
- input：OptimizeMCPInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - interact_id：交互 ID
  - mcp_id：MCP ID
- context：OptimizeMCPContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：OptimizeMCPOutput（继承 Output），承载返回内容

**处理流程**：

1. 调用 RelationDBProvider.selectDB 根据 `agent_id` 查询 `agent_mcp` 表，获取当前 Agent 已绑定的 mcp_id 列表；
2. 遍历已绑定的 mcp_id 列表，判断入参中的 `mcp_id` 是否已存在于列表中：
   a. 若已存在：无需优化，直接返回 true；
3. 若 `mcp_id` 不在列表中（新匹配到的 MCP 需要绑定）：
   a. 调用 RelationDBProvider.insertDB 向 `agent_mcp` 表新增一条记录 `{ agent_id, mcp_id }`（利用 agent_id + mcp_id 联合唯一索引实现幂等）；
4. 返回 true 表示优化完成；

### 2.3. 配置（configMCPCore）

SET 行为：接受可选更新字段，仅更新传入的字段。返回更新后的当前配置。
**入参**：
- input：ConfigMcpCoreInput（继承 Input），包含以下字段：
  - regen_rate：重新选择MCP的概率（可选）
  - prompt_template_id：模板prompt ID（可选）
  - score_threshold / vector_similarity_threshold：排序采纳与向量命中阈值（可选）
  - match_cache_ttl_ms / match_cache_capacity：匹配缓存参数（可选）
  - market_install_enabled：提供商市场获取层开关（可选，默认 true，2026-09-22 新增）
- context：McpCoreContext
- output：ConfigMcpCoreOutput，承载返回内容：
  - config：当前生效的完整配置（含 market_install_enabled）

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `mcp_core_config` 表获取当前配置；
2. 若 `regen_rate` 非空：校验为 0-100 的整数，更新 regen_rate 字段；
3. 若 `prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中是否存在该 prompt_template_id，存在则更新，否则返回 false；
4. 若 `market_install_enabled` 非空：更新市场获取层开关（2026-09-22 新增）；
5. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `mcp_core_config` 表；

**返回**：更新后的当前配置（完整 McpCoreConfigRecord）

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. MCPCore配置表

- 表名：mcp_core_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| regen_rate | 重新匹配MCP的概率 | INTEGER | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |

### 3.2. AgentMCP关联表

- 表名：agent_mcp
- 库名：mcp

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | AgentId | UUID | N | 普通索引 | |
| mcp_id | 绑定的MCPId列表 | UUID | N | | |

注意：agent_id 和 mcp_id构成一个联合唯一索引

---

## 变更记录

### [2026-08-15] configMCPCore 增加参数校验

**变更原因**：`configMCPCore` 原先直接写入 `regen_rate` / `prompt_template_id`，缺少 PRD 2.3 节要求的校验。

**修改的方法**：
- `regen_rate`：校验 0-100 范围，越界抛 `ValidationError('regen_rate 必须在 0-100 之间')`。
- `prompt_template_id`：非空时通过 Base 层 `PromptsAccess.getPrompt` 校验模板存在性，不存在抛 `ValidationError('prompt_template_id xxx 不存在')`（等价于 PRD 要求的「校验 soPrompt 中是否存在」）。
- 测试用例同步：新增 `regen_rate` 越界/低于 0 拒绝、`prompt_template_id` 不存在拒绝用例；id 不硬编码，来自 SQLite 真实数据或 `IdGenerator.generate()`。

## 落地差异（2026-09-05 · 绑定收权）

Agent↔本模块组件的绑定关系收敛至 **Agent 模块 agent 表**（唯一事实源）：Core 的 agent_* 绑定表停止创建与读写；`match*` 为纯选择（Input 增 `bound_*` 传入既有绑定做确定性水合，不传则按任务选择，零持久化）；`opt*` 仅记 usage（键 (agent_id, component_id)，usage 表检测旧键自动重建）；`age*` 输出解绑候选（不删除）；绑定/解绑由 Agent 模块 `AgentLibrary.bindAgentComponent/unbindAgentComponent` 经评估链路（EvolutorAgent 评估 → AgentBuilder.optimizeAgent）执行。

### [2026-09-11] match 结果内存缓存 + 排序 max_tokens 上限（复盘 interact 9b68defe / 4f69b46b）

**变更原因**：同一 (agent, 任务) 的组件排序每轮都全量重跑 LLM，实测延迟变异 2.6s→9.3s→32.9s（provider 对 max_tokens 的约束不覆盖深度思考输出的变异性），单轮 run 启动期最长 61s；排列 prompt 还携带全量 skill_md 原文。

**修改的方法**：
  - `match*`（matchSoul / matchSkill / matchMCP）新增进程内存缓存：键 `agent_id|任务前缀(128字)`，TTL 10 分钟、容量 500（FIFO 淘汰）；`config*Core` 配置变更即清缓存。命中直接水合（`from_cache`/返回结构与原语义一致）。
  - matchSkill 排序 prompt 已摘要化（只带 name/skill_brief，命中后 enrichMatchedSkills 取全量）；matchMCP 排序新增 `max_tokens: 300`；MatchSkillInput / MatchMcpInput 新增 `task_content?: string`（AgentDefService 快照透传，供缓存键）。

**影响的端点**：
  - `POST /api/chat/stream` — 同 (agent, 同任务) 复现：预匹配 LLM 从 2 次串行（最坏 56s）降为 0 次；同句问答端到端 52s→5.2s。
