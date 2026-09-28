# 01 候选方案原理对比(_02_principle)

> 状态:reviewed　更新:2026-09-26
> 说明:本项目为存量项目反向补建。此处记录**既有实现所依据的原理选型**(为什么这么造),以及本次重构(R2/R3)候选方案的原理对比。

## A. 存量架构的原理依据(反向梳理)

### A1. 记忆召回:七路混合召回

- **原理**:单一向量检索召回质量不稳(时间漂移、口语化查询)。系统以 Info 条目为中心并联七路:钉选(Pin)→ 引用 → 时间线 → 标签图谱 → 向量 → 全文 → 随机回补,再由共现图/引文图补充关联。
- **能力边界**:本地 SQLite + LanceDB 规模(十万级条目)内毫秒~百毫秒;更大规模需迁移专门检索引擎。
- **风险与对策**:多路合并排序权重难调 → MatchCacheHelper/VectorMatchCache 缓存 + RankingParser 归一。

### A2. 执行引擎:Runtime v2「代码即编排」

- **原理**:放弃 DAG/workflow 引擎(v1 AgentExecution 阶段执行保留兼容),改用代码化的两级 ReAct/CoT 循环(AgentLoopService 外循环=轮次、内循环=单轮工具消费),Run 网关统一生命周期(submitRun/waitRun/steerRun/abortRun)。
- **能力边界**:单机串行 Lane 并发;不做分布式编排。
- **风险与对策**:循环失控 → IterationBudget 迭代预算;不可观测 → Metrics spans + Report 事件流。

### A3. 工具执行:Skill 一等工具 + 沙箱

- **原理**:用户代码在 isolated-vm V8 隔离堆中执行,宿主仅暴露受控原语;MCP server 包装为 `mcp_exec` 技能统一消费面。
- **能力边界**:V8 隔离堆不提供系统调用,需宿主桥接;CPU 密集任务受限。
- **风险与对策**:沙箱逃逸/死循环 → fail-fast + 超时;敏感动作 → waitPermission 人工闸门。

### A4. LLM 接入:零 SDK 策略族 + 事件流

- **原理**:自实现各供应商 HTTP 策略(OpenAI/Anthropic/Google/Ollama/VolcanoEngine),统一为事件帧流(LLMEventsRunner),上层只消费统一事件。
- **能力边界**:新供应商需新策略类;协议变更需跟随。
- **风险与对策**:单供应商故障 → 策略族 failover;配额 → LLMCoreProvider checkLLMQuota。

### A5. 可观测:五参签名 + AOP

- **原理**:方法统一 `(input, output, context, metrics?, report?)` 签名,Access 层经 `AopProxy.wrap` 统一织入进出入计时/日志;trace_id 贯穿三层库。
- **能力边界**:切面只覆盖 Access 入口;Service 内部依赖 spans 手动开启。
- **风险与对策**:观测开销 → 环形缓冲/老化(LogProvider)。

## B. 本次重构候选方案对比

### B1. 前端人性化改造路径(R2)

| 编号 | 方案 | 一句话原理 |
|---|---|---|
| S1 | 设计令牌先行 + 逐页迁移 | 先在 tailwind.config + 全局 CSS 建立 token(颜色/字号/间距/圆角/阴影/动效),再把各页硬编码样式收敛到 token |
| S2 | 引入组件库(Element/Naive UI)重写 | 以第三方组件库替换自研组件 |

**原理级对比**:S1 保持零依赖与既有 Vue 组件结构,风险集中在 CSS 层,可增量验证;S2 引入大依赖、破坏零依赖定位、组件行为变化回归面大。**结论:S1**。

### B2. 后端超长方法治理(R3)

| 编号 | 方案 | 一句话原理 |
|---|---|---|
| S1 | 巨型文件拆分模块 + 方法下沉 | dev-server.ts 按路由域拆成 Router 模块,组合根 buildContext 拆为各域 Container;>30 行方法按三分类下沉 |
| S2 | 只拆 >100 行 offenders | 仅对 Top12 超长方法做局部拆分 |

**对比**:S1 一次性消除 3200 行 createServer 的可读性黑洞,改动面大但以 _06 契约锚定路由行为,配合 typecheck+test 回归可控;S2 改动小但 dev-server 结构性恶化保留。**结论:S1 为目标、S2 为底线**,按任务卡渐进执行,每卡测试通过即提交。

### B3. 图数据删除与治理原理 (R5)

| 编号 | 方案 | 一句话原理 |
|---|---|---|
| G1 | 物理级联强删除 | 删除会话时，查出关联的标签/关键词，直接在图库中删除对应 Tag/keyword 节点 |
| G2 | 弱关联解除 + 异步修复学习孤儿清理 | 删除会话时只解除消息与标签的关联（删除 info 节点与关系表），保留 Tag/keyword 图节点；由修复学习任务安全扫描并清理 0 引用孤立节点 |

**原理级对比**:
- 知识图谱中同一个 Tag（如“TypeScript”）或关键词往往跨多个会话与消息共享。G1 会发生灾难性连锁反应，导致其他健康会话在图谱上的语义关联断裂。
- G2 遵循图数据库引用计数的安全原则：删除会话只解绑关系边，业务零破坏；再在图谱维护/修复学习中，通过聚合扫描识别“完全无消息关联（引用计数=0）”的纯孤立节点进行回收。**结论：G2 弱关联解除 + 修复学习清理**。

### B4. 会话 Token 全量记账原理 (R5)

| 编号 | 方案 | 一句话原理 |
|---|---|---|
| T1 | 局部 trace 聚合 | 从 `orchestration_work` 级联 `agent_execution_trace` 聚合 |
| T2 | 统一服务层记账流水聚合 | 基于 `LLMService` 在 `llm_call_log` 中沉淀的全量 session_id 流水聚合 |

**原理级对比**:
- T1 仅能捕获 Agent 核心执行循环（AgentLoop/AgentExecution）的消耗，漏掉了前置的 Skill 排名过滤、Soul 匹配、MCP 分析、Prompt 模板打分等 LLM 辅助消耗。
- T2 利用架构分层中 `LLMProvider` 作为所有大模型调用的唯一物理通道，其落账的 `llm_call_log` 具备 `session_id` 物理账本能力，聚合结果真实反映会话全生命周期成本。**结论：T2 统一服务层记账流水聚合**。

## 5. 结论

- 存量原理选型成立,反向登记为 _03 ADR 的事实依据。
- R2 前端走 **S1 设计令牌**;R3 后端走 **S1 渐进拆分**。
- R5 图数据治理走 **G2 弱关联解除 + 修复学习孤儿清理**；Token 计量走 **T2 全量流水聚合**；标题走**源头 8~12 字控制**。

