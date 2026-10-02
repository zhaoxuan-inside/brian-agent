# ADR-015: 对话页 Claude 暖色双模式主题（supersede ADR-014）

- 状态: Accepted（取代 ADR-014 的 Linear 暗色-only 方案）
- 日期: 2026-10-01
- 设计源: `design-md/claude/DESIGN.md`（fork-awesome-design-md 集合中的 Claude/Anthropic 设计分析）
- 关联: ADR-008（前端设计令牌体系）、ADR-014（Linear 暗色主题，已 superseded）

## 背景

ADR-014 将对话页改造为 Linear 暗色-only 主题后，用户反馈两点：
1. **纯黑刺眼**：Linear 画布 #010102 近纯黑，长时间注视不适；
2. **丢失明暗双模式**：对话页不再跟随顶栏明暗开关，与全应用体验割裂。

需求：从 design-md 设计集合中重选一个适合本项目（个人 AI Agent 对话应用）的设计，**必须同时具备黑暗与白天模式**。

## 选型

选定 **Claude（Anthropic）设计**，理由：
- 设计本身就是 AI 对话产品的原生 UI 语言，与本项目气质一致；
- 浅色为暖米白画布 #faf9f5（非刺眼纯白），深色为暖棕柔黑 #181715 表面阶梯（远比 #010102 温和）；
- 语义色齐全（success #5db872 / warning #d4a017 / error #c64545），可恢复此前因 Linear 无橙而被降级的警示语义（钉住/星级/评估/停止恢复琥珀色）；
- 圆角阶梯（4/6/8/12/16/pill）与 ADR-014 已建立的实现完全同构，迁移成本最低。

## 决策

1. **令牌族更名并变量化**：`linear` 命名空间更名为 `chat`，颜色不再写死十六进制，改为 `rgb(var(--chat-*) / <alpha-value>)` 取 CSS 变量（RGB 三元组），`/N` 透明度修饰符继续可用；圆角 `linear-*` → `chat-*`（值不变），`font-linear` → `font-chat`，新增 `font-chat-display`（Copernicus/Tiempos 衬线替代栈，仅用于 Brian 品牌字样等拉丁显示位）。
2. **双模式作用域**：`.theme-chat` 定义浅色变量组，`:root.dark .theme-chat` 定义深色变量组，随既有顶栏明暗开关（html.dark class 策略）自动切换；`--brian-*` 语义变量（焦点环/选区/滚动条/markdown/图谱底色）在两组内同步切换。Teleport 弹层 overlay 根继续挂作用域类。
3. **语义映射（Claude 规范）**：主操作/品牌/引文/链接 → coral primary；钉住/星级/评估徽标/停止 → warning 琥珀（恢复）；成功 → success；错误 → error；ChatMap 边线改暖色族且随明暗切换（选中/引文=coral、出边=teal #5db8a6、入边=amber #e8a55a、中性=暖灰）。
4. **作用域更名**：`.theme-linear` → `.theme-chat`；共享组件 variant 值 `'linear'` → `'chat'`（Header/PageBreadcrumb 的 `'glass' | 'chat'`，ModalShell/ConfirmDialog 的 `'default' | 'chat'`），默认渲染路径依旧不变。
5. 深色值中 on-primary 用深墨（提亮 coral 上配深字保证对比度）；primary 在深色下整体提亮一档（#d98b70）。

## 后果

- 对话页恢复明暗双模式，且深色不再刺眼；其他页面依旧零改动（lint 0 error / vue-tsc+build 通过 / 17 文件 161 测试全过 / 双模式截图验证）。
- **运维注意：tailwind.config.js 变更（增删令牌、改名）必须重启前端 dev server 才生效**——ADR-014 落地时曾因老进程持有旧配置导致 globals.css `@apply` 编译 500、整页黑屏（当时误判为服务被杀）。已在 _06/02 令牌契约中注明。
- ADR-014 保留作为历史记录，状态改为 superseded。
