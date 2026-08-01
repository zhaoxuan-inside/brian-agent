基于你已确定的核心约束（Vue3 + NativeUI + Vue Router + Pinia）以及“Notion-like Content Block”的架构目标，以下是面向生产环境的 SPA 前端完整技术选型清单。本选型仅包含技术栈决策与工具链选择，不涉及具体组件设计与实现细节。

### 1. 核心框架层

| 技术领域 | 选型 | 版本要求 | 选型依据 |
| :--- | :--- | :--- | :--- |
| 视图框架 | Vue 3 | ^3.5+ | Composition API + `<script setup>` 是块级抽象与组合式函数的基础 |
| UI 基础库 | NativeUI | 最新稳定版 | 遵循既定约束；需确认其 Vue3 兼容性与 Tree-shaking 支持 |
| 路由管理 | Vue Router | ^4.4+ | 支持嵌套 Layout、动态路由参数、路由级代码分割 |
| 状态管理 | Pinia | ^2.2+ | 类型推导完善，支持 Store 模块化拆分，适配块数据模型 |
| 开发语言 | TypeScript | ^5.5+ | **强制启用**；可辨识联合类型是实现块类型安全的唯一可靠手段 |

### 2. 构建与工程化层

| 技术领域 | 选型 | 用途 |
| :--- | :--- | :--- |
| 构建工具 | Vite | ^6.x；原生 ESM、极速 HMR、对 Web Worker 与异步组件友好 |
| 代码规范 | ESLint Flat Config + Prettier | Vue3 新标准配置，统一代码风格与质量门禁 |
| Git 规范 | Husky + lint-staged + commitlint | 提交前自动校验，约束 commit message 格式 |
| CSS 方案 | SCSS Modules / UnoCSS | 样式隔离 + 原子化扩展，避免块组件间样式污染 |
| 类型校验 | vue-tsc | 构建时强制类型检查，防止块类型定义错误流入生产 |

### 3. 业务专项技术层

#### 3.1 Content Block 体系支撑

| 技术领域 | 选型 | 用途 |
| :--- | :--- | :--- |
| 虚拟滚动 | @tanstack/vue-virtual | 支持动态高度测量与缓存，适配不同块类型的可变尺寸 |
| 富文本/Markdown | markdown-it + dompurify | 文本块渲染与 XSS 防护，支持自定义语法扩展 |
| 代码高亮 | highlight.js / shiki | 代码块语法着色，shiki 性能更优但体积稍大 |
| 拖拽排序 (可选) | @dnd-kit/vue | 块级拖拽重排，操作数据而非 DOM，与虚拟列表兼容 |
| 序列化校验 | zod / valibot | 运行时块数据结构校验，防止后端脏数据导致渲染崩溃 |

#### 3.2 组织架构 Canvas 专项

| 技术领域 | 选型 | 用途 |
| :--- | :--- | :--- |
| 图可视化引擎 | AntV X6 / LogicFlow | 内置树形布局、连线计算、视口裁剪，避免手写 Canvas 底层 |
| 后台计算 | Web Worker + OffscreenCanvas | 布局计算与渲染卸载至 Worker，避免阻塞主线程块渲染 |
| 手势处理 | @use-gesture/vanilla | 统一 Canvas 缩放、平移、触摸交互，跨端一致 |

#### 3.3 通信与数据层

| 技术领域 | 选型 | 用途 |
| :--- | :--- | :--- |
| HTTP 请求 | ofetch / axios | 拦截器、Token 刷新、请求取消，ofetch 对 TS 支持更优 |
| 实时通信 | Socket.IO-client / native WS | IM 消息收发；封装为 Composable 统一管理连接生命周期 |
| 本地持久化 | pinia-plugin-persistedstate | 会话草稿、用户偏好等轻量数据本地缓存 |
| 日期处理 | date-fns / dayjs | 消息时间戳格式化，按需引入避免全量打包 |

### 4. 质量保障层

| 技术领域 | 选型 | 用途 |
| :--- | :--- | :--- |
| 单元测试 | Vitest + Vue Test Utils | 块数据转换、类型守卫、Store 逻辑测试，与 Vite 同构 |
| E2E 测试 | Playwright | Canvas 交互验证、块渲染流程、消息收发端到端测试 |
| 性能监控 | Web Vitals + Sentry | 块渲染耗时、Canvas FPS、内存泄漏、JS 异常上报 |
| 视觉回归 | Chromatic / Percy | 块组件样式变更自动截图对比，防止 UI 退化 |

### 5. 选型关键约束说明

1.  **NativeUI 风险预案**：若 NativeUI 不支持 Vue3 核心特性（Teleport/Suspense/Fragment），需在项目启动前完成 POC 验证，并预留 UI 层抽象接口以便无缝替换。
2.  **TypeScript 严格模式**：必须开启 `strict: true`，块类型系统依赖严格类型推导，宽松模式下可辨识联合类型将失效。
3.  **块数据纯序列化**：所有块内容数据必须是 JSON 可序列化的，禁止在 Store 中存储 File、Blob、Component 实例等非序列化对象。
4.  **Worker 通信协议前置设计**：Canvas Worker 与主线程的消息格式需在开发初期定义并固化，避免后期重构成本。
5.  **虚拟列表动态高度**：必须选择支持 `measureElement` 的方案，固定高度虚拟列表无法适配 Notion-like 块模型。