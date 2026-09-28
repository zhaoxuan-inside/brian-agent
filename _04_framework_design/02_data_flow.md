# 02 数据流与调用流(_04_framework_design)

> 状态:reviewed　更新:2026-09-26

## 1. 核心数据流:一次对话(SSE)

```mermaid
sequenceDiagram
    participant FE as 前端
    participant DS as dev-server
    participant CH as ChatService
    participant RG as RunGateway
    participant LP as AgentLoop
    participant LL as LLMProvider
    participant SR as SkillRuntime
    participant IC as InfoCore
    FE->>DS: POST /api/chat/stream
    DS->>CH: openChatStream(SSE 头+StreamAccess.registerStream)
    CH->>CH: 自动标题/会话溢出检查
    CH->>IC: saveInfo(REQUEST 用户消息)
    CH->>RG: submitRun
    RG->>RG: matchAgentDef(AgentDef 向量+规则)
    RG->>LP: execAgentLoop
    loop 每轮(IterationBudget 预算内)
        LP->>LL: execLLMEvents(事件帧流)
        LL-->>LP: content / tool_calls 帧
        LP->>SR: execSkill(沙箱 / mcp_exec / 原语)
        SR-->>LP: 结果
        opt 敏感动作
            LP->>RG: waitPermission
            RG-->>FE: SSE 权限问答帧
            FE->>DS: POST /api/chat/permission/answer
        end
        LP->>LP: persistAssistantTurn/addPart
    end
    LP->>RG: settleRun
    RG-->>CH: waitRun 返回
    CH->>IC: syncRuntimeMessagesToInfoRaw(记忆回写)
    CH-->>FE: SSE done 帧
    DS->>DS: closeStream / res.end()
```

副链:WriterAgent.execWrite(定稿)→ UserProfile.saveUserProfile(画像);EvolutorAgent 评估(评估→淘汰→重建);SummaryAgent 生成摘要/标题。

## 2. 主调用链(节点标注)

```text
POST /api/chat/stream(dev-server,入口豁免)
→ ChatAccess.openChatStream(Access,AOP 织入)
→ ChatService.openChatStreamV2(orchestration)
  → SessionAccess.addSession(Runtime/Session)
  → RunGatewayAccess.submitRun(Runtime/Runs)
  → AgentDefAccess.matchAgentDef(Runtime/Agents)
  → LoopAccess.execAgentLoop → AgentLoopService.runOuterLoop/runInnerLoop
    → callLLMTurn → LLMAccess.execLLMEvents → LLMEventsRunner → 供应商 Strategy
    → consumeToolCalls → SkillRuntimeAccess.execSkill
  → RunGatewayAccess.waitRun
  → InfoCoreAccess.saveInfo / syncRuntimeMessagesToInfoRaw(Core/InfoCore)
```

## 3. 数据模型概览

| 实体 | 关键字段 | 存储 | 归属模块 |
|---|---|---|---|
| info(记忆) | id/type(REQUEST/TRACE/…)/content/tags/vector | brian.db + vectordb | Core/InfoCore |
| chat_session / chat_message | session_id/title/pin/日期 | brian.db | Application/Chat |
| runtime_session / runtime_message / runtime_message_part | run_id/role/part(json) | brian.db | Runtime/Session |
| agent_def / agent(库) | snapshot(tools[]: kind skill\|mcp)/向量 | brian.db + vectordb | Runtime/Agents、Agent/AgentLibrary |
| skill / mcp_server | 入口/sandbox/市场元数据 | brian.db | Base/Skill·MCPProvider |
| llm 配置与用量 | provider/quota/tokens | brian.db | Base/LLMProvider、Core/LLMCore |
| 日志(老化) | level/trace_id/meta | brian_log.db | Base/LogProvider |
| 图(共现/引文/消息图) | node/edge | graph.db(leangraph) | Core/InfoCore、Application/Visualization |
| 书签树 | folder/item | brian.db | Base/BookmarkProvider |
| cron 任务 | 表达式/运行记录 | brian.db | Base/CronProvider |
| 反馈 | analysis/过程日志 | brian.db | Base/FeedbackHandler |

(完整字段以各 `*SchemaInitializer` DDL 为权威,见 _06/02 数据模型。)

## 4. 容量与扩展假设

- 预期:单用户本地使用,记忆条目十万级、消息百万级内流畅;SQLite WAL 单写者满足单人交互负载。
- 边界:多用户并发/跨机部署超出现有假设(非目标);向量库换型或检索量大时迁移专门引擎(见 _02 A1)。
- 观测开销:AOP 切面仅 Access 层,spans 环形缓冲,日志老化由 LogProvider 承担。

## 5. R5 历史会话聚合与全量 Token 数据流

```mermaid
sequenceDiagram
    participant FE as 前端 (HistoryTab)
    participant DS as dev-server (/api/chat/list)
    participant CS as ChatService
    participant RD as SQLite (brian.db)
    FE->>DS: GET /api/chat/list?page_current=1&page_size=20
    DS->>CS: soSession(input, output, context)
    CS->>RD: 分页查询 chat_session (获取 session_id, session_title, created)
    CS->>RD: 查询 llm_call_log: SUM(input_tokens), SUM(output_tokens) WHERE session_id IN (...)
    CS->>RD: 查询 dialog: 统计同时具有 REQUEST 与 RESPONSE 的完整轮数及字符总数
    CS->>RD: 查询 info_tag: 聚合每个 session_id 的 tags
    CS-->>DS: output.sessions (含 created, token, qaCount, chars, tags)
    DS-->>FE: JSON (含 createdTime, inputTokens, outputTokens, qaCount, questionChars, answerChars, tags)
    FE->>FE: 渲染卡片 (8~12字标题、创建时间、总Token、完整问答数、总字符数、前4标签+更多按钮)
```

## 6. R5 会话彻底删除与图数据弱关联解除数据流

```mermaid
sequenceDiagram
    participant FE as 前端 (HistoryTab)
    participant CS as ChatService
    participant IC as InfoCoreService
    participant RD as SQLite (brian.db)
    participant GD as GraphDB (graph.db)
    FE->>CS: DELETE /api/chat/session/:sessionId
    CS->>RD: 删除 llm_call_log (session_id = ?) 全量 Token 流水
    CS->>RD: 删除 orchestration_work / agent_execution_trace
    CS->>RD: 删除 runtime_run, runtime_session, runtime_message, stream_event
    CS->>IC: delInfoBySession(sessionId)
    IC->>RD: 删除 info_tag, info_keyword, info_summary, info_vector 关联
    IC->>GD: 删除 info 消息节点及 CITATION 引用边 (弱关联解绑，保留 Tag / keyword 实体节点)
    IC->>RD: 删除 dialog / execute / context 消息与执行记录
    CS->>RD: 删除 chat_session 会话主记录
    CS-->>FE: 200 OK (会话及全量数据已彻底清除，图谱共享节点保持完好)
```

## 7. R5 图节点修复学习孤儿清理数据流

```mermaid
sequenceDiagram
    participant SCH as 调度/修复学习
    participant IC as InfoCoreService
    participant RD as SQLite (brian.db)
    participant GD as GraphDB (graph.db)
    SCH->>IC: cleanOrphanGraphNodes() / rebuildCooccurGraph()
    IC->>GD: 查询所有 Tag 节点 (node_type='Tag')
    IC->>RD: 检查每个 tag 是否在 info_tag 中存在
    opt 若在 info_tag 中引用数为 0
        IC->>GD: 删除该孤立 Tag 节点及相连 cooccur 边
    end
    IC->>GD: 查询所有 keyword 节点 (node_type='keyword')
    IC->>RD: 检查每个 keyword 是否在 info_keyword 中存在
    opt 若在 info_keyword 中引用数为 0
        IC->>GD: 删除该孤立 keyword 节点及相连 keywordCooccur 边
    end
    IC-->>SCH: 返回清理孤立节点与孤立边数量
```

## 8. R6 消息三表重构与复选框上下文时序回溯数据流

```mermaid
sequenceDiagram
    participant FE as 前端 (ChatArea/InputBox)
    participant CS as ChatService
    participant IC as InfoCoreService
    participant RD as SQLite (brian.db)
    
    FE->>CS: POST /api/chat/stream { selected_msg_ids, pinned_msg_ids, msg_content }
    CS->>IC: context(input: { selected_msg_ids, session_id, work_id })
    IC->>RD: 查询 dialog 表提取 selected_msg_ids -> citingCandidates
    IC->>RD: 根据选中消息 work_id 查 context 表 -> 反查历史上下文 dialog_id
    IC->>RD: 查询 dialog 表批量获取历史消息 (created ASC) -> timelineCandidates
    IC->>RD: 将当次问答上下文快照写入 context 表 (work_id, dialog_id, type)
    IC-->>CS: 返回组装好的全维度上下文
    CS->>RD: 问答完成，用户问题与助手回答写入 dialog 表
    CS->>RD: 执行内部步骤（LLM/Skill/MCP）写入 execute 表 (含 exec_no, gap, input/output)
    CS-->>FE: SSE 推送问答流与组件执行完成事件
```


