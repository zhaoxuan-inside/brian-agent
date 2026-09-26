# P0 需求澄清记录(2026-09-26)

> 状态:confirmed(自主推进模式;用户会话指令为最高裁决,详见 SOP 冲突裁决顺序)
> 需求原文:"使用 hs-project-skill 这个 skill 完成本项目前后端的重构,前端的所有页面的样式需要进行人性化的改造,并且生成所有的文档。"

## 1. 需求拆解

| 编号 | 需求 | 内容 | 类型 |
|---|---|---|---|
| R1 | SOP 接入 | 对 brian-agent(自有未接入的存量项目)按"既有项目接入(分级)"反向补建十一件套:_00~_06 文档、_07 方法索引、_09 词典、_10 变更日志 | 文档 |
| R2 | 前端人性化改造 | 全部页面样式重构:设计令牌体系、统一间距/字号/圆角/阴影/过渡/焦点态、空态/加载态/错误态、可访问性;**功能与 API 契约不变** | style/refactor |
| R3 | 后端重构 | SOP 违规项治理:超长方法拆分(≤30 行红线,`analyze:methods` 为据;重点 dev-server.ts 巨型函数)、外部组件封装核查 | refactor |
| R4 | 全部文档 | 十一件套全套 + 修复根 README 失效文档链接与过时架构描述 | docs |

## 2. 关键裁决(自主裁决依据 SOP)

1. **方法签名** — 项目已有统一五参签名 `(input, output, context, metrics?, report?)`(基类 `brian-backend/Base/shared/base/` 的 Input/Output/Context/Metrics/Report,AOP 经 `AopProxy.wrap` 统一拦截)。与 SOP 五段 `boolean m(input, output, context, metrics, evolution)` 同构:evolution 职责由 `Output.error/error_code` + Report 承担。按"既有项目接入不强制改写存量"规则,登记为项目签名约定(映射写 _06),不物理改写 11.9 万行存量签名。
2. **规模分级** — 代码 >10 万行 → 启用分片索引(_07/_09/_10 分片目录);并行开发者 = 个人,owner/PR 评审条目登记为个人级豁免。
3. **范围红线** — 保留当前 621 个未提交 WIP 改动(分支 feat/20260926-recreate,基线 typecheck+test 已全绿);Agent 禁止 git push;逐任务卡 Conventional Commits 提交。
4. **快速通道判定** — R2 前端样式为纯 style 改动(不改契约),R3 后端为结构重构(不改契约):两者均可免 P1~P6 增量评审,但十一件套反向补建本身即本次交付物,全部落盘。

## 3. 验收标准(EARS)

```text
WHEN 十一件套创建完成 THE SYSTEM SHALL _00~_06 与代码现状一致,_00/_07/_09/_10 可被 JSON 解析器解析且 stats 一致。
WHEN 用户打开任一前端页面 THE SYSTEM SHALL 呈现统一设计令牌驱动的界面(颜色/字号/间距/圆角/阴影/过渡一致),并具备空态/加载态/错误态。
WHEN 运行 npm run typecheck && npm test THE SYSTEM SHALL 全部通过(基线:5/5 工作区通过,2026-09-26 11:00)。
WHEN 运行前端 npm run build THE SYSTEM SHALL vue-tsc 类型检查与构建通过。
WHEN 运行 npm run analyze:methods -- 30 THE SYSTEM SHALL 超长方法数量较基线下降,dev-server.ts 巨型函数完成拆分。
WHILE 任何改动 THE SYSTEM SHALL 不改变既有 API 对外契约(以 _06 登记为准)。
WHEN 全部完成 THE SYSTEM SHALL 提示用户人工测试,git push 由人工执行。
```

## 4. 未决问题

| 问题 | 影响 | 状态 |
|---|---|---|
| 无(用户会话指令明确,自主推进) | — | resolved |
