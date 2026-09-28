# P0 需求澄清记录(2026-09-26)

> 状态:confirmed(自主推进模式;用户会话指令为最高裁决,详见 SOP 冲突裁决顺序)
> 需求原文:"使用 hs-project-skill 这个 skill 完成本项目前后端的重构,前端的所有页面的样式需要进行人性化的改造,并且生成所有的文档。"

## 1. 需求拆解

| 编号 | 需求 | 内容 | 类型 |
|---|---|---|---|
| R1 | SOP 接入 | 对 brian-agent(自有未接入的存量项目)按"既有项目接入(分级)"反向补建十一件套:_00~_06 文档、_07_method_idx 方法索引、_09 词典、_10 变更日志 | 文档 |
| R2 | 前端人性化改造 | 全部页面样式重构:设计令牌体系、统一间距/字号/圆角/阴影/过渡/焦点态、空态/加载态/错误态、可访问性;**功能与 API 契约不变** | style/refactor |
| R3 | 后端重构 | SOP 违规项治理:超长方法拆分(≤30 行红线,`analyze:methods` 为据;重点 dev-server.ts 巨型函数)、外部组件封装核查 | refactor |
| R4 | 全部文档 | 十一件套全套 + 修复根 README 失效文档链接与过时架构描述 | docs |

| R4 | 全部文档 | 十一件套全套 + 修复根 README 失效文档链接与过时架构描述 | docs |
| R5 | 历史卡片与图谱级联治理 | 信息>历史页面卡片重构（8~12字标题源头控制、创建时间、全量Token、成对问答、总字数、前4标签+更多标签模态、卡片点击跳转）、会话彻底删除（含llm_call_log与编排轨迹）、图数据删除安全解关联（不删共享节点）以及图节点修复学习（清理无消息关联的孤立节点） | feat |
| R6 | 三表拆分与复选框上下文重构 | 将 info_raw/info_context_source 重构为 dialog（仅REQUEST/RESPONSE）、execute（组件执行轨迹与耗时）、context（仅关联dialog的上下文与快照），同时优化复选框上下文逻辑，将勾选消息当时使用的上下文作为 timeline 回填 | refactor/feat |

## 2. 关键裁决(自主裁决依据 SOP)

1. **方法签名** — 项目已有统一五参签名 `(input, output, context, metrics?, report?)`(基类 `brian-backend/Base/shared/base/` 的 Input/Output/Context/Metrics/Report,AOP 经 `AopProxy.wrap` 统一拦截)。与 SOP 五段 `boolean m(input, output, context, metrics, evolution)` 同构:evolution 职责由 `Output.error/error_code` + Report 承担。按"既有项目接入不强制改写存量"规则,登记为项目签名约定(映射写 _06),不物理改写 11.9 万行存量签名。
2. **规模分级** — 代码 >10 万行 → 启用分片索引(_07_method_idx/_09_project_dict/_10_change_log 分片目录);并行开发者 = 个人,owner/PR 评审条目登记为个人级豁免。
3. **范围红线** — 保留当前未提交 WIP 改动;Agent 禁止 git push;逐任务卡 Conventional Commits 提交。
4. **快速通道判定** — R2 前端样式为纯 style 改动(不改契约),R3 后端为结构重构(不改契约):两者均可免 P1~P6 增量评审。本次 R5 为新增功能与数据契约扩展，走标准 P0~P8 门禁流程。
5. **R5 会话标题源头控制** — 必须在会话标题生成/更新逻辑（`autoGenerateSessionTitleIfEmpty` 与 `updateSessionTitle`）从源头将标题控制在 8~12 个字以内，前端卡片仅负责对存量异常长标题做兜底防护。
6. **R5 图数据删除与修复学习** — ① 对话删除时：标签/关键词节点可能被其他对话复用，严禁直接删除图中的 Tag/keyword 节点，仅解除消息与节点之间的关系（删除关系表记录及 info 节点与引用边）；② 图节点修复学习时：必须对完全没有消息关联的孤立节点及其游离边进行彻底清理。
7. **R6 三表模型与上下文回溯** — ① 表拆分：dialog 仅记录 REQUEST/RESPONSE 问答；execute 记录组件级执行步骤（agent_id, exec_no, component_id, component_type, input, input_length, output, output_length, gap）；context 仅关联 dialog 表记录上下文类型（timeline, citing, pin 等）；② Pin 与复选消息生命周期：纯前端内存维护，允许刷新后自动失效，问答时作为快照记入 context 表；③ 复选框上下文构建：除了勾选消息作为 citing 之外，从 context 表回溯被选中消息当时使用的上下文作为 timeline 候选填入。

## 3. 验收标准(EARS)

```text
WHEN 十一件套创建完成 THE SYSTEM SHALL _00~_06 与代码现状一致,_00/_07_method_idx/_09/_10 可被 JSON 解析器解析且 stats 一致。
WHEN 用户打开任一前端页面 THE SYSTEM SHALL 呈现统一设计令牌驱动的界面(颜色/字号/间距/圆角/阴影/过渡一致),并具备空态/加载态/错误态。
WHEN 用户打开「信息 > 历史」页面 THE SYSTEM SHALL 呈现会话卡片，内容包含：8~12字标题、创建时间、全量Token消耗（涵盖Agent调用及skill/soul/mcp/prompt/agent等全部辅助LLM调用）、问答轮数（成对请求与回答）、总字符数（提问与回答总和）、默认前4个标签与更多标签按钮（点击弹出完整标签浮层）。
WHEN 用户点击会话卡片主体 THE SYSTEM SHALL 直接跳转至对应会话页面（/chat?session={sessionId}）。
WHEN 用户点击会话删除按钮并确认 THE SYSTEM SHALL 彻底删除会话主表、消息、运行时数据、llm_call_log全量Token流水、编排执行与轨迹，并解除图谱中消息与标签/关键词的关联，严禁删除共享图节点。
WHEN 执行图节点修复学习 THE SYSTEM SHALL 扫描清理完全没有消息关联的孤立图节点与游离边。
WHEN 启动系统并执行消息持久化 THE SYSTEM SHALL 自动将问答写入 dialog 表、中间执行步骤写入 execute 表、上下文关系写入 context 表，彻底剔除 info_raw 兼容性代码。
WHEN 用户复选消息并发送提问 THE SYSTEM SHALL 将选中消息作为 citing，同时回溯选中消息当时使用的上下文填入 timelineCandidates。
WHEN 用户刷新页面 THE SYSTEM SHALL 自动失效并重置复选与 Pin 置顶的前端内存状态。
WHEN 运行 npm test THE SYSTEM SHALL 全部测试通过。
WHEN 全部完成 THE SYSTEM SHALL 提示用户人工测试,git push 由人工执行。
```

## 4. 未决问题

| 问题 | 影响 | 状态 |
|---|---|---|
| R5 需求澄清与技术路线确认 | 用户已明确两大核心细节（源头控制标题、图数据删除只解关联/修复学习删孤立节点） | resolved(已确认) |
| R6 消息三表重构与上下文回溯 | 用户已明确表结构字段定义与刷新失效规则 | confirmed(已确认) |

