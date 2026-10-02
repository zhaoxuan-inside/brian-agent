# 02 模块间接口与数据模型(_06_interface_design)

> 状态:reviewed　更新:2026-09-30(chg-045 ADR-013)

## 1. 内部接口约定(全后端强制)

- **签名**:`(input: XxxInput, output: XxxOutput, context: XxxContext, metrics?: Metrics, report?: Report)`,基类 `brian-backend/Base/shared/base/`(Input/Output/Context/Metrics/Report)。

### Report 观测出口(ADR-013)

- **签名**:`report.emit(type: string, payload: unknown, ref?: EventRef): void` —— 执行侧唯一观测出口;`pushBusinessEvent/pushText/pushEvent(channel)` 已删除。
- **envelope**:EventDispatcher 组装 TaskEvent(run 内单调 seq/span 定格/parsePayload 归一),`ReportMeta.ref` 支持 `execute_id/part_id/msg_id/tool_call_id/permission_id` 关联。
- **flush**:`Report.flushObservability()` 等待事件落库+execute_event 写链(settle 收尾与 wire 重建前强制调用)。
- **总线**:`Base/ObservabilityProvider`(ObservabilityAccess/EventDispatcher/EventLogSink 50ms·200条批量/RunStateSink 平铺直更);StreamService 只剩 注册/心跳/写帧/关闭。
- **AOP**:Access 层统一经 `AopProxy.wrap(service, {logger})` 织入进出入计时与日志;业务内不手写埋点。
- **三分类**:方法归 orchestration(逻辑控制)/ data(数据处理)/ algorithm(通用算法),已由 `docs/method.idx.json`(2942 方法)全量归类,分片登记于 `_07_method_idx/`。
- **错误处理原则**: 方法体内严禁随意抛出异常（抛出 error 属于健壮性问题）；入参校验失败或资源未命中等业务失败必须通过设置 `output.error` 与 `output.error_code`，并 `return false`（仅系统致命崩溃或终态中断允许由全局框架/AOP 捕获处理）。
- **方法体长度**: 严格遵循 SOP 规定，每个方法体代码行数 ≤30 行。
- **跨模块调用**: 只经对方 `access/*Access.ts`,禁止直用 Service。
- **hierarchy**:dev-server(入口豁免)→ Access → Service → domain/infra。

## 2. 关键内部接口(节选,全量见 _07_method_idx 分片)

| 接口ID | 签名(缩写) | category | 层/模块 | 备注 |
|---|---|---|---|---|
| I-001 | `openChatStreamV2(input, output, context)` | orchestration | app/Chat | SSE 对话编排入口 |
| I-002 | `submitRun / waitRun / steerRun / abortRun / waitPermission / answerUserAsk` | orchestration | app/Runtime·Runs | Run 生命周期 |
| I-003 | `execAgentLoop(input, output, context)` | orchestration | app/Runtime·Loop | 两级循环 |
| I-004 | `execLLMEvents(input, output, context)` | orchestration | infra?Base/LLMProvider | 供应商事件流 |
| I-005 | `execSkill(input, output, context)` | orchestration | app/Runtime·SkillRuntime | 技能统一执行面 |
| I-006 | `matchAgentDef / matchAgent / matchSkill / matchLLM / matchMCP / matchSoul` | data | 各层匹配面 | 四层瀑布匹配 |
| I-007 | `saveInfo / vectorInfo / tagInfo / summaryInfo` | orchestration+data | Core/InfoCore | 记忆写入与召回 |
| I-008 | `execAgent / runPhases`(AgentExecution v1) | orchestration | Agent | 保留兼容 |
| I-009 | `evalWorkAgent / runEvaluationCycle` | orchestration | Agent/EvolutorAgent | 进化闭环 |
| I-010 | `execWrite / saveUserProfile` | orchestration | Agent/WriterAgent | 定稿与画像 |
| I-011 | `cleanOrphanGraphNodes(input, output, context)` | data | Core/InfoCore | 图修复学习:安全清理 0 消息关联孤立节点与边 |
| I-012 | `soSession(input, output, context)` | orchestration | Application/Chat | 会话检索与全量 Token/完整问答聚合 |
| I-013 | `matchLLM(input, output, context)` | data | Core/LLMCore | 支持 llm_type 隔离，过滤后为 0 返回 false 设 output.error，唯一可用直接命中免裁判 |
| I-014 | `matchAgentDef(input, output, context)` | orchestration | Runtime/Agents | 三级级联匹配（BM25粗筛短路、向量过滤、LLM裁判），候选瘦身防Prompt膨胀，禁用思考流，参数走配置中心 |
| I-015 | `generateComponentSemantics(input, output, context)` | orchestration | Base/shared/semantics | 六组件统一语义规范生成（名称/描述/正负范例），LLM 失败规则回退 |
| I-016 | `listMcpTools(input, output, context)` | orchestration | Base/MCPProvider | 已安装 MCP 工具清单拉取，逐工具生成并持久化 test_params_sample |
| I-017 | `soModelTokenStats(input, output, context)` | data | Base/LLMProvider | 按 llm_available_id 聚合 llm_usage_org 输入/输出 tokens |
| I-018 | `saveDialogEmbedding / matchDialogTopic` | data | Core/InfoCore | 轮次话题向量固化与会话话题匹配（chg-059，见 R11） |


## 3. 数据模型 Schema

权威 DDL:各模块 `infrastructure/*SchemaInitializer.ts`(启动时建表);三库物理布局见 _04/02 第 3 节。约定:
- **二分模型(ADR-012)**:记录数据表名 `xxx_record`(一行=一条事实/内容/定义),组织数据表名 `xxx_org`(一行=一条 id 关联/聚合);外部关联一律引用目标表 `id`,无冗余业务键列。
- **公共字段(所有表统一)**:`id(UUID,PK), trace_id(UUID,链路 id,定义/配置行置空), created, updated`;展示名 `title`、简介 `brief`、正文 `content`、地址 `url`。
- 配置类表统一带变更历史(history)与 diff。

### R7 记忆对话域三表（dialog_record / execute_record / context_org，接替 R6 命名）

1. **`dialog_record`**: `session_id, work_id, type('REQUEST'|'RESPONSE'), dialog(原文)`;摘要唯一归 `info_summary_record`(+summary_length),不再冗余 brief/length 列。
2. **`execute_record`**: `session_id, work_id, run_id, agent_id, exec_no, component_id, component_type, input, input_length, output, output_length, gap, status`;组件级流水唯一存储(rantime tool part 以 execute_id 关联,不再双写 I/O)。
3. **`context_org`**: `session_id, work_id, round(★轮次,0=会话级装配), dialog_id, type(pin/citing/timeline/…)`;按 (work_id, round) 保留每轮装配快照。

### R8 LLM 调用双表（计量与原文分离）

1. **`llm_call_record`**(计量): `llm_available_id, session_id, run_id, work_id, caller, model_title, model_type, input_tokens, output_tokens, duration_ms, status, error_code`。
2. **`llm_call_detail_record`**(原文 1:1): `llm_call_id(UNIQUE), llm_available_id, session_id, run_id, work_id, input, input_length, output, output_length`;全文上限 200,000 字符,raw_response 不入库。

### R9 TraceBase 统计契约（Base/TraceBase）

`TraceService.recordUsage(entityType(agent|soul|skill|mcp|prompt|llm|llm_provider), entityId, context{agent_id,work_id,run_id,session_id})` 写 `usage_event_record`(统一使用事件流水);日聚合落 `agent/soul/skill/mcp/prompt/llm/llm_provider_usage_org`(entity_id+usage_date 唯一;llm_provider 以 llm_provider_id 为 idColumn)。退役 agent_usage/agent_usage_daily/soul_core_usage/skill_core_usage/llm_core_usage/agent_mcp_usage;llm_core_usage 配额流已迁 usage_event_record(usage_context='llm_core.quota',LLMCoreService.checkLLMQuota/getUsageInRange 均改读事件流水)。

### R10 轮次组织表 run_round_org

`run_id, round, llm_call_id(→llm_call_record.id), assistant_message_id(→runtime_message_record.id)`;AgentLoopService 每轮落一行,思考全景按 id 组织还原每轮输入输出。


### 观测投影终态与阶段用量(R5 增补)

RunObservation(前端 shared reducer 投影,ADR-013)两项增补,数据全部源于 task_event_record 既有事件,后端零改动:

1. **四态终态**:`run.failed` 载荷含 `stop_reason`(`error` 执行失败 / `aborted` 用户中断,经 /chat/cancel → abortRun / `budget` 预算耗尽);reducer 落 `obs.stopReason`,前端 `observationPhase.ts` 统一映射标签与色调(成功=settled 绿、失败=error 红、中断/预算=warning 琥珀)。
2. **阶段用量 `obs.usageStages: {label, tokensIn, tokensOut, durationMs, calls}[]`**:reduceLlm 按 `llm.invoked.caller` 归组累计(组件选举/Agent 构建/主循环问答/子任务执行/执行评估/写作排版/会话摘要/其他调用,固定序 `usageStageRank`);前端 `buildUsageBars` 生成 Token 分布条与耗时分布条(耗时条含"其他"段=总耗时−Σ模型耗时)。

### 组件漏斗明细事件 component.funnel(T-B13)
Prompt/Soul/Skill/MCP/LLM 五类组件匹配服务在匹配终态经 Report 上报的结构化筛选明细事件,持久化于 `task_event_record`(ADR-013 起,原 stream_event 已删除);消费方为前端 shared reducer(`component.funnel` → RunObservation.funnels,弹窗"可信度"页签直读)。

1. **事件**: `BusinessEvent.ComponentFunnel = 'component.funnel'`;发射点: SkillCoreService.matchSkill / SoulCoreService.matchSoul / MCPCoreService.matchMCP / LLMCoreService.matchLLM / AgentBuilderService.matchPromptForAgent(经 `pushComponentFunnel` 统一发射,report 缺省时静默跳过)。
2. **负载契约**:
   - `component`: `'llm'|'prompt'|'soul'|'skill'|'mcp'`
   - `agent_id`: 触发匹配的 Agent
   - `detail`: 匹配终态(`funnel_bm25`/`funnel_vector`/`local_hit`/`judged_unneeded`/`cache_hit`/`single_candidate`/`generated` 等)
   - `mechanisms[]`: 按漏斗顺序 `mechanism: 'bm25'|'vector'|'llm'|'direct'`;`label` 展示名;`adopted` 该机制是否最终采纳命中;`candidates[]`(id/name/score/reason);`mechanism==='llm'` 时附 `prompt`(原始评估输入)与 `output`(原始输出判定);`mechanism==='direct'` 表示非漏斗直接事实(绑定/缓存/唯一候选),无打分漏斗过程。
3. **消费语义**: 分析器按 component 取 run 内最后一条事件;无事件组件(命中既有 Agent 复用场景)从 `selectedComponents` 合成「绑定事实源」direct 条目;假数据兜底已移除,无明细即空态。

### R7 统一组件语义规范与卡片 DTO（chg-057）

1. **语义规范常量**(`Base/shared/semantics/ComponentSemanticsGenerator`):名称 5-10 字(禁"助手/Agent"后缀)、描述 30-40 字(自然语言含输入定义+输出定义+功能定义,纯文本无标题符号)、正面/负面范例各 3-5 条且每条 ≤15 字。`ComponentSemantics = { title, brief, positive_examples[], negative_examples[] }`;`clampComponentSemantics` 规则强制收敛,`createSemanticsTaskFn(llmAccess)` 组合根注入(同 embedTaskFn 模式)。
2. **统一组件 DTO**(`shared/src/contracts/component-dto.ts`):`UniversalComponentDTO { id, title(5-10字), brief(30-40字), positive_examples[], negative_examples[], enabled, created, updated }`;专属 DTO 均继承之:`AgentInstanceDTO`(soul/prompt/llm/skills/mcps 构成 + thought_model/strategy)、`LLMModelDTO`(provider/max_tokens/llm_type: text|embedding|multimodal/usage_tokens{input,output,total})、`MCPInstanceDTO`(transport_type/status/tools[]{name,description,test_params_sample})、`SkillInstanceDTO`(scripts/references/assets/content)、`SoulInstanceDTO`(content)、`PromptTemplateDTO`(content/variables[])。
3. **DDL 增量**:`mcp_install_record.test_params_sample TEXT`(工具名→样例参数 JSON 映射,listMcpTools 时持久化);`llm_available_record.llm_type` 值域收敛 `text|embedding|multimodal`(vision 历史值启动迁移)。
4. **新路由**:`POST /api/mcp/:id/tools`(工具清单+样例);`POST /api/config/semantics/suggest`(AI 规范润色:任意组件意图 → 标准语义四元组);模型列表路由响应附 `usage_tokens`。
5. **语义路由裁决**(FunnelSelector,已落地):`S_pos = max(S_desc, max_P cos)`;`S_neg ≥ 0.85` 硬阻断 score=0;`0.70 ≤ S_neg < 0.85` 软惩罚 `S_pos×(1−S_neg)`;`S_final ≥ 90` 免 LLM 裁判直通。

### R11 轮次话题向量与会话亲和裁决（chg-059）

一个会话聊的大概率是同一话题：会话内沿用同一 Agent，避免每轮重新选举/构建 Agent 的耗时。向量模型存在时每轮固化话题向量，选举在"继续"等强信号之后、BM25/Embedding 相似度信号提取之前，先做话题连续性匹配裁决是否沿用。

1. **表 `dialog_embedding_record`**（DDL 见 _12）: `session_id, work_id(UNIQUE,=run_id), embedding(JSON), dimension`；每轮问答（run settle 前，fire-and-forget 不阻塞 SSE）由 RunGatewayService 将用户请求+系统回复拼接文本经 InfoCore `saveDialogEmbedding` 幂等落库；无向量模型/生成失败时静默跳过（优雅降级）。
2. **`saveDialogEmbedding(input{session_id, work_id, text}, output{saved, dimension, reason?})`**（data, Core/InfoCore）: 读 `info_vector_config_record` 取 embedding 模型 → 生成向量 → 按 work_id upsert（改模型后维度变化以最新一次为准）。
3. **`matchDialogTopic(input{session_id, query_text}, output{evaluated, best_similarity(0-100), matched_work_id, compared_rounds})`**（data, Core/InfoCore）: 请求文本生成向量 → 取该会话最近 20 轮向量（dimension 与当前向量一致才可比）→ cosine 取最大；无向量模型/无可比轮次 → `evaluated=false`。
4. **matchAgent 四层顺序**（Runtime/Runs `RunGatewayService.matchAgent`）:
   - ① `agent_ref` 显式指定 → 精准匹配（原逻辑不变）；
   - ② 会话亲和裁决 `decideSessionAffinity`（原 Session Affinity 升级）：
     a. 显式切换正则（切换/换一个/重置…agent）→ 不沿用，落 ④；
     b. **强信号续写**（`isContinuationRequest`，"继续/然后呢/go on…"）→ 直接沿用（0 向量开销）；
     c. **话题连续性匹配**（`matchDialogTopic`，阈值 cosine 0.70=70 分）→ `best_similarity ≥ 70` 沿用（mechanism `dialog_topic_match`）；`< 70` 判话题漂移 → 落 ④ 重新选举；`evaluated=false`（无向量模型/无轮次向量）→ 沿用（保持既有会话亲和行为）；
   - ④ 全量选举（BM25 + Embedding 相似度）→ 命中后 `persistSessionActiveAgent` 回写 `runtime_session_record.agent_def_id`。

## 4. 前端内部契约

- **路由表(页面路径即 API)**:`/`、`/chat`、`/info`、`/learning`、`/monitor`、`/config`、`/tool`、`/cron`;通配重定向 `/`;全部懒加载,`afterEach` 设置标题。登录为全局门禁(LoginPage,非路由)。
- **API 适配层**:`src/api/index.ts` 统一 `request()`(fetch + `/api` 前缀 + TRACE_ID header + 超时);**组件禁止裸 fetch**(T-F07 收敛 HomeView)。
- **SSE**:`useSSE` 解析 `data:` 帧;`chatStreamEvents` 分发 30+ 事件到 stores(session/chatUi)。
- **stores**:session(会话/消息/块)、chatUi(弹窗/意图/授权)、auth、theme(class 策略+localStorage `brian-theme`)、i18n。
- **设计令牌契约**(ADR-008):语义色/字号/z-index/遮罩/圆角/动效以 `tailwind.config.js` + `src/styles/globals.css` CSS 变量为单一事实源;组件内禁用裸 tailwind 原生色表达语义(禁 red-500/green-500/sky-* 等,应使用 error/success/info/warning 令牌);弹层一律经 ModalShell。
- **全站 Claude 暖色主题**(ADR-016,样式查阅入口 `brian-frontend/STYLE.md`):全局语义令牌值已整体 Claude 化——`brian-blue` 即品牌 coral(浅 #cc785c/深 #d98b70,CSS 变量驱动随明暗切换),`apple-gray` 暖灰阶梯,`apple-dark` 暖棕表面;圆角几何 xl=8px(按钮/输入)/2xl=12px(卡片)/3xl=16px(面板);浅色画布禁纯白(#faf9f5)、深色禁纯黑(#181715)。新页面/组件一律用语义令牌,样式复用查 STYLE.md。
- **对话页 Claude 主题族**(ADR-015,设计源 design-md/claude/DESIGN.md;supersede ADR-014 Linear 暗色-only):`chat` 颜色命名空间经 CSS 变量取值(`rgb(var(--chat-*) / <alpha-value>)`,透明度修饰符可用),浅色值定义于 `.theme-chat` 作用域、深色值于 `:root.dark .theme-chat`,**随顶栏明暗开关自动切换**;Teleport 弹层在 overlay 根补挂 `.theme-chat`。Header/PageBreadcrumb(`variant='chat'`)与 ModalShell/ConfirmDialog(`variant='chat'`)默认渲染路径不变。语义映射:主操作/品牌/引文→coral primary,钉住/星级/评估/停止→warning 琥珀,success/warning/error 三语义色齐备。**运维注意:tailwind.config.js 变更(增删令牌/改名)必须重启前端 dev server 才生效,否则 globals.css 的 @apply 编译 500 导致整页白屏。**

## 5. 接口演进规则

- 接口变更同步更新本文件与 `_07_method_idx` 分片;不兼容变更走 deprecated + replaced_by。
- 前端组件 API 变更在组件 JSDoc 注明;新增页面必须登记路由表并接入令牌契约。

## R8 统一选举引擎契约 (chg-058)

六组件选举统一走 `runComponentElection(adapter, input, output)` 模板方法(`Base/shared/election/`),组件实现 `ComponentElectionAdapter<T>`:

| 钩子 | 职责 | 六组件实现差异 |
|---|---|---|
| `findReusable` | ①复用判定:续写请求(isContinuationRequest)/绑定事实源/匹配缓存(regen_rate 门控)/签名精确相等(Agent) → 直命中已有组件 | MCP=绑定+缓存+负缓存;Skill=绑定+缓存(路由层);Soul=绑定+缓存(路由层);LLM=agent_record.llm_id 绑定;Prompt=无;Agent=agent_ref 显式指定+签名精确相等 |
| `extractSignals` | ②并行(Promise.all)信号提取:合法候选集、BM25 候选集(≥阈值)、向量正例候选集(综合向量分≥阈值)、向量正例范例集(Max-Sim≥阈值)、向量反例候选集(Sim_neg≥阈值)、结构候选集(复杂度) | MCP/Skill/Soul/Prompt=BM25+语义路由双通道(正负范例);LLM=BM25+描述向量(无范例表);结构信号暂全弃权(空集),Agent 策略复杂度区间为后续任务卡 |
| `tiers` | ③分级候选集阶梯(数据驱动表达式):`standardTierLadder()`=T1(结构∪向量正例)−反例→T2(结构∪正例范例)−反例;`fullTierLadder()`(LLM 专属)追加 T3 结构−反例/T4 结构/T5 正例范例/T6 BM25−反例/T7 全量−反例 | Skill/MCP=standard 且 multiSelect=true(整集采纳);其余单选择优;LLM `directAdoptSingle=true`(3.1.1 唯一合法候选直采) |
| `select` | 阶梯命中采纳:写回组件输出+绑定/缓存 | LLM 写 agent_record.llm_id;MCP/Skill 提交匹配缓存 |
| `exhaust` | ④终端动作 | Agent=构建新 AgentDef;Prompt=按任务生成新模板入库;Soul=大模型动态生成;Skill=LLM 裁判+外部来源;LLM=默认模型;MCP=空集+负缓存(市场安装不在选举中自动触发) |

- 综合得分:`compositeScore = vectorWeight×向量分 + bm25Weight×BM25分`(默认 0.7/0.3)。
- 阈值:`DEFAULT_ELECTION_THRESHOLDS`(bm25 90 / vectorOverall 80 / vectorExample 80 / vectorNegative 85 / 权重 0.7·0.3),经 `election_config_record.thresholds_json` 按组件覆盖;组件既有 config 字段(MCP score_threshold/vector_similarity_threshold、LLM score_threshold)映射为基础层;API:`GET/PUT /api/config/election/:component`。
- 语义消歧备忘:'向量整理候选集'并入'向量正例候选集';'向量范例候选集'(规格 3.1.4)按'向量反例候选集'理解;纠正只需改阶梯表达式数组,不动引擎。
- Trace:信号机制仍登记 `bm25`/`vector` 明细(含 funnelNegativeReason 拒因),阶梯命中与复用经 `addDirect(label)` 上报,思考弹窗组件选举可见。
