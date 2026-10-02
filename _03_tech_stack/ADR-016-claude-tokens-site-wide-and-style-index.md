# ADR-016: 全站 Claude 暖色令牌化与前端样式索引

- 状态: Accepted
- 日期: 2026-10-01
- 设计源: `design-md/claude/DESIGN.md`（延续 ADR-015 的选型）
- 关联: ADR-008（令牌单一事实源）、ADR-015（对话页 Claude 双模式主题）

## 背景

ADR-015 完成对话页 Claude 双模式主题后，用户要求：(1) 全站所有页面统一为该风格；(2) 为前端建立样式索引便于复用。

## 决策

1. **全站换肤走令牌层，不改组件模板**（ADR-008 单一事实源的红利）：
   - `brian-blue` 保留历史命名，值改为 CSS 变量承载的品牌 coral（浅 #cc785c / 深 #d98b70）；`success-green / warning-orange / error-red` 同步变量化为 Claude 语义三色。透明度修饰符经 `<alpha-value>` 继续可用。
   - `apple-gray` 十一级阶梯整体替换为 Claude 暖灰家族（50=#faf9f5 … 950=#141312）；`apple-dark` 四值替换为暖棕表面（bg #181715 / elevated #1f1e1b / grouped #141312 / separator #3a3833）。`dark:` 变体机制不变，全页面自动双模式。
   - **圆角几何 iOS→Claude**：xl 28px(胶囊)→8px(按钮/输入)、2xl 16px→12px(卡片)、3xl/4xl→16px(面板)。全局组件类（btn-*/block-card 等）随之自动改变几何，无需逐个改模板。
   - `boxShadow.focus/glass/lift` 换暖色调。
2. **globals.css 全局变量暖化**：`:root` / `.dark` 的 `--brian-*`（焦点环/选区/滚动条/markdown 链接与引用条/图谱底色/资料库标注与边注）全部换 Claude 暖色值；body 画布 `bg-white`→`bg-apple-gray-50`（Claude 铁律：浅色禁纯白）；glass-panel 暖玻璃化。
3. **落地页硬编码色暖化**：HomeView 与 HeroAppShot scoped CSS 中硬编码的蓝/紫/青/橙/冷灰逐一映射为 coral/teal/amber/暖灰（macOS 红绿灯装饰色保留）；GraphPane 冷灰→暖灰。
4. **首页"产品仿真"演示实例双模式化**（chg-049 补充）：HeroAppShot / GraphShot / MemoryPinShot 根元素挂 `theme-chat` 作用域，内部硬编码深色皮肤全部替换为 `chat-*` 令牌变量（SVG 图元经 class + CSS `fill/stroke` 取变量，因 SVG 属性不支持 var()），随明暗开关与真实产品同步换肤；力导向节点色带由"蓝=低频→红=高频"（hue 210→0，s75%）改为 Claude 暖带"青=低频→珊瑚=高频"（hue 168→18，s58%），同时服务首页演示与 Info 页真实涌现图；HomeView `.home-shot` 外框浅色禁纯白改 #faf9f5，violet/cyan 裸原生色徽标语义化为 success/warning 令牌。
5. **样式索引**：新建 `brian-frontend/STYLE.md` 作为前端样式查阅目录——主题架构、全部色彩/字体/圆角/z-index/阴影/动效令牌表、全局组件类目录、页面接入规则（禁裸原生色/弹层走 ModalShell/画布铁律）、复用代码示例、运维注意（tailwind.config 变更需重启 dev server）。
6. 对话页 `chat-*` 令牌族保持不变（ADR-015）；`.theme-chat` 内对 `--brian-*` 的覆盖与全局值保持同构。

## 后果

- 全站（首页/信息/学习/监控/配置/工具/定时任务/登录/对话）统一 Claude 暖色双模式，浅色暖米白、深色暖棕柔黑，不再有纯黑刺眼问题。
- 组件模板几乎零改动（仅落地页硬编码色与 GraphPane 冷灰），lint 0 error / build 通过 / 17 文件 161 测试全过 / 首页+信息页双模式截图验证。
- `STYLE.md` 成为样式复用入口，登记进 _00 与 _06/02。
