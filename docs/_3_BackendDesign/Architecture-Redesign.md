# Brian-Agent 架构审计与重设计

> 版本：2026-09-05 · 基于 `feat/application-monitor-feedback` 分支重构成果

## 1. 结论摘要

**五层架构（Base → Core → Agent → Orchestration → Application）方向正确，无需推翻。**  
不合理之处集中在 **HTTP 组合根边界** 与 **Application 层覆盖不全**，而非分层本身。

本次重构目标：

1. 将 HTTP 路由从 `dev-server.ts` 拆出，形成可扩展的 **HTTP 路由层**（`brian-backend/http/`）。
2. 补齐 **Application/Memory**、下沉 **ThinkingChainBuilder** 到 Chat 模块。
3. 统一 Monitor / Feedback / Memory 的 **Access → Service** 调用链，消除内联 SQL 与假成功响应。
4. 输出目标架构图与演进路线，供后续继续拆分 Config/Chat/Tool 等路由。

---

## 2. 现状架构（重构前）

```text
Vue 前端
    │  HTTP / WS
    ▼
dev-server.ts（组合根 + 路由 + 业务 helper，~4700 行）
    ├── 直接 if/else 路由（~100 分支）
    ├── 内联 SQL（Memory、Config 快照、LLM CRUD…）
    ├── buildThinkingBlocksAndDag（~560 行，应在 Chat）
    └── 部分域已委托 Application Access（Chat/Config/Learning…）

Application（5 模块 PRD 定义，实际 7 模块含 Monitor/Feedback）
    ▼
Orchestration → Agent → Core → Base
```

### 2.1 判定为不合理的设计

| 问题 | 根因 | 风险 |
|------|------|------|
| `dev-server.ts` 上帝文件 | 组合根、路由、DTO 映射、领域 helper 三合一 | 难测试、难 review、改路由易误伤 |
| Memory 路由内联 SQL | 无 Application/Memory 模块 | 信息页 API 与 InfoCore 边界模糊 |
| Feedback POST 假成功 | 未建 Service/表 | 用户反馈无法驱动 Evolutor |
| Monitor 无 Application | 健康/日志/Token 散在 HTTP | 与 Monitor PRD 不一致 |
| ThinkingChain 在 dev-server | Chat 历史 enrichment 未归属 Chat | Chat 单测无法覆盖思考链重建 |
| 文档写 5 模块 | Application-PRD 未同步 | 新人按文档找不到 Monitor/Feedback/Memory |
| Base StrategyProvider / IM Gateway | PRD 幽灵模块 | 与 AgentStrategy/OrchestrationStrategy 重复 |

**保留不变（刻意不造轮子）：**

- 策略执行继续用 **AgentStrategy + OrchestrationStrategy**，不在 Base 再造 StrategyProvider。
- IM Gateway 暂不实现空壳；外部消息仍走现有 Chat/Orchestration 路径。
- 不引入 Hono/Express 框架，避免全量路由重写。

---

## 3. 目标架构（重构后）

```text
Vue 前端
    │  HTTP / WS
    ▼
dev-server.ts（组合根 + 启动 + 剩余路由，~3500 行，持续瘦身）
    │
    ├── http/router.ts ── dispatch ──┬── routes/monitor.ts
    │                                 ├── routes/feedback.ts
    │                                 └── routes/memory.ts
    │
    └── buildContext() → 各层 Access 实例

Application（8 模块）
  Chat ────────────── ThinkingChainBuilder（思考链/DAG 重建）
  Config ──────────── 唯一配置入口（注册+代理）
  SelfLearning ────── 资料库 / Tag 维护
  UserProfile ─────── 画像聚合展示
  Visualization ───── 可视化数据封装
  Monitor ─────────── 健康 / 资源 / 日志 / Token
  Feedback ────────── 用户反馈 CRUD
  Memory ──────────── 信息页记忆 / 图谱 / 热力图
    ▼
Orchestration → Agent → Core → Base
```

### 3.1 层级依赖规则（不变）

```text
Application ──access──► Orchestration / Agent / Core
Application ──access──► Base（仅 RelationDB、Log）
外部资源（LLM/Skill/MCP/Prompt）必须经 Core，禁止 Application 直调 Base Provider（Visualization/Monitor 读聚合数据除外）。
```

### 3.2 HTTP 路由层约定

| 文件 | 职责 |
|------|------|
| `http/response.ts` | `sendJson` / `jsonBody` / CORS 头 |
| `http/types.ts` | `RouteContext`、`HttpRouteRequest` |
| `http/router.ts` | 按域 dispatch，先匹配先返回 |
| `http/routes/*.ts` | 薄 handler：解析 query/body → Access → JSON |

**新增路由时：** 优先在 `http/routes/<domain>.ts` 增加 handler，并在 `router.ts` 注册；业务逻辑只写在 Application Service。

### 3.3 Application 模块清单（更新后）

| 模块 | HTTP 前缀 | 状态 |
|------|-----------|------|
| Chat | `/api/chat` | 成熟；ThinkingChain 已下沉 |
| Config | `/api/config` | 成熟；快照/部分 model 路由仍待迁入 |
| SelfLearning | `/api/learning` | 成熟 |
| UserProfile | `/api/profile` | 成熟 |
| Visualization | `/api/visualization` | 成熟 |
| Monitor | `/api/monitor`、`/api/analytics` | 已模块化 + HTTP 路由拆分 |
| Feedback | `/api/feedback` | 已模块化 + HTTP 路由拆分 |
| Memory | `/api/memory` | **新增** + HTTP 路由拆分 |

---

## 4. 本次已落地重构

| 变更 | 路径 | 效果 |
|------|------|------|
| HTTP 路由层 | `brian-backend/http/` | Monitor/Feedback/Memory 28 条路由脱离 dev-server |
| Memory 模块 | `Application/Memory/` | 13 个 Service 方法 + 7 条单测 |
| ThinkingChainBuilder | `Application/Chat/application/ThinkingChainBuilder.ts` | dev-server 减少 ~560 行业务逻辑 |
| 统一 HTTP 工具 | `http/response.ts` | 消除 sendJson/jsonBody 重复 |
| dev-server 瘦身 | `dev-server.ts` | 4700+ → ~3500 行（-25%） |

---

## 5. 后续演进路线（P1–P5）

| 优先级 | 任务 | 预估 dev-server 减量 |
|--------|------|---------------------|
| P1 | `http/routes/chat.ts` + Chat history enrichment 迁入 ChatService | -400 行 |
| P2 | Config 快照/reset/model CRUD → ConfigService + routes/config.ts | -200 行 |
| P3 | Tool/Bookmark/CDT/Agent 直连路由 → 各 Base 薄 Gateway 或 Application 适配 | -800 行 |
| P4 | `buildContext` → `bootstrap/context.ts` | 结构清晰，行数不变 |
| P5 | 同步 README、Application-PRD、Feedback PRD | 文档一致 |

**终态目标：** `dev-server.ts` 仅保留 `main()`、WebSocket、`buildContext()` 调用与 `dispatchHttpRoutes()`；全部 REST 路由在 `http/routes/`。

---

## 6. 验证

```bash
# Application 层（含 Memory 新增用例）
cd brian-backend/Application && npx vitest run

# 类型检查
cd brian-backend/Application && npx tsc --noEmit
```

重构后新增/回归测试：

- `test/memory.test.ts` — TC-MEM-001 ~ 007
- `test/monitor.test.ts`、`test/feedback.test.ts` — 保持通过

---

## 7. 相关文档

- DDD 规范：`docs/_1_DevStandards/DDDStandards.md`
- Application PRD（待更新模块数）：`docs/_3_BackendDesign/_05_Application/Application-PRD.md`
- Monitor PRD：`docs/_3_BackendDesign/_05_Application/Monitor/Monitor-PRD.md`
- 可视化架构图：[架构审计与重构 canvas](/Users/SEI/.cursor/projects/Users-SEI-Code-brian-agent/canvases/architecture-redesign.canvas.tsx)
