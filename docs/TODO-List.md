# 系统开发 TODO 列表

## 待实现功能

### 1. 配置变更历史记录与 Diff 对比

| 项目 | 内容 |
|------|------|
| **所属模块** | Config Application |
| **优先级** | P1 |
| **设计文档** | `docs/_3_BackendDesign/_05_Application/Config/Config-PRD.md` |
| **需求来源** | `docs/_2_FrontendDesign/_02_配置页面/配置Page-PRD.md` |

**前端需求**：
- `getConfigHistory` GET — 获取配置变更历史
- 配置项 L5 修改前 Diff 对比视图

**后端需实现**：
- 新增 `config_history` 表（config_key, old_value, new_value, change_time, operator）
- 每次 `updateConfig` 时记录变更历史
- `GET /api/config/history/:config_key` — 查询某配置项的变更历史
- `GET /api/config/history` — 查询全局变更历史（支持时间范围过滤）

**状态**：待开发
