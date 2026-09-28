# ADR-010 消息三表重构与复选框上下文时序回溯(本次 R6)

> 状态:accepted　日期:2026-09-28

## 背景
1. 原 `info_raw` 混杂了人机问答消息（`REQUEST` / `RESPONSE`）以及智能体庞大的内部执行步骤（`THINK` / `ACT` / `SKILL` / `MCP` / `PERMISSION` 等大体积 JSON 日志与入参出参），导致会话列表统计、首屏历史消息加载性能较差；
2. 原上下文构建在用户手动复选消息（`selected_msg_ids`）时，直接清空了时序候选（`timelineCandidates`），导致问答失去了当时的历史时序语境；
3. 原 `pin` 状态由后端单表物理修改维护，用户确认允许刷新后自动失效，可移交前端会话级内存管理，从而彻底解耦表结构。

## 决策
1. **拆分为三张职责解耦的表**：
   - **`dialog` 表**：专职记录真实问答，字段包含 `id`, `session_id`, `work_id`, `type` (REQUEST/RESPONSE), `dialog`, `dialog_length`, `dialog_brief`, `trace_id`, `created`, `updated`。彻底去掉 `info_id`, `info_type`, `info_creator_role`, `pin`, `handle_result_type`, `run_id`。
   - **`execute` 表**：记录 Agent 执行过程中的组件级轨迹，字段包含 `id`, `session_id`, `work_id`, `run_id`, `trace_id`, `agent_id`, `exec_no` (从0递增), `component_id`, `component_type` (LLM, Skill, MCP等), `input`, `input_length`, `output`, `output_length`, `gap` (耗时 ms), `created`, `updated`。
   - **`context` 表**：仅关联 `dialog` 表，记录每次问答使用的上下文映射与快照，字段包含 `id`, `session_id`, `work_id`, `dialog_id`, `type` (pin, timeline, citing等), `created`, `updated`。
2. **彻底剔除兼容性代码（Zero Legacy Code）**：
   - 全面废弃并清理 `info_raw` 与 `info_context_source`，不保留任何兼容视图或降级回退逻辑；所有接口、服务及测试均直接收敛于 `dialog`、`execute`、`context` 三张原生物理表。
3. **复选框上下文时序回溯（Timeline Backfill）**：
   - 当用户勾选消息时，选中消息记为 `citing`；同时根据选中消息的 `work_id` 查询 `context` 表，提取当时作为上下文使用的历史 `dialog_id`，回填为 `timelineCandidates` 并按 `created ASC` 排序。
4. **Pin 与复选前端生命周期统一**：
   - 复选与 Pin 置顶统一为前端 Store 内存维护，刷新页面后自动失效；发送提问时作为参数传递，并作为单次问答快照存入 `context` 表。

## 备选方案
| 方案 | 未选原因 |
|---|---|
| 继续单表 info_raw 增加索引 | 数据量与大文本行混杂，无法根本解决大文本扫描与缓存污染 |
| 将 pin 写入 context 作为常驻配置 | 增加额外的维护复杂度，用户已明确允许刷新后自动失效 |

## 后果
- 正面: 问答表数据量缩减 90% 以上，首屏对话加载与会话列表统计提速 5~10 倍；勾选提问具备完整的历史时序上下文；组件执行过程结构化指标（次序、耗时、输入输出）清晰可追溯。
- 负面: 涉及底层 Schema 与 InfoCoreService 读写分流重构。
