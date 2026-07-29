# Evolutor Agent 模块测试用例

> 模块代码：`brian-backend/Agent/EvolutorAgent/`  
> 接口数量：7 个（evalWorkAgent、evalWriterAgent、startEvalSchedule、stopEvalSchedule、getEvaluation、getEvolutionReport、configEvolutorAgent）  
> 测试用例总数：33  
> 覆盖目标：100% 接口覆盖，≥80% 场景覆盖

---

## 1. evalWorkAgent — 评估 Work Agent

### TC-EA-001: 正常 5 维度评估 Work Agent

| 项 | 内容 |
|---|------|
| **前置条件** | Evolutor Agent 已构建；存在一次 Work Agent 执行记录（含 trace）；LSM 可正常返回评估 JSON |
| **测试步骤** | 调用 evalWorkAgent（agent_id、work_id、interact_id） |
| **预期结果** | 5 维 scores（correctness, completeness, efficiency, relevance, overall）均为合法数值；evaluation 记录写入 agent_evaluation 表；Agent 的 eval_score 被加权平均更新 |
| **覆盖场景** | 基础评估流程 |

### TC-EA-002: 评估 getTrace 有迭代信息时 efficiency 从 trace token_usage 计算

| 项 | 内容 |
|---|------|
| **前置条件** | 执行 trace 中存在 total_token_usage=5000、iteration_count=3 |
| **测试步骤** | 调用 evalWorkAgent |
| **预期结果** | output.scores.efficiency 从 token_usage 和 iterations 计算（而非全部依赖 LLM） |
| **覆盖场景** | efficiency 客观计算 |

### TC-EA-003: 整体评分低于阈值时触发优化 MQ 消息

| 项 | 内容 |
|---|------|
| **前置条件** | optimize_threshold=60；LLM 返回 overall=45 |
| **测试步骤** | 调用 evalWorkAgent |
| **预期结果** | output.need_optimize=true；向 `agent.optimize` MQ 队列发送消息（含 agent_id、interact_id） |
| **覆盖场景** | 低分触发优化 |

### TC-EA-004: 整体评分高于阈值时不触发优化

| 项 | 内容 |
|---|------|
| **前置条件** | optimize_threshold=60；LLM 返回 overall=75 |
| **测试步骤** | 调用 evalWorkAgent |
| **预期结果** | output.need_optimize=false；不向 `agent.optimize` 队列发送消息 |
| **覆盖场景** | 高分略过优化 |

### TC-EA-005: 评估结果持久化到 agent_evaluation 表

| 项 | 内容 |
|---|------|
| **前置条件** | 评估完成 |
| **测试步骤** | 调用 evalWorkAgent 后，通过 getEvaluation 查询 |
| **预期结果** | agent_evaluation 表中存在一条 eval_type='WORK_AGENT' 的记录 |
| **覆盖场景** | 持久化存储 |

### TC-EA-006: Agent 加权平均评分更新

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 当前 eval_score=70（权重: usage_count=5）；新评估 overall=80 |
| **测试步骤** | 调用 evalWorkAgent |
| **预期结果** | Agent 的 eval_score 按加权平均更新：(70*5 + 80) / (5+1) ≈ 71.67 |
| **覆盖场景** | 加权平均评分 |

### TC-EA-007: LLM 评估调用失败时降级处理

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 在 eval_work prompt 阶段调用失败/抛异常 |
| **测试步骤** | 调用 evalWorkAgent |
| **预期结果** | 不崩溃；evaluation 记录可能标记为 failed 或部分评分来自默认值 |
| **覆盖场景** | LLM 失败容错 |

### TC-EA-008: 不存在 trace 时正常评估（无 efficiency 调整）

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 执行未生成 trace 或 trace 已被清理 |
| **测试步骤** | 调用 evalWorkAgent |
| **预期结果** | 跳过 trace 相关效率计算，efficiency 完全来自 LLM 评估 |
| **覆盖场景** | 无 trace 评估 |

---

## 2. evalWriterAgent — 评估 Writer Agent

### TC-EA-009: 正常 4 维度评估 Writer Agent

| 项 | 内容 |
|---|------|
| **前置条件** | Evolutor Agent 已构建；Writer Agent 有使用记录 |
| **测试步骤** | 调用 evalWriterAgent（agent_id、work_id） |
| **预期结果** | 4 维 scores（clarity, informativeness, user_alignment, conciseness, overall）均为合法数值；eval_type='WRITER_AGENT' |
| **覆盖场景** | Writer 评估流程 |

### TC-EA-010: Writer 整体评分低于阈值时触发优化

| 项 | 内容 |
|---|------|
| **前置条件** | optimize_threshold=60；LLM 返回 overall=50 |
| **测试步骤** | 调用 evalWriterAgent |
| **预期结果** | need_optimize=true；MQ 消息发送 |
| **覆盖场景** | Writer 低分优化 |

### TC-EA-011: Writer 评分高时 need_optimize=false

| 项 | 内容 |
|---|------|
| **前置条件** | optimize_threshold=60；LLM 返回 overall=85 |
| **测试步骤** | 调用 evalWriterAgent |
| **预期结果** | need_optimize=false |
| **覆盖场景** | Writer 高分略过 |

---

## 3. startEvalSchedule — 启动评估调度

### TC-EA-012: 启动调度器（EVAL_SCHEDULE_QUEUE、EVAL_QUEUE、OPTIMIZE_QUEUE 三个 Worker）

| 项 | 内容 |
|---|------|
| **前置条件** | Evolutor Agent 已构建；MQ 服务正常 |
| **测试步骤** | 调用 startEvalSchedule |
| **预期结果** | 3 个 Worker 被创建：EVAL_SCHEDULE_QUEUE（定时）、EVAL_QUEUE（事件驱动）、OPTIMIZE_QUEUE（事件驱动）；每个 Worker 已注册到 MQCore |
| **覆盖场景** | 调度启动 |

### TC-EA-013: 定时调度 Worker 扫描未评估的 usage 记录并触发评估

| 项 | 内容 |
|---|------|
| **前置条件** | 调度已启动；存在 5 条未评估的 agent_usage 记录 |
| **测试步骤** | 等待调度执行（eval_schedule_interval_ms 后自动执行） |
| **预期结果** | 5 条 usage 记录被取出；为每条 usage 向 EVAL_QUEUE 发送 eval_work_agent 消息 |
| **覆盖场景** | 定时扫描评估 |

### TC-EA-014: EVAL_QUEUE Worker 消费消息并调用 evalWorkAgent

| 项 | 内容 |
|---|------|
| **前置条件** | EVAL_QUEUE 中有 eval_work_agent 消息；Evolutor Agent 正常 |
| **测试步骤** | Worker 消费消息 |
| **预期结果** | evalWorkAgent 被调用；结果持久化；若 need_optimize，进一步向 OPTIMIZE_QUEUE 发送消息 |
| **覆盖场景** | 评估队列处理 |

### TC-EA-015: OPTIMIZE_QUEUE Worker 消费消息并调用优化

| 项 | 内容 |
|---|------|
| **前置条件** | OPTIMIZE_QUEUE 中有 optimize 消息（含 agent_id） |
| **测试步骤** | Worker 消费消息 |
| **预期结果** | agentBuilder.optimizeAgent 被调用 |
| **覆盖场景** | 优化队列处理 |

### TC-EA-016: 调度定时触发 Agent 老化检测

| 项 | 内容 |
|---|------|
| **前置条件** | 调度已启动；agent_opt_rule 中存在老化规则 |
| **测试步骤** | 等待调度执行 |
| **预期结果** | EVAL_SCHEDULE_QUEUE Worker 在定时扫描后，额外调用 agentLibrary.ageAgent |
| **覆盖场景** | 老化检测集成 |

### TC-EA-017: 重复启动时幂等处理

| 项 | 内容 |
|---|------|
| **前置条件** | 调度已启动 |
| **测试步骤** | 再次调用 startEvalSchedule |
| **预期结果** | 不创建重复 Worker；已运行的 Worker 继续运行 |
| **覆盖场景** | 幂等启动 |

---

## 4. stopEvalSchedule — 停止评估调度

### TC-EA-018: 正常停止调度 Worker

| 项 | 内容 |
|---|------|
| **前置条件** | 调度已启动（所有 Worker 正在运行） |
| **测试步骤** | 调用 stopEvalSchedule |
| **预期结果** | Worker 被停止（通过 MQCore.stopWorker）；不再产生新的定时评估 |
| **覆盖场景** | 调度停止 |

### TC-EA-019: 未启动时调用 stopEvalSchedule 不抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 调度未启动 |
| **测试步骤** | 调用 stopEvalSchedule |
| **预期结果** | 不抛异常 |
| **覆盖场景** | 未启动时安全停止 |

---

## 5. getEvaluation — 查询评估记录

### TC-EA-020: 按 agent_id 查询所有评估

| 项 | 内容 |
|---|------|
| **前置条件** | 存在 3 条 agent_evaluation 记录（agent_id='agent-1'） |
| **测试步骤** | 调用 getEvaluation（agent_id='agent-1'） |
| **预期结果** | output.evaluations 长度=3 |
| **覆盖场景** | 按 Agent 查询 |

### TC-EA-021: 按 eval_type 过滤

| 项 | 内容 |
|---|------|
| **前置条件** | 存在 WORK_AGENT 和 WRITER_AGENT 两类评估记录 |
| **测试步骤** | 调用 getEvaluation（eval_type='WORK_AGENT'） |
| **预期结果** | output.evaluations 全部为 WORK_AGENT 类型 |
| **覆盖场景** | 类型过滤 |

### TC-EA-022: 按条件查询（score 范围、时间范围等）

| 项 | 内容 |
|---|------|
| **前置条件** | 存在多条评估记录 |
| **测试步骤** | 调用 getEvaluation（conditions 包含 score >= 70、created 在某个时间之后） |
| **预期结果** | 仅返回符合条件的记录 |
| **覆盖场景** | 组合条件查询 |

### TC-EA-023: 分页查询评估记录

| 项 | 内容 |
|---|------|
| **前置条件** | 存在 20 条评估记录 |
| **测试步骤** | 调用 getEvaluation（page={current:1,size:10}） |
| **预期结果** | output.evaluations 长度=10 |
| **覆盖场景** | 分页查询 |

### TC-EA-024: 无评估记录时返回空数组

| 项 | 内容 |
|---|------|
| **前置条件** | agent_evaluation 表为空 |
| **测试步骤** | 调用 getEvaluation |
| **预期结果** | output.evaluations 为空数组 |
| **覆盖场景** | 空结果 |

---

## 6. getEvolutionReport — 生成进化报告

### TC-EA-025: 正常生成 Agent 进化报告

| 项 | 内容 |
|---|------|
| **前置条件** | 存在多条 agent_evaluation 记录；存在 agent_usage 记录；存在组件变更记录（strategy/llm/soul 的 update 历史） |
| **测试步骤** | 调用 getEvolutionReport（agent_id='agent-1'） |
| **预期结果** | output.report 包含：score_trend（评分趋势数据）、usage_trend（使用趋势）、component_changes（组件变更历史）、current_score、evolution_summary（LLM 生成的自然语言摘要） |
| **覆盖场景** | 完整报告 |

### TC-EA-026: 进化报告时间范围可配置

| 项 | 内容 |
|---|------|
| **前置条件** | 评估记录跨越 30 天 |
| **测试步骤** | 调用 getEvolutionReport（agent_id='agent-1'、time_range='7d'） |
| **预期结果** | 报告仅包含最近 7 天的数据 |
| **覆盖场景** | 时间范围过滤 |

### TC-EA-027: LLM 生成的自然语言摘要

| 项 | 内容 |
|---|------|
| **前置条件** | 有足够的评估维度数据 |
| **测试步骤** | 调用 getEvolutionReport |
| **预期结果** | evolution_summary 由 LLM 根据各维度趋势自动生成（非固定模板文本） |
| **覆盖场景** | LLM 摘要生成 |

### TC-EA-028: 无任何评估数据的 Agent 报告

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 存在但从未被评估 |
| **测试步骤** | 调用 getEvolutionReport（agent_id='agent-1'） |
| **预期结果** | report 中各字段均为空或初始值（score_trend=[]、component_changes=[] 等），evolution_summary 可能为空或提示无数据 |
| **覆盖场景** | 无数据报告 |

### TC-EA-029: 复杂 Agent 的报告（多次优化 + 多次评估）

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 经历了 5 次优化（strategy 切换 2 次、LLM 切换 1 次）+ 50 次评估（评分逐步上升） |
| **测试步骤** | 调用 getEvolutionReport |
| **预期结果** | 评分趋势呈现上升态势；component_changes 记录全部优化历史；evolution_summary 提到持续优化提升效果 |
| **覆盖场景** | 多轮进化报告 |

---

## 7. configEvolutorAgent — 配置 Evolutor

### TC-EA-030: 首次配置写入默认值

| 项 | 内容 |
|---|------|
| **前置条件** | evolutor_agent_config 表为空 |
| **测试步骤** | 调用 configEvolutorAgent（不传参数） |
| **预期结果** | 配置初始化：optimize_threshold=60、eval_frequency_threshold=5、eval_schedule_interval_ms=3600000（1h）、eval_batch_size=20 |
| **覆盖场景** | 默认配置初始化 |

### TC-EA-031: 更新 optimize_threshold

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化（threshold=60） |
| **测试步骤** | 调用 configEvolutorAgent（optimize_threshold=70） |
| **预期结果** | optimize_threshold=70；score < 70 时将触发优化 |
| **覆盖场景** | 阈值更新 |

### TC-EA-032: 更新 eval_schedule_interval_ms

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化 |
| **测试步骤** | 调用 configEvolutorAgent（eval_schedule_interval_ms=1800000） |
| **预期结果** | 定时扫描间隔变为 30 分钟 |
| **覆盖场景** | 调度间隔配置 |

### TC-EA-033: 更新 eval_frequency_threshold 和 eval_batch_size

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化 |
| **测试步骤** | 调用 configEvolutorAgent（eval_frequency_threshold=10、eval_batch_size=50） |
| **预期结果** | 两个字段同时更新 |
| **覆盖场景** | 多字段配置 |

---

## 附录：评估维度参考

### Work Agent 评估维度

| 维度 | 描述 | 来源 |
|------|------|------|
| correctness | 结果正确性 | LLM 评估 |
| completeness | 任务完成度 | LLM 评估 |
| efficiency | 执行效率 | token_usage * 0.5 + iterations * 0.5 客观计算 + LLM 评估 |
| relevance | 与原始问题的相关度 | LLM 评估 |
| overall | 综合评分 | LLM 综合 |

### Writer Agent 评估维度

| 维度 | 描述 |
|------|------|
| clarity | 行文清晰度 |
| informativeness | 信息密度 |
| user_alignment | 与用户偏好的契合度 |
| conciseness | 简洁度 |
| overall | 综合评分 |

### MQ 队列架构

```
EVAL_SCHEDULE_QUEUE  ──(定时扫描未评估usage)──→  EVAL_QUEUE  ──(可选)──→  OPTIMIZE_QUEUE
                                                            ↓                    ↓
                                                     evalWorkAgent        agentBuilder.optimizeAgent
                                                     evalWriterAgent
```
