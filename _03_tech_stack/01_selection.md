# 01 选型清单与依赖约束(_03_tech_stack)

> 状态:confirmed　更新:2026-09-26
> 说明:存量项目反向登记。每个关键选型的 ADR 见本目录。

## 1. 选型清单

| # | 领域 | 候选 | 结论 | 关键理由 | ADR |
|---|---|---|---|---|---|
| 1 | 运行时 | Node 20 / **Node 22** | Node 22(ABI127) | prebuilt 二进制矩阵按 ABI127 组织;ES2022 | ADR-001 |
| 2 | Web 框架 | Express/Koa / **node:http 手写** | 零框架 | 离线分发零依赖定位;ws 仅 WS 通道 | ADR-002 |
| 3 | 关系存储 | **better-sqlite3** / PG | SQLite(WAL) | 本机单文件;3 库分库(业务/日志/图) | ADR-003 |
| 4 | 向量存储 | **LanceDB** / Qdrant | LanceDB + apache-arrow | 嵌入式、列式、零服务 | ADR-003 |
| 5 | 图存储 | **leangraph** / Neo4j | leangraph | 嵌入式图库 | ADR-003 |
| 6 | 技能沙箱 | **isolated-vm** / worker/vm | isolated-vm 5.0.4 | V8 隔离堆,真隔离;darwin-x64 源码编译兜底 | ADR-004 |
| 7 | 执行引擎 | workflow DAG / **代码即编排(v2 Loop)** | Runtime v2 | 两级 ReAct/CoT 循环 + Run 网关;v1 阶段执行保留兼容 | ADR-005 |
| 8 | 工具概念 | Tool/Skill 并存 / **Skill 一等工具** | Skill 承接 | commit bcd2479:Tool 领域概念移除;ToolProvider 收窄为原语单一事实源 | ADR-006 |
| 9 | 方法签名约定 | 各写各的 / **五参 (input, output, context, metrics?, report?)** | 全后端统一 | AOP 统一拦截进出入计时/日志;对应 SOP 五段的同构实现 | ADR-007 |
| 10 | LLM 接入 | 官方 SDK / **自实现策略族** | 自实现 HTTP 策略 | 统一事件帧流;多供应商 failover | (原理见 _02 A4) |
| 11 | 前端框架 | React / **Vue 3.4 + Pinia + Vue Router** | Vue 3 组合式 API | 既有代码基础;SFC 单文件组件 | —(事实选型) |
| 12 | 前端样式 | 组件库 / **Tailwind 3.4 + 设计令牌** | 令牌先行 | 保持零重组件依赖;token 收敛硬编码样式 | ADR-008 |
| 13 | 测试 | **vitest** / jest | vitest | 5 工作区各自 config;test-all.mjs 聚合 | — |
| 14 | Lint | **ESLint flat config** / eslintrc | flat config(eslint.backend.config.mjs) | no-console/no-unused-vars 为 error | — |
| 15 | 分发 | npm / **离线打包(tar.gz/zip/deb + SEA)** | 离线优先 | prebuilt 原生二进制随包;pack.py 流水线 | — |

## 2. 依赖与版本约束

| 依赖 | 版本 | 用途 | 许可证 | 约束 / 升级策略 |
|---|---|---|---|---|
| ws | ^8.21.2 | WebSocket(/ws 占位) | MIT | 锁定 major |
| adm-zip | ^0.6.0 | 打包 | MIT | 仅打包脚本使用 |
| better-sqlite3 | 11.10.0 | SQLite 驱动(prebuilt) | MIT | 锁定 minor;升级需重铺 prebuilt |
| @lancedb/lancedb | 0.15.0 | 向量库(prebuilt) | Apache-2.0 | 锁定 minor |
| isolated-vm | 5.0.4 | 沙箱(prebuilt) | MIT | 锁定;ABI127 无上游包的平台走 vendored 编译 |
| @node-rs/jieba | (nodejieba 3.5.8 预编译) | 中文分词 | MIT | 锁定 |
| leangraph | workspace 内 | 图库 | 内部 | — |
| zod | ^3.23.8(shared)/^3(Runtime) | schema 校验 | MIT | 锁定 major |
| vue | ^3.4.21 | 前端框架 | MIT | 锁定 major |
| pinia / vue-router | ^2.1.7 / ^4.3.0 | 状态/路由 | MIT | 锁定 major |
| tailwindcss | ^3.4.3 | 样式引擎 | MIT | 锁定 major(v4 另立 ADR) |
| marked / highlight.js / dompurify / @lucide/vue | 见 brian-frontend/package.json | Markdown 渲染/高亮/净化/图标 | MIT | 锁定 major |

## 3. ADR 索引

| ADR | 决策 | 状态 |
|---|---|---|
| ADR-001 | 运行时锁定 Node 22 / ES2022 / ABI127 | accepted |
| ADR-002 | 零 Web 框架,node:http + ws 手写路由 | accepted |
| ADR-003 | 本地三库:SQLite(WAL) + LanceDB + leangraph | accepted |
| ADR-004 | isolated-vm 技能沙箱 | accepted |
| ADR-005 | Runtime v2 代码即编排,弃 workflow | accepted |
| ADR-006 | Tool 领域概念移除,Skill 一等工具承接 | accepted |
| ADR-007 | 全后端统一五参签名 + AopProxy AOP | accepted |
| ADR-008 | 前端设计令牌体系(本次 R2 改造) | accepted |
