# ADR-009 全量 Token 计量与图数据弱关联治理(本次 R5)

> 状态:accepted　日期:2026-09-28

## 背景
用户需要全面掌握会话成本（包含 Agent 主对话及 Skill/Soul/MCP/Prompt/Agent 匹配辅助调用的全部 Token 消耗），并在历史卡片直观展示；同时在会话删除时，需要防止因强行删除标签/关键词图节点而破坏其他对话的知识图谱拓扑；并建立孤立图节点在修复学习中的安全回收机制。

## 决策
1. **全量 Token 记账**：会话 Token 聚合数据源从局部 `agent_execution_trace` 切换为以 `llm_call_log` 为基准。利用 `LLMService` 作为唯一物理门面的特性，按 `session_id` 统一对 `input_tokens` 与 `output_tokens` 求和，实现 100% 场景覆盖。
2. **会话删除弱关联解绑**：删除会话时，只删除 `chat_session`、`dialog`、`execute`、`context`、`info_tag`、`info_keyword` 关系记录，以及该消息的 `info` 节点与引用边；严禁在会话删除时直接删除 `Tag` 和 `keyword` 实体图节点。
3. **图修复学习孤儿清理**：在图谱修复学习/维护逻辑（`cleanOrphanGraphNodes` / `rebuildCooccurGraph`）中，引入 0 消息关联检测，自动安全清理引用计数为 0 的孤立 Tag 与 keyword 节点及游离边。
4. **会话标题源头控制**：在 `autoGenerateSessionTitleIfEmpty` 和 `updateSessionTitle` 中从源头统一截取/约束为 8~12 个字符，禁止过长标题进入存储。

## 备选方案
| 方案 | 未选原因 |
|---|---|
| 物理强删图节点 | 相同标签/关键词被多会话关联，直接删除会导致其他会话图谱断裂 |
| 仅依靠 Trace 统计 Token | 遗漏匹配层、评估层辅助大模型消耗 |

## 后果
- 正面: 计量准确、图数据无破坏风险、孤立垃圾数据可控回收、标题规整。
- 负面: 会话删除增加了 `llm_call_log` 与 `orchestration_work` 的级联清理逻辑；图修复增加了一次全量孤立节点扫描。
