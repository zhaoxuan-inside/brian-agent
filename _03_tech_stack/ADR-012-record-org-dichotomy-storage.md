# ADR-012: 关系数据「记录/组织」二分存储模型与全量规范化

- 状态: accepted
- 日期: 2026-09-30
- 关联: 取代 ADR-010 的命名层（三表职责不变），ADR-009 Token 计量延伸

## 背景

数据流经多轮迭代后表名语义不一（dialog/execute/context/llm_call_log/runtime_* 等），业务键与主键混用（agent_id/feedback_id/library_id 等），统计写入散落各模块（llm_usage/agent_usage/soul_core_usage 等六套），LLM 调用未存原文导致思考全景无法回放真实 Prompt。

## 决策

### 1. 二分模型（判定规则）

- **记录数据 `xxx_record`**：一行 = 一条内容/事实/定义本身（原文、流水、定义、结论、配置项）；删除该行即丢失该事实。
- **组织数据 `xxx_org`**：一行 = 一条 id 关联/索引/聚合关系；删除该行不影响被指向的记录。
- 歧义裁决：数据通过 id 指向别的表 → org；内容本身就是价值 → record。FTS/倒排等派生索引 → org；向量/标签内容行 → record。

### 2. 公共字段规范（所有表统一）

`id(UUID, PK)、trace_id(UUID, 链路 id，定义/配置行置空)、created(TIMESTAMP)、updated(TIMESTAMP)`；原业务列中的 trace_id（dialog/execute/llm_call_log/runtime_run/log_record 等）并入公共列。外部关联一律引用目标表 id，废除 agent_id/feedback_id/process_id/library_id/file_id/task_id/strategy_id/eval_id 等冗余业务键列。

### 3. 列命名规范

展示名统一 `title`、简介统一 `brief`、正文统一 `content`、地址统一 `url`、长度统计列 `<col>_length`；LLM 调用拆双表：`llm_call_record`（计量）+ `llm_call_detail_record`（原文 1:1，全文上限 200,000 字符，raw_response 不入库）。

### 4. TraceBase 模块

Base 层新增 `TraceBase`（DDD 四层）：统一统计入口 `TraceService.recordUsage(entityType, entityId, context)` 写 `usage_event_record`（统一使用事件流水），日聚合落 `agent/soul/skill/mcp/prompt/llm_usage_org`；退役 agent_usage、agent_usage_daily、soul_core_usage、skill_core_usage、llm_core_usage、agent_mcp_usage 六套散落统计。

### 5. 轮次级组织

`context_org` 增加 `round` 列，按 (work_id, round) 保留每轮装配快照；新增 `run_round_org`（run_id, round, llm_call_id, assistant_message_id）组织每轮调用与消息；思考全景分析层按 id 组织还原，stream_event_record 降级为纯审计（payload 全文为冗余副本，以 org 表为唯一事实源）。〔chg-045 更新：该表已由 `task_event_record` 取代，见 ADR-013〕

### 6. 去重裁决

- runtime_message_part 的 tool part 不再存 input_json/output_json，改存 `execute_id` 关联 execute_record（工具 I/O 唯一源）。
- dialog_record 去 dialog_brief/dialog_length（摘要唯一归 info_summary_record + summary_length）。
- 对话原文在 runtime_message_record（runtime 回放域）与 dialog_record（记忆装配域）双写，登记为跨域同步冗余。
- mcp_install 去 status（运行状态实时探测）；provider_code 去（外部引用用 id）。

### 7. 退役表

agent_llm（并入 agent_record.llm_id）、上述六套 usage 表（llm_core_usage 配额读写迁 TraceService/usage_event_record 后 DROP，agent_usage_daily 等改名保留数据）。

修正：agent_execution_trace、agent_execution_config 不属于退役范围——它们是现行 AgentExecution 编排域在用存储（ChatService 读删、Evolutor/Writer/可视化依赖，_04 数据流登记为活跃链路）；原「v1 引擎遗留」判断不成立。trace 表按二分命名规范改名 agent_execution_trace_record，config 已为 agent_execution_config_record。

## 已知债

agent_record.skill_ids/mcp_ids 仍为 JSON 关系列（多对多未拆 agent_skill_org/agent_mcp_org）；stream_event_record.payload_json 携带上下文全文冗余。〔chg-045 更新：已由 `task_event_record` 承接，`context.built.sources` 结构化透传替代冗余全文，见 ADR-013〕

## 迁移策略

各 SchemaInitializer 幂等迁移：`try { ALTER TABLE 旧名 RENAME TO 新名 } catch {}` 置于 CREATE 之前 + ADD COLUMN 补列（catch 忽略已存在）；FTS5 info_keyword 改名校验失败则 drop+重建+回填；存量 context_org round=0；数据零丢失。
