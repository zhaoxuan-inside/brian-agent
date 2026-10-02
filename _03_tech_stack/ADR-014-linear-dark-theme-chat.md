# ADR-014: 对话页 Linear 暗色主题与并行令牌族

- 状态: Accepted
- 日期: 2026-10-01
- 关联: ADR-008（前端设计令牌体系）、`brian-frontend/DESIGN.md`（Linear 风格设计源）

## 背景

对话页需要按 `brian-frontend/DESIGN.md`（Linear 设计分析：近黑画布 #010102、炭黑表面阶梯 surface-1~4、hairline 描边、薰衣草蓝 #5e6ad2 单一强调色、Inter 替代字体、暗色-only）改造 UI 风格。约束：**本次只改对话页，其他页面保持 ADR-008 的 Apple/iOS 令牌体系不变**。

现有令牌体系（apple-gray / apple-dark / brian-blue / 语义四色）是全局单一事实源（tailwind.config.js + globals.css），直接改令牌会波及全部页面；对话页组件与 7 个 blocks 组件高度自包含，但 Header / PageBreadcrumb / ModalShell / ConfirmDialog 为跨页共享。

## 决策

1. **并行令牌族而非替换**：`tailwind.config.js` 新增 `linear` 颜色命名空间（canvas / surface-1~4 / hairline 三级 / ink 四级 / primary 三态 / success / on-primary / danger）、`linear-*` 圆角阶梯（xs=4 / sm=6 / md=8 / lg=12 / xl=16 / pill）与 `font-linear` 字体族（Inter 优先回退系统栈）。apple 令牌原样保留，两族并行。
2. **`.theme-linear` CSS 变量作用域**：globals.css 新增 `.theme-linear` 类，仅在子树内把 `--brian-*` 语义变量切换为 Linear 值，使焦点环、选区、滚动条、markdown 链接/代码块、图谱吸附线等全局样式自动跟随；ChatView 根节点挂载，不挂载的页面不受影响。
3. **共享组件走 variant prop**：Header / PageBreadcrumb 新增 `variant?: 'glass' | 'linear'`，ModalShell / ConfirmDialog 新增 `variant?: 'default' | 'linear'`，默认值维持原渲染路径不变，对话页显式传 linear。Teleport 到 body 的弹层在 overlay 根节点补挂 `theme-linear` 类保证作用域连续。
4. **语义映射收敛**（DESIGN.md 为唯一强调色规范）：
   - 主操作 / 链接 / 品牌标 / 焦点 / 钉住 / 星级 / 流式光标 → linear-primary / primary-hover；
   - 钉住、星级、评估徽标、stop 按钮等原 warning-orange 语义 → 降级为 lavender 或次级墨色（Linear 无警示橙）；
   - success 语义 → linear-success (#27a644，DESIGN.md 唯一语义色)；错误语义 → linear-danger (#e5484d，产品语义扩展色，依据 DESIGN.md Known Gaps：产品面使用更丰富的语义色，营销面才无红)；
   - 卡片深度一律用 surface 阶梯 + hairline 描边表达，去掉投影（DESIGN.md Elevation）；
   - ChatMap 边线由硬编码蓝紫 #2563eb/#8b5cf6/#0284c7/#3b82f6 收敛为薰衣草系（选中 #828fff、入边 #7a7fad、引文 #5e6ad2、中性 ink-subtle 透明色）。
5. **对话页暗色-only**：Linear 令牌为固定深色值，不随应用明暗主题切换（DESIGN.md 明确不提供 light 模式）；顶部导航、侧栏、面包屑、弹层在对话页内全部随主题切换。ChatView 移除 NeuralBackground 粒子背景（"dark canvas IS the whitespace"）。

## 后果

- 其他页面零改动（已验证：/ 首页渲染与改造前一致；lint/typecheck/build/161 项前端测试全部通过）。
- 后续其他页面迁移 Linear 时，复用同一令牌族与 variant 模式，逐页挂载 `.theme-linear` 即可，最终可收敛回单一主题。
- `linear-danger` 为 DESIGN.md 之外的扩展令牌，已在 tailwind.config.js 注释中注明依据。
