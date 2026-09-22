# 决策记录

> 非显而易见的取舍记录：只记「为什么这么做」，不记流水账；能被 git 历史回答的问题不记。

## [2026-09-22c] 旧实现不再注释保留，统一依赖 git 历史承载

**决策**：重构/修改方法时不再按 dev 工作流步骤 7 将原实现注释保留在源码中；旧实现由 git 历史承载，源码只保留「修改后」的 why 注释。
**原因**：dev 工作流步骤 7 的「注释保留原方法」与 HS-Code-Skill §11 质量门禁「无注释死代码」及本项目 DDDStandards §6.2「无注释保留的旧实现」冲突；按 HS-Code-Skill 冲突裁决原则执行后者。实证：该机制累积 661+ 行死代码（94 处标记、最大单块 140 行），git 可随时回溯，注释保留零收益。
**备选**：维持注释保留（弃用——与两套标准门禁直接冲突，且污染检索链路）。
**影响**：`scripts/remove-dead-code.mjs` 增强「修改后」边界保护后清理存量 1902 行；后续修改方法直接覆盖旧实现，变更说明进 CHANGELOG。

## [2026-09-22] Writer 输出协议：Markdown 直出，弃用 JSON content blocks 中间协议

**决策**：写作 Agent 最终回复由「强制输出 JSON blocks 数组 → parseBlocks → join(content)」改为 LLM 直出 Markdown 正文。
**原因**：① 长 JSON 截断即整篇报废（trace 418a19a1 实证：612 output tokens 缺尾 `]`，parse 失败后残缺 JSON 原文被当回复投递）；② JSON 转义膨胀 ~30% token 加重截断概率；③ join 压平丢弃 heading 层级与 list_item 标记；④ 消费端（reply.delta → 前端 Markdown 渲染）原生吃 Markdown，中间协议与管线不匹配。
**备选**：保留 blocks 协议仅强化模板（弃用——协议内优化天花板低，LLM 输出长 JSON 天然不稳）；下游截断检测与修复（弃用——用户裁决：检测补救写不出合格输出，应在源头让 Writer 一次产出合格输出）。
**影响**：`parseBlocks()` 与 `WriteOutput.blocks` 接口保留（Markdown 回退为单一 text_paragraph 块）；BlockStream-PRD 的 Block 原生事件流仍为后续演进方向。

## [2026-09-22b] Writer 表达组件：专属 Soul + 表达协议进模板，Skill 不注入

**决策**：① 为 WRITER 新建专属 soul（首席编辑人格）并重绑，不动被 13 个 agent 共用的万金油 soul；② 「人类友好阐述协议」与 preferences 枚举语义写进 prompt 模板；③ Skill 组件不接入 Writer。
**原因**：① 共享 soul（编码研究助理）与编辑职责错位且改动会污染全部系统 agent；② 表达质量标准（读者视角/反机器腔/枚举语义）只有进模板才能被执行，配置枚举无语义等于没配；③ Writer 无工具链路，现有 skill 全为工具型，注入不生效也无意义——写作技巧内化进模板成本最低收益直接。
**备选**：给 `execWrite` 补 skill 加载注入逻辑（推迟——待出现真正的「写作风格/排版」类提示词型 skill 需求再建，遵循 YAGNI）。
**影响**：`buildSystemAgent` 对 WRITER 复用不重建，DB 绑定持久生效；若 WRITER agent 被删除重建会回退为 matchSoul 生成的通用 soul。
