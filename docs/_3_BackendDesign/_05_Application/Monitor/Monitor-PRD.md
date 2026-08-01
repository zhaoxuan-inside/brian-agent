# Monitor Application

## 1. 设计目标

1. 聚合各层面组件（LLM Provider、MCP、RelationDB、GraphDB、VectorDB、MQ）的健康状态，提供统一健康检查入口；
2. 提供系统资源监控数据（CPU、内存、磁盘），供前端监控面板展示；
3. 提供 Token 使用趋势和模型分布统计数据；
4. 提供日志查询、日志统计和实时日志流能力；
5. 作为 Application 层模块，通过 `/api/monitor/*` 对外暴露 HTTP 接口。

## 2. 模块职责

Monitor Application 是系统可观测性的统一入口，位于 Application 层。它聚合 Base 层各 Provider 的 `visualized*` 方法和 `call_history` 表的 Token 使用数据，并通过 LogProvider 的 SQLite 持久化能力提供日志查询服务。

### 依赖关系

| 依赖层级 | 模块 | 用途 |
|---------|------|------|
| Base | RelationDBProvider | 关系数据库健康检查、call_history 查询 |
| Base | LogProvider | 日志查询和统计（SQLite 持久化模式） |
| Base | LLMProvider | LLM 提供商健康状态 |
| Base | MCPProvider | MCP 服务健康状态 |
| Base | GraphDBProvider | 图数据库健康状态 |
| Base | VectorDBProvider | 向量数据库健康状态 |
| Base | MQProvider | 消息队列健康状态 |
| System | Node.js os 模块 | CPU、内存、负载信息 |
| System | Node.js fs 模块 | 磁盘使用信息 |

## 3. HTTP 端点设计

### 3.1. 组件健康检查 (`GET /api/monitor/health-all`)

**输出**：
```json
{
  "components": [
    {
      "name": "RelationDB",
      "status": "HEALTHY",
      "responseTime": 2,
      "details": { "type": "SQLite" }
    },
    {
      "name": "GraphDB",
      "status": "HEALTHY",
      "responseTime": 0,
      "details": {
        "type": "TinyGraphDB"
      }
    },
    {
      "name": "VectorDB",
      "status": "HEALTHY",
      "responseTime": 0,
      "details": { "type": "LanceDB" }
    },
    {
      "name": "MQ",
      "status": "HEALTHY",
      "responseTime": 0,
      "details": { "type": "SQLiteMQ" }
    }
  ],
  "timestamp": 1234567890000
}
```

**状态取值**：`HEALTHY`（绿色）/ `WARNING`（黄色）/ `ERROR`（红色）

### 3.2. 系统资源监控 (`GET /api/monitor/resources`)

**输出**：
```json
{
  "cpu": {
    "usage": 45.5,
    "cores": 8,
    "load1": 2.1,
    "load5": 1.8,
    "load15": 1.5
  },
  "memory": {
    "usage": 68.2,
    "used": 8192,
    "total": 12000
  },
  "disk": {
    "usage": 55.0,
    "used": 51200,
    "total": 93151,
    "dataDirUsage": 55.0
  },
  "timestamp": 1234567890000
}
```

**颜色阈值**：< 70% 绿色，70-90% 黄色，> 90% 红色

### 3.3. Token 趋势数据 (`GET /api/analytics/token-trend`)

**入参**：`range`（Query String，可选）：`7`（默认）/ `30` / `90`

**输出**：
```json
{
  "points": [
    { "timestamp": "2026-08-01 10:00", "value": 1500 },
    { "timestamp": "2026-08-01 11:00", "value": 2300 }
  ]
}
```

**粒度**：≤7 天按小时，>7 天按天。

### 3.4. 模型用量分布 (`GET /api/analytics/model-distribution`)

**输出**：
```json
{
  "models": [
    { "name": "GPT-4o", "tokens": 2500000 },
    { "name": "Claude-3.5-Sonnet", "tokens": 1200000 }
  ]
}
```

取 Top 10 模型。

### 3.5. 日志查询 (`GET /api/monitor/logs/query`)

**入参**（Query String）：
- `level`（STRING，可选）：日志级别（DEBUG / INFO / WARN / ERROR）
- `source`（STRING，可选）：日志来源模块
- `keyword`（STRING，可选）：关键词搜索（匹配 message）
- `start_time`（INT，可选）：起始时间（毫秒时间戳）
- `end_time`（INT，可选）：结束时间（毫秒时间戳）
- `page`（INT，可选）：页码，默认 1
- `pageSize`（INT，可选）：每页条数，默认 50

**输出**：
```json
{
  "logs": [
    {
      "id": "log-uuid",
      "timestamp": 1234567890000,
      "level": "ERROR",
      "source": "ChatService",
      "message": "LLM call failed",
      "stackTrace": "Error: ...\n    at ..."
    }
  ],
  "total": 5000,
  "page": 1,
  "pageSize": 50
}
```

### 3.6. 日志级别分布统计 (`GET /api/monitor/logs/stats`)

**入参**（Query String）：
- `start_time`（INT，可选）
- `end_time`（INT，可选）

**输出**：
```json
{
  "distribution": [
    { "level": "INFO", "count": 12000 },
    { "level": "ERROR", "count": 50 },
    { "level": "WARN", "count": 200 },
    { "level": "DEBUG", "count": 5000 }
  ]
}
```

## 4. 表设计

Monitor 模块本身不维护独立数据表。Token 统计使用 `call_history` 表（已有），日志查询使用 `log_record` 表（由 LogProvider 管理）。

## 5. 前端页面需求覆盖

| 前端页面需求 | 对应接口 | 说明 |
|------------|---------|------|
| 组件健康状态卡片 | `GET /api/monitor/health-all` | 6 组件状态 + 响应时间 |
| 主机资源卡片 | `GET /api/monitor/resources` | CPU/内存/磁盘使用率 |
| Token 统计卡片 | `GET /api/analytics/token-usage` | 今日/月度 Token + 请求数 |
| Token 趋势图 | `GET /api/analytics/token-trend` | 7/30/90 天折线图数据 |
| 模型分布图 | `GET /api/analytics/model-distribution` | 按模型 Token 消耗柱状图 |
| 日志查看器筛选 | `GET /api/monitor/logs/query` | 按级别/来源/关键词/时间查询 |
| 日志级别分布 | `GET /api/monitor/logs/stats` | 迷你柱状图数据 |
| 日志实时推送 | SSE `GET /api/monitor/logs/stream` | 待后续实现 |
| 告警横幅 | 前端根据 health-all 和 resources 数据自行判断 | 无独立接口 |
| 自动刷新 | 前端 30s 轮询 | 见各端点 |

## 6. 重要内容

1. Monitor Application 不直接操作 Provider，通过现有的 `systemRoutes`（系统资源）、`analyticsRoutes`（Token 统计）和新增的 `monitorRoutes`（健康检查 + 日志查询）实现；
2. 日志查询依赖 LogProvider 的 SQLite 持久化模式（`write_mode=BOTH`）；
3. 系统资源数据通过 Node.js `os` 和 `fs` 模块实时获取，不缓存；
4. Token 统计通过 `call_history` 表的 SQL 聚合查询实现；
5. 健康检查对 RelationDB 执行 `SELECT 1` 判定连接状态，其他组件暂为静态状态标识；
6. 告警逻辑（CPU >90%、ERROR 日志频率等）由前端根据接口返回值自行判断，后端不内置告警阈值。
