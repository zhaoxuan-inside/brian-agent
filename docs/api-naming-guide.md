# API 命名规范与避坑指南

> 整理日期：2026-07-18

## 1. `/api/statistics` vs `/api/stats` 命名混淆

| 前缀 | 路由文件 | 职能 | 前端页面 |
|------|---------|------|---------|
| `/api/statistics` | `access/statisticRoutes.ts` | **LLM 业务指标**：令牌用量、消息统计、记忆统计、环形图、贡献热力图、VectorDB 状态、每模型统计 | `MonitorPanel.vue` — 监控面板 |
| `/api/stats` | `access/statsRoutes.ts` | **系统基础设施监控**：CPU、内存、磁盘、进程 uptime、模型配置列表（含状态/配额）、Token 日历矩阵、延迟矩阵、限流数据、存储状态 | `MonitorPanel.vue` — 监控面板 |

### 关键区别

- `statistics` → 关注 **"用了多少"**（token 消耗、调用次数、消息量）
- `stats` → 关注 **"跑得怎么样"**（CPU、内存、磁盘、模型健康）

### 注意

1. **两者同时被 `MonitorPanel.vue` 使用**，是同一个监控页面的两个数据源
2. **不可合并**：一个是 LLM 业务层，一个是系统基础设施层
3. **易混淆**：命名仅差 3 个字母（`-ics`），建议后续重命名：
   - 方案 A：`/api/statistics` → `/api/analytics`（业务分析）
   - 方案 B：`/api/stats` → `/api/system` 或 `/api/infra`（基础设施）

---

## 2. `/api/skill` vs `/api/config/skill` 功能重叠

| 前缀 | 路由文件 | 操作 | 底层 |
|------|---------|------|------|
| `/api/skill` | `access/skillRoutes.ts` | CRUD + toggle + install/uninstall | `SkillManager.createSkill/getSkill/updateSkill/deleteSkill` |
| `/api/config/skill` | `access/configRoutes.ts` | 列表/创建/删除/更新 | `SkillManager.registerSkill` → `createSkill`（包装） |

### 关键发现

- 两者**调用同一 `SkillManager` 实例**，读写**同一 `skills` 表**
- `/api/config/skill` 完全被 `/api/skill` 覆盖
- `/api/skill` 额外提供：`/:id/toggle`、`/:id/install`、`/:id/uninstall`

### 建议

**废弃 `/api/config/skill`**，统一使用 `/api/skill`。`/api/config/skill` 的 4 个端点（列表/创建/删除/更新）全部在 `/api/skill` 有等价实现。

---

## 3. `/api/config/mcp` vs `/api/mcp` 部分重叠

| 前缀 | 功能 |
|------|------|
| `/api/mcp` | 市场浏览、安装/卸载、市场管理、toggle |
| `/api/config/mcp` | 列表查询、安装/卸载、更新 |

两者都有安装/卸载功能，建议统一到 `/api/mcp`。

---

## 4. Toggle 模式统一

`POST /:id/toggle` 端点最初在 `skillRoutes`、`mcpRoutes`、`agentRoutes` 中各有独立实现。现已提取到 `access/toggleHandler.ts`：

- `createToggleHandler()` — get→update 模式（skill, mcp）
- `createDirectToggleHandler()` — 专用 toggle 方法模式（agent）

---

## 5. 已删除的死代码

`backend/src/routes/` 目录下 9 个文件（agent.ts, chat.ts, feedback.ts, learning.ts, library.ts, mcp.ts, memory.ts, skill.ts, stats.ts）已确认零引用并删除。备份位于 `backend/src/routes.backup/`。
