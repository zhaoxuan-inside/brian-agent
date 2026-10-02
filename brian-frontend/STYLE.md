# Brian-Agent 前端样式索引（STYLE.md）

> 单一事实源：`tailwind.config.js` + `src/styles/globals.css`（ADR-008）。
> 全站主题：**Claude 暖色双模式**（设计源 `design-md/claude/DESIGN.md`，ADR-015/016）——暖米白浅色画布 + 暖棕柔黑深色，品牌强调色 coral（#cc785c）。
> 本文件是样式的**查阅目录**：改样式前先到这里找令牌/组件类，禁止新造平行样式。

---

## 1. 主题架构总览

```
┌─ 全局令牌（所有页面）──────────────────────────────┐
│ brian-blue(=coral) / success-green / warning-orange │
│ / error-red + apple-gray 暖灰阶梯 + apple-dark 表面  │
│ 明暗切换：html.dark class（顶栏开关），值经 CSS 变量  │
├─ 对话页令牌（chat 命名空间，仅 .theme-chat 子树）────┤
│ chat-canvas / chat-surface-1~3 / chat-hairline*     │
│ / chat-ink* / chat-primary* / chat-on-primary       │
│ / chat-success / chat-warning / chat-error          │
├─ 共享组件 variant ─────────────────────────────────┤
│ Header / PageBreadcrumb: 'glass'(默认) | 'chat'     │
│ ModalShell / ConfirmDialog: 'default'(默认) | 'chat'│
└────────────────────────────────────────────────────┘
```

- **明暗模式**：全局任何地方用 `dark:` 变体或语义令牌即可自动双模式；`chat-*` 令牌经 CSS 变量（RGB 三元组）自动切换，无需写 `dark:`。
- **弹层（Teleport 到 body）**：dialog 元素会脱离页面 DOM，必须在 overlay 根挂 `theme-chat` 类（对话页弹层）或使用 ModalShell `variant='chat'`，否则拿不到 CSS 变量。

## 2. 色彩令牌

### 2.1 全局语义色（所有页面可用；值随明暗自动切换）

| 令牌 | 浅色值 | 深色值 | 用途 |
|---|---|---|---|
| `brian-blue` | `#cc785c` coral | `#d98b70` | 品牌强调：主按钮、品牌字、激活态、链接（历史命名保留） |
| `success-green` | `#5db872` | `#6fc783` | 成功态、完成徽标 |
| `warning-orange` | `#d4a017` | `#e0b043` | 警示：钉住、星级、评估、停止 |
| `error-red` | `#c64545` | `#d66a6a` | 错误、删除、拒绝 |

透明度写法：`bg-brian-blue/10`、`text-error-red` 等任意 `/N`（变量 + `<alpha-value>`）。

### 2.2 暖灰阶梯 `apple-gray`（Claude muted 家族）

| 级 | 值 | 典型用途 |
|---|---|---|
| 50 | `#faf9f5` | 页面画布（浅） |
| 100 | `#f5f0e8` | 浅色卡片底 |
| 200 | `#e6dfd8` | hairline 分隔线（浅） |
| 300 | `#d6cec0` | 强描边 / 滚动条（浅） |
| 400 | `#a6a29a` | 图标、占位 |
| 500 | `#8e8b82` | 三级文字（浅） |
| 600 | `#6c6a64` | 次级文字（浅） |
| 700 | `#3a3833` | 分隔线（深） |
| 800 | `#1f1e1b` | 卡片底（深） |
| 900 | `#181715` | 深色画布 |
| 950 | `#141312` | 最深表面 |

### 2.3 深色表面 `apple-dark`

| 令牌 | 值 | 用途 |
|---|---|---|
| `bg` | `#181715` | 深色页面画布 |
| `elevated` | `#1f1e1b` | 深色卡片/浮层 |
| `grouped` | `#141312` | 分组列表底 |
| `separator` | `#3a3833` | 深色分隔线 |

### 2.4 对话页专属 `chat-*`（定义于 `.theme-chat`，`brian-frontend/src/views/ChatView.vue` 根节点挂载）

| 令牌 | 浅色 | 深色 | 对应 Claude 语义 |
|---|---|---|---|
| `chat-canvas` | `#faf9f5` | `#181715` | 画布 |
| `chat-surface-1` | `#f5f0e8` | `#1f1e1b` | 卡片/侧栏/输入框底 |
| `chat-surface-2` | `#efe9de` | `#252320` | 次级卡片/嵌套面板 |
| `chat-surface-3` | `#e8e0d2` | `#2c2a26` | 第三层表面 |
| `chat-hairline` / `-strong` / `-tertiary` | `#e6dfd8`/`#d6cec0`/`#c7bdae` | `#3a3833`/`#4a473f`/`#5a564c` | 描边三档 |
| `chat-ink` / `-muted` / `-subtle` / `-tertiary` | `#141413`/`#3d3d3a`/`#6c6a64`/`#8e8b82` | `#faf9f5`/`#d6d2c8`/`#a09d96`/`#75726a` | 文字四档 |
| `chat-primary` / `-hover` / `on-primary` | `#cc785c`/`#a9583e`/白 | `#d98b70`/`#e49a80`/深墨 | 品牌 coral 三态 |
| `chat-success` / `chat-warning` / `chat-error` | 同全局 | 同全局 | 语义三色 |

## 3. 字体 / 字号 / 圆角

- **正文字体**：`font-sans`（系统栈）；对话页根节点挂 `font-chat`（Inter 优先）。**品牌/拉丁显示字**：`font-chat-display`（Copernicus→Georgia 衬线栈），只用于 "Brian" 字样与展示性标题。
- **字号阶梯**：`text-4xs`(11px)、`text-2xs`(12px) 为项目扩展，其余用 Tailwind 标准（10/11/12/14/16/18 收敛）。
- **圆角阶梯（Claude 几何）**：

| 类 | 值 | 用途 |
|---|---|---|
| `rounded-xl` | 8px | 按钮/输入框/小控件（全局默认） |
| `rounded-2xl` | 12px | 卡片 |
| `rounded-3xl` / `4xl` | 16px | 大面板/弹窗 |
| `rounded-chat-md/lg/xl/pill` | 8/12/16/9999px | 对话页专用（同值异名，便于整页迁移） |

## 4. z-index / 阴影 / 动效

- **z-index 表**：`z-drawer`(40) → `z-modal`(50) → `z-modal-top`(55) → `z-popover`(60) → `z-toast`(70)。禁止魔法数。
- **阴影**：`shadow-glass / glass-dark / lift / lift-dark / focus`。Claude 深色下克制用影，卡片层次优先 surface 阶梯 + hairline 描边。
- **动效**：`animate-fade-in / slide-up / slide-right / pulse-soft / cursor-blink / pop-in`；缓动 `ease-ios`。系统已全局尊重 `prefers-reduced-motion`。

## 5. 全局组件类目录（globals.css，直接复用）

| 类 | 用途 | 关键样式 |
|---|---|---|
| `.glass-panel` | 顶栏/浮层面板 | 暖玻璃：canvas/85 + blur + hairline |
| `.glass-input` | 玻璃输入框 | 同上弱化 |
| `.btn-primary` | 主按钮 | coral 底白字，rounded-xl，hover/active/disabled 齐 |
| `.btn-secondary` | 次按钮 | 暖灰底 |
| `.btn-danger` | 危险按钮 | error-red 底 |
| `.icon-btn` | 图标按钮 | p-2 + hover 暖灰底 |
| `.block-card` | 通用卡片 | 白/暖深底 + hairline + rounded-2xl |
| `.chat-card` | Claude 卡片 | surface-1 底 + hairline + 12px（对话页） |
| `.graph-stage` | 关系图画布 | 主题感知底色 + 点阵 + 顶部微光 |
| `.graph-label` | 图节点标签 | 底色描边晕，压线可读 |
| `.markdown-body` | v-html Markdown 排版 | 全局唯一来源，链接/引用条走 `--brian-accent-ink` |
| `.doc-reading` / `.doc-annotation-mark` / `.doc-margin-*` | 资料库阅读器 | 正文排版 + 标注 + 边注 |
| `.hover-lift` | 悬停抬升 | hover:shadow-lift |
| `.text-balance` / `.scrollbar-hide` | 排版/滚动工具 | — |

## 6. 页面接入规则（新页面/新组件必读）

1. **只允许语义令牌**：表达"含义"必须用 `brian-blue / success-green / warning-orange / error-red / apple-gray* / chat-*`；禁止裸 Tailwind 原生色（`red-500`、`sky-*` 等）。
2. **弹层一律走 `ModalShell`**（Esc/焦点圈闭/遮罩/z-modal 内建）；对话页传 `variant='chat'`。确认框走 `ConfirmDialog`。
3. **蓝色记忆**：`brian-blue` 现在就是品牌 coral，历史组件无需改名；新组件如挂在对话页，优先用 `chat-*` 令牌。
4. **新页面默认跟随全局明暗**：根元素写 `bg-apple-gray-50 dark:bg-apple-dark-bg`（或继承 body），不要自建固定色背景。
5. **画布铁律**：浅色画布只用 `#faf9f5`（apple-gray-50 / chat-canvas），禁纯白 `#ffffff` 当页面底色；深色画布只用 `#181715`（apple-dark-bg / chat-canvas），禁纯黑。
6. **"产品仿真"演示实例**（首页 HeroAppShot / GraphShot / MemoryPinShot 等）：根元素挂 `theme-chat` 类，内部全部使用 `chat-*` 令牌（含 SVG 图元经 class + `fill: rgb(var(--chat-*))`，SVG 属性不支持 var()），即可随明暗开关与真实产品同步换肤；禁止在演示组件里硬编码色值。数据驱动的节点色（力导向图）统一走 `forceDirectedLayout.ts` 的暖色带（青=低频 → 珊瑚=高频，`hsl(hue, 58%, 52%)`）。

### 复用示例

```vue
<!-- 主/次按钮 -->
<button class="btn-primary">发送</button>
<button class="btn-secondary">取消</button>

<!-- Claude 卡片（对话页） -->
<div class="chat-card px-4 py-3">
  <p class="text-sm text-chat-ink">标题</p>
  <p class="text-xs text-chat-ink-subtle">说明</p>
</div>

<!-- 状态徽标（pill） -->
<span class="px-2 py-0.5 rounded-chat-pill text-4xs bg-success-green/10 text-success-green">已完成</span>

<!-- 弹层（对话页） -->
<ModalShell :open="open" title="标题" variant="chat" @close="open = false">…</ModalShell>
```

## 7. 运维注意（踩过的坑）

- **改 `tailwind.config.js`（增删令牌/改名/改阶梯）必须重启前端 dev server**，否则老进程持有旧配置，`@apply` 编译 500 → 整页白屏（chg-046 事故）。改 `.vue` 模板类与 `globals.css` 普通样式可热更新。
- 全局 `--brian-*` 变量（焦点环/选区/滚动条/markdown/图谱底色）在 `:root` 与 `.dark` 各一套；`.theme-chat` 内有同构覆盖，改值时两处保持同步。
