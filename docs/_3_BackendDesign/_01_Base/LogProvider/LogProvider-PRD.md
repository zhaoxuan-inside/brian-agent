# LogProvider PRD

## 1. 组件简介

### 1.1 目标

解耦日志和系统，为上层提供统一的日志操作接口。所有的日志调用都要通过 LogProvider 来完成日志的输出方式。

### 1.2 定位

LogProvider 是日志的唯一操作入口，上层不可直接调用 console.log 或其他日志库。
所有组件的日志输出（包括 AOP 切面自动记录的日志）均通过 LogProvider 完成。

LogProvider 是业务日志的持久化入口：**业务错误日志（ERROR）写入 SQLite**（`log_record` 表），支持查询、统计与可视化；**启动/定时任务日志（INFO/WARN）与调试日志（DEBUG）不写库**，改由 dev-server 入口写入本地日志文件（`data/logs/dev-server-YYYY-MM-DD.log`），避免非业务的 AOP 切面日志（`invoke`/`done`）污染日志库。

### 1.3 集成依赖

- 依赖 RelationDBProvider：日志规则（log_rule）与配置项（log_config）存储于关系数据库
- 依赖 shared/aop（AOP 基础框架）：LogProvider 提供 LogInterceptor，实现 shared/aop 的 Interceptor 接口，作为 AOP 四切入点中日志切面的具体实现

### 1.4 日志存储设计

日志按级别分流存储：
- **ERROR（业务错误）** 写入 SQLite（`log_record` 表），按保留天数与最大条数自动老化：
  - 超过保留天数（默认 30 天）的日志自动清理；
  - 日志总条数超过最大保留条数（默认 70 万条）时，自动删除最旧记录。
- **DEBUG（含 AOP 切面的 invoke/done）** 不写库（直接丢弃），避免高频切面日志淹没业务日志；
- **INFO / WARN（启动、定时任务等）** 由 dev-server 入口写本地日志文件，不入库。

老化策略参数从关系数据库配置表 `log_config` 读取（`retention_days` / `max_log_count`），
可在「配置中心」页面动态配置，无需修改代码。

## 2. 公共定义

### 2.1 日志级别枚举

| 枚举值 | 说明 |
| ------ | ---- |
| DEBUG | 调试日志 |
| INFO | 信息日志 |
| WARN | 警告日志 |
| ERROR | 错误日志 |

### 2.2 日志来源枚举

| 枚举值 | 说明 |
| ------ | ---- |
| AOP | AOP 切面自动记录 |
| MANUAL | 手动调用 addLog 记录 |
| SYSTEM | 系统启动/关闭等自动事件 |

## 3. 方法说明

### 3.1 日志管理

#### 3.1.1 addLog

写入日志到 SQLite（`log_record` 表）。写入后按老化策略节流触发清理。

**方法签名**

`Boolean addLog(AddLogInput input, LogContext context, AddLogOutput output)`

**入参（AddLogInput）**

| 字段 | 类型 | 必填 | 说明 |
| ------ | ---- | ---- | ---- |
| data | LogData | 是 | 日志数据 |

**LogData**

| 字段 | 类型 | 必填 | 说明 |
| ------ | ---- | ---- | ---- |
| level | STRING | 是 | 日志级别：DEBUG / INFO / WARN / ERROR |
| source | STRING | 是 | 日志来源：方法名或模块名 |
| message | STRING | 是 | 日志消息 |
| trace_id | STRING | 否 | 请求追踪 ID |
| caller | STRING | 否 | 调用方标识 |
| metadata | JSON | 否 | 附加元数据 |
| elapsed_ms | INT | 否 | 耗时（毫秒），AOP 切面使用 |

**出参（AddLogOutput）**

### 3.3 运维

#### 3.3.1 enableLog

配置记录哪些模块的哪些方法的日志。通过日志规则控制 AOP 切面的日志记录范围。

**方法签名**

`Boolean enableLog(EnableLogInput input, LogContext context, EnableLogOutput output)`

**入参（EnableLogInput）**

| 字段 | 类型 | 必填 | 说明 |
| ------ | ---- | ---- | ---- |
| rules | LogRule[] | 是 | 日志规则列表 |

**LogRule**

| 字段 | 类型 | 必填 | 说明 |
| ------ | ---- | ---- | ---- |
| source | STRING | 是 | 模块名（如 "SoulProvider"），`*` 表示所有模块 |
| method | STRING | 是 | 方法名（如 "addSoul"），`*` 表示该模块的所有方法 |
| enable | BOOLEAN | 是 | 是否记录该模块/方法的日志 |

**规则匹配逻辑**：

1. LogInterceptor 在记录日志前，根据方法调用的 source（模块名）和 method（方法名）匹配规则；
2. 匹配优先级：精确匹配 > 通配符匹配（`*`）；
3. 若存在匹配规则：
   - `enable=true` 的规则：记录日志；
   - `enable=false` 的规则：不记录日志；
4. 若无任何规则匹配：默认记录日志（即无规则时全量记录）；
5. 规则存储于 `log_rule` 表，调用 `enableLog` 时 upsert（按 source + method 唯一）；
6. 规则变更后实时生效（LogService 内存缓存同步更新）；

**出参（EnableLogOutput）**

无额外字段。

**使用示例**：

```typescript
// 只记录 SoulProvider 和 LLMProvider 的日志
await logAccess.enableLog(
  { rules: [
    { source: '*', method: '*', enable: false },           // 先禁用所有
    { source: 'SoulProvider', method: '*', enable: true }, // 再启用 SoulProvider
    { source: 'LLMProvider', method: 'execLLM', enable: true }, // 启用 LLM 的 execLLM
  ]},
  new LogContext(),
  new EnableLogOutput(),
);
```

#### 3.3.2 configLog

配置日志组件的运行时参数（启用状态、默认级别、保留天数、最大保留条数）。

**方法签名**

`Boolean configLog(ConfigLogInput input, LogContext context, ConfigLogOutput output)`

**入参（ConfigLogInput）**

| 字段 | 类型 | 必填 | 说明 |
| ------ | ---- | ---- | ---- |
| enabled | BOOLEAN | 否 | 日志组件是否启用 |
| default_level | STRING | 否 | 默认日志级别（DEBUG / INFO / WARN / ERROR），`addLog` 未指定 level 时使用 |
| min_level | STRING | 否 | 最低日志级别（DEBUG / INFO / WARN / ERROR），低于此级别的日志不记录 |
| retention_days | INT | 否 | 日志保留天数（默认 30 天） |
| max_log_count | INT | 否 | 日志最大保留条数（默认 70 万条） |

**出参（ConfigLogOutput）**

| 字段 | 类型 | 说明 |
| ------ | ---- | ---- |
| config | Object | 当前生效的全部配置 |

**处理逻辑**：

1. 仅更新入参中非 `undefined` 的字段（部分更新）；
2. 更新 `log_config` 表（upsert），并实时刷新运行时缓存；
3. `default_level` 与 `min_level` 校验为 DEBUG / INFO / WARN / ERROR；`retention_days` 与 `max_log_count` 为非负整数；
4. `addLog` 写入时，若日志级别低于 `min_level`，则静默丢弃不写入（`min_level = DEBUG` 表示不过滤）。

### 3.7 查询日志（queryLogs）

**功能**：从 SQLite log_record 表查询日志记录，支持多维过滤和分页。

**条件**：

| 条件 | 类型 | 说明 |
| ------ | ---- | ---- |
| level | STRING | 日志级别（DEBUG/INFO/WARN/ERROR） |
| source | STRING | 日志来源模块（模糊匹配） |
| keyword | STRING | 关键词（匹配 message 字段，SQL LIKE） |
| trace_id | STRING | 请求追踪 ID（模糊匹配） |
| log_source | STRING | 消息来源类型（AOP/MANUAL/SYSTEM，匹配 metadata.log_source） |
| start_time | INT | 起始时间（毫秒时间戳） |
| end_time | INT | 结束时间（毫秒时间戳） |
| page | INT | 页码，默认 1 |
| pageSize | INT | 每页条数，默认 50 |

**返回**：`{ logs: LogRecord[], total: number }`

### 3.8 日志统计（getLogStats）

**功能**：从 SQLite log_record 表按级别聚合统计日志数量分布。

**条件**：

| 条件 | 类型 | 说明 |
| ------ | ---- | ---- |
| start_time | INT | 起始时间（毫秒时间戳），可选 |
| end_time | INT | 结束时间（毫秒时间戳），可选 |

**返回**：`{ distribution: Array<{ level: string; count: number }> }`

## 4. 数据库表结构

> 日志记录持久化于 `log_record` 表。
> 日志规则（log_rule）和配置项（log_config）始终存储于关系数据库。

### 4.1 log_rule 表

日志规则表，存储日志记录的过滤规则（控制哪些模块的哪些方法的日志被记录）。

| 字段 | 类型 | 约束 | 说明 |
| ------ | ---- | ---- | ---- |
| id | TEXT | NOT NULL PRIMARY KEY | UUID |
| created | INTEGER | NOT NULL | 毫秒时间戳 |
| updated | INTEGER | NOT NULL | 毫秒时间戳 |
| source | TEXT | NOT NULL | 模块名，`*` 表示所有模块 |
| method | TEXT | NOT NULL | 方法名，`*` 表示该模块的所有方法 |
| enable | INTEGER | NOT NULL | 是否记录（0/1） |

索引：
- idx_log_rule_source (source)
- idx_log_rule_method (method)
- 唯一约束：(source, method)

### 4.2 log_config 表

配置表，存储于关系数据库。

| 字段 | 类型 | 约束 | 说明 |
| ------ | ---- | ---- | ---- |
| config_key | TEXT | NOT NULL PRIMARY KEY | 配置键 |
| config_value | TEXT | NOT NULL | 配置值 |
| value_type | TEXT | NOT NULL | 值类型 |
| description | TEXT | | 说明 |
| updated | INTEGER | NOT NULL | 毫秒时间戳 |

## 5. 配置项

| config_key | config_value | value_type | description |
| ------ | ----- | ----- | ----- |
| enabled | true | BOOLEAN | LogProvider 是否启用 |
| default_level | INFO | STRING | 默认日志级别 |
| min_level | DEBUG | STRING | 最低日志级别（低于此级别不记录，DEBUG 表示不过滤） |
| retention_days | 30 | INT | 日志保留天数（30 天，超过则自动清理） |
| max_log_count | 700000 | INT | 日志最大保留条数（70 万条，超过自动清理最旧记录） |

### 4.3 log_record 表

日志持久化表，存储日志记录。

| 字段 | 类型 | 约束 | 说明 |
| ------ | ---- | ---- | ---- |
| id | TEXT | NOT NULL PRIMARY KEY | UUID |
| created | INTEGER | NOT NULL | 毫秒时间戳 |
| updated | INTEGER | NOT NULL | 毫秒时间戳 |
| level | TEXT | NOT NULL | 日志级别 |
| source | TEXT | NOT NULL | 日志来源 |
| message | TEXT | NOT NULL | 日志消息 |
| trace_id | TEXT | | 请求追踪 ID |
| caller | TEXT | | 调用方标识 |
| metadata | TEXT | | JSON 元数据 |
| elapsed_ms | INTEGER | | 耗时（毫秒） |

索引：
- idx_log_record_created (created)
- idx_log_record_level (level)
- idx_log_record_source (source)

## 6. LogInterceptor（AOP 日志拦截器）

LogProvider 提供 LogInterceptor，实现 shared/aop 基础框架的 Interceptor 接口，
在 AOP 四切入点中的两个位置记录日志：

| 切入点 | 时机 | LogInterceptor 行为 |
| ------ | ---- | ---- |
| beforeExecute | 方法执行前 #1 | 记录方法调用开始（level=DEBUG，source=AOP，message="方法名 invoke"） |
| afterExecute | 方法执行后 #2 | 记录方法执行完成（level=INFO/ERROR，source=AOP，message="方法名 done/failed"，elapsed_ms=耗时） |

**设计要点**：

- LogInterceptor 使用原始 LogService（未经 AOP 包装），避免与 AOP 代理产生递归调用
- 日志写入采用 fire-and-forget 模式（不 await），不阻塞业务方法执行
- 通过 `LogAccess.getRawService()` 获取原始 Service

## 7. 组件初始化

1. 创建独立的日志 RelationDB 实例（如 `brian_log.db`），物理隔离业务 SQLite 数据库与日志 SQLite 数据库，避免日志读写影响业务性能
2. 创建 log_record 表、log_rule 表和 log_config 表（通过 RelationDBAccess.executeRaw）
3. 写入默认配置项（enabled=true 等）
4. 从 log_config 读取 enabled 状态恢复运行时状态

## 8. 方法调用示例

```typescript
// 构造专用于日志的 LogAccess 实例（传入独立的 RelationDBAccess 实例或 SQLite 配置对象）
const logAccess = new LogAccess({ dbPath: './data/brian_log.db' });
await logAccess.initialize();

// 手动记录日志
const output = new AddLogOutput();
await logAccess.addLog(
  { data: { level: 'INFO', source: 'UserService', message: '用户登录成功', trace_id: 'xxx' } },
  new LogContext(),
  output,
);

// 搜索日志
const soOutput = new SoLogOutput();
await logAccess.soLog(
  { level: 'ERROR', start_time: Date.now() - 86400000, page: { current: 1, size: 20 } },
  new LogContext(),
  soOutput,
);
```

## 9. AOP 集成示例

```typescript
const logAccess = new LogAccess(relationDb);
await logAccess.initialize();

// 创建日志拦截器（使用原始 Service，避免递归）
const logInterceptor = new LogInterceptor(logAccess.getRawService());

// 将拦截器注入到其他 Provider 的 AOP 代理中
// AopProxy 和 Interceptor 接口由 shared/aop 基础框架提供
const soulAccess = new SoulAccess(relationDb, {
  interceptors: [logInterceptor],
});
```

## 10. 变更记录

### [2026-08-22] AOP 层自动生成 trace_id 并回填 Context，日志统一保存 trace_id
- **变更原因**：traceId 需独立于 work_id / interact_id / info_id 等业务 ID，在任意方法缺失时自动生成，并保证日志统一保存 trace_id 供链路追踪。
- **功能变更**：
  - `Context` 基类新增 `trace_id` 字段；
  - `AopProxy.wrap` 在方法入口计算有效 trace_id（优先级：`Input.trace_id` → `Context.trace_id` → `IdGenerator.generate()`），回填到 `Context`（不回填 `Input`，避免污染查询类入参的 trace_id 过滤字段，如 `SoLogInput`）；
  - `AopProxy.createLoggerInterceptor` 将 `trace_id` / `work_id` / `interact_id` 写入日志 meta，`createLogger`（dev-server）提取并调用 `LogService.addLog` 持久化。
- **影响的端点**：
  - 所有经 AopProxy 包装的 Service 方法——日志 `log_record.trace_id` 恒有值，可经 `/api/logs?trace_id=` 检索。
- **可能存在的问题**：
  - 查询类方法（`soLog` / `queryLogs`）的 `trace_id` 入参为过滤条件，AOP 只回填 `Context` 不回填 `Input`，故不影响查询语义。

### [2026-08-25] 日志按级别分流：切面/调试日志不再入库，启动日志写文件
- **变更原因**：`log_record` 表被非业务的 AOP 切面日志（`invoke`/`done`）淹没（DEBUG 占 70 万条中的绝大多数），业务错误日志难以观察；启动日志无需持久化。
- **功能变更**：
  - `dev-server.ts` 新增文件日志器（`data/logs/dev-server-YYYY-MM-DD.log`，按天分文件，`BRIAN_LOG_DIR` 可覆盖）；
  - `createLogger` 分层路由：`debug` 丢弃、`info`/`warn` 写文件、`error` 写入 LogProvider(SQLite)；
  - dev-server 入口层 `console.log/error/warn`（启动、关闭、CDT 状态）统一改走文件日志器；
  - `Logger` 接口新增可选 `info?`/`warn?`；`CDTService` 的 `console.warn` 改走 `logger.warn`。
- **影响的端点**：
  - 监控页 `GET /api/monitor/logs/query` —— 返回结果不再含 DEBUG/INFO 切面日志，仅业务 ERROR；
  - 日志文件 `data/logs/*.log` —— 新增启动/定时/调试日志输出。
- **可能存在的问题**：
  - 业务 `logger.debug` 调用（如 `DagScheduler`、`StreamService`）随 AOP 切面日志一并丢弃，如需保留需显式提升为 `info`/`warn`。

### [2026-09-14] AOP 兜底强化：Metrics 缺 trace_id 立即生成回填 + 失败日志 ctx.traceId 第三优先级
**变更原因**：traceId 源头治理收尾（见 CHANGELOG 2026-09-14）：兜底网点收敛到 AOP 单点 —— Metrics 实例缺 trace_id 时须在方法体执行前立即生成回填；旧式 3 参签名无 Metrics，失败日志此前无兜底 trace。

**修改的方法**：
- `AopProxy` — 新式调用自动创建 Metrics 后统一收口校验：Metrics 实例缺 `trace_id` 立即生成回填（已有链路 trace 不覆盖）；`InterceptContext` 新增 `traceId`；
- `LogInterceptor` — 旧式失败日志 trace 提取：`metricsTraceId || inputTraceId || ctx.traceId`。

**影响的端点**：
- 全部 AOP 切面方法 — trace_id 兜底保证；旧式失败日志可按 trace 检索。

**可能存在的问题**：
- 兜底 trace 为现场生成，非源头传播（保证可关联性，不伪造归属）。
