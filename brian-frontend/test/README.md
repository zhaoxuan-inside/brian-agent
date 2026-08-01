# 前端测试用例 - 总索引

> **生成日期**: 2026-08-01
> **覆盖范围**: Brian-Agent 前端 6 大页面模块
> **测试框架**: Vitest + Vue Test Utils + @vue/test-utils（推荐）
> **总计测试用例**: 330 条

---

## 测试用例文件清单

| 文件 | 对应页面 | 路由 | 测试用例数 | 优先级分布 P0/P1/P2/P3 |
|------|---------|------|-----------|----------------------|
| [TR-整体页面-全局导航与框架.md](./TR-整体页面-全局导航与框架.md) | 整体布局 | `/` (框架层) | 22 | 9 / 7 / 5 / 1 |
| [TR-对话页面.md](./TR-对话页面.md) | 对话页 | `/` | 76 | 20 / 35 / 18 / 3 |
| [TR-配置页面.md](./TR-配置页面.md) | 配置页 | `/config` | 52 | 18 / 20 / 11 / 3 |
| [TR-信息页面.md](./TR-信息页面.md) | 信息页 | `/info` | 63 | 16 / 29 / 17 / 1 |
| [TR-学习页面.md](./TR-学习页面.md) | 学习页 | `/learning` | 54 | 12 / 22 / 18 / 2 |
| [TR-监控页面.md](./TR-监控页面.md) | 监控页 | `/monitor` | 77 | 20 / 37 / 19 / 1 |

---

## 各页面测试覆盖汇总

### 1. 整体页面 - 全局导航与框架 (22 条)
- 认证与登录 (TC-LAYOUT-001 ~ 006)
- Header 导航栏 (TC-LAYOUT-007 ~ 012)
- 暗模式切换 (TC-LAYOUT-013 ~ 015)
- i18n 语言切换 (TC-LAYOUT-016 ~ 019)
- 用户画像入口 (TC-LAYOUT-020)
- 响应式布局 (TC-LAYOUT-021 ~ 022)

### 2. 对话页面 (76 条)
- 对话输入区 / InputBox (TC-CHAT-001 ~ 010)
- 引用功能 (TC-CHAT-011 ~ 015)
- 对话内容展示 Block-Native (TC-CHAT-016 ~ 034)
- 流式协议 SSE (TC-CHAT-035 ~ 046)
- ChatMap 可视化区 (TC-CHAT-047 ~ 056)
- Agent 编排 DAG 弹窗 (TC-CHAT-057 ~ 061)
- 会话管理侧边栏 (TC-CHAT-062 ~ 070)
- 性能与边界 (TC-CHAT-071 ~ 076)

### 3. 配置页面 (52 条)
- L1 整体框架层 (TC-CONFIG-001 ~ 007)
- L2/L3 卡片网格 (TC-CONFIG-008 ~ 013)
- L4 配置列表 (TC-CONFIG-014 ~ 021)
- L5 配置读写区 (TC-CONFIG-022 ~ 031)
- 面包屑导航 (TC-CONFIG-032 ~ 034)
- 全局搜索 (TC-CONFIG-035 ~ 037)
- 配置模块覆盖 (TC-CONFIG-038 ~ 044)
- 模型管理专项 (TC-CONFIG-045 ~ 049)
- 黑暗模式适配 (TC-CONFIG-050 ~ 052)

### 4. 信息页面 (63 条)
- 全局 Tab 切换 (TC-INFO-001 ~ 004)
- Tab 1 - 问答记忆 (TC-INFO-005 ~ 019)
- Tab 2 - 资料库 (TC-INFO-020 ~ 038)
- Tab 3 - Tag 关系图 (TC-INFO-039 ~ 049)
- Tab 4 - 关键词图 (TC-INFO-050 ~ 056)
- 跨模块联动 (TC-INFO-057 ~ 060)
- 错误与空状态 (TC-INFO-061 ~ 063)

### 5. 学习页面 (54 条)
- 学习控制区 (TC-LEARN-001 ~ 005)
- 随机因子配置 (TC-LEARN-006 ~ 009)
- 学习模式选择 (TC-LEARN-010 ~ 013)
- 学习统计区 (TC-LEARN-014 ~ 018)
- 学习进度区 (TC-LEARN-019 ~ 031)
- 学习成果区 (TC-LEARN-032 ~ 045)
- 响应式布局 (TC-LEARN-046 ~ 047)
- 埋点事件 (TC-LEARN-048 ~ 054)

### 6. 监控页面 (77 条)
- 全局告警横幅 (TC-MONITOR-001 ~ 007)
- 刷新控制 (TC-MONITOR-008 ~ 014)
- 组件健康状态区 (TC-MONITOR-015 ~ 027)
- 宿主机资源使用区 (TC-MONITOR-028 ~ 036)
- Token 使用统计区 (TC-MONITOR-037 ~ 045)
- 日志可视化区 (TC-MONITOR-046 ~ 063)
- WebSocket 连接 (TC-MONITOR-064 ~ 068)
- 异常处理与容错 (TC-MONITOR-069 ~ 073)
- 响应式布局 (TC-MONITOR-074 ~ 077)

---

## 涉及的 API 端点到页面映射

| API 端点 | 页面 |
|----------|------|
| `GET /api/chat/stream` (SSE) | 对话页面 |
| `POST /api/chat/work` | 对话页面 |
| `GET/POST/DELETE /api/chat/session*` | 对话页面 |
| `GET /api/chat/agent-chain` | 对话页面 |
| `POST /api/chat/feedback` | 对话页面 |
| `GET/POST/PUT /api/config/*` | 配置页面 |
| `GET/POST/PUT /api/config/llm/*` | 配置页面 |
| `GET /api/memory/work/*` | 信息页面 |
| `GET /api/memory/keyword-graph` | 信息页面 |
| `GET /api/learning/tag/graph` | 信息页面 |
| `GET/POST/DELETE /api/learning/library*` | 信息页面 / 学习页面 |
| `GET/POST /api/learning/start` / `stop` / `progress` | 学习页面 |
| `GET /api/learning/stats` | 学习页面 |
| `GET /api/learning/knowledge` | 学习页面 |
| `GET /api/learning/insights` | 学习页面 |
| `GET /api/monitor/health-all` | 监控页面 |
| `GET /api/system/resources` | 监控页面 |
| `GET /api/analytics/token-*` | 监控页面 |
| WebSocket `/api/monitor/logs/stream` | 监控页面 |
| `GET /api/monitor/logs/query` | 监控页面 |
| `GET /api/monitor/logs/stats` | 监控页面 |

---

## 涉及的前端 Store 覆盖

| Store | 相关测试用例 |
|-------|------------|
| `auth` | TC-LAYOUT-001 ~ 006 |
| `theme` | TC-LAYOUT-013 ~ 015, TC-CONFIG-050 ~ 052 |
| `i18n` | TC-LAYOUT-016 ~ 019 |
| `session` | TC-CHAT-009, TC-CHAT-035 ~ 046, TC-CHAT-062 ~ 070 |

---

## 核心 PRD 文档参考

- [整体页面-PRD](../docs/_2_FrontendDesign/整体页面-PRD.md)
- [对话Page-PRD](../docs/_2_FrontendDesign/_01_对话页面/对话Page-PRD.md)
- [配置Page-PRD](../docs/_2_FrontendDesign/_02_配置页面/配置Page-PRD.md)
- [信息Page-PRD](../docs/_2_FrontendDesign/_03_信息页面/信息Page-PRD.md)
- [学习Page-PRD](../docs/_2_FrontendDesign/_04_学习页面/学习Page-PRD.md)
- [监控Page-PRD](../docs/_2_FrontendDesign/_05_监控页面/监控Page-PRD.md)
- [内容块展示](../docs/_2_FrontendDesign/_00_内容块展示/内容块展示.md)
- [后端设计总文档](../docs/_3_BackendDesign/)

---

## 测试环境搭建建议

```bash
# 安装测试依赖
npm install --save-dev vitest @vue/test-utils jsdom @pinia/testing

# vitest.config.ts 配置
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```
