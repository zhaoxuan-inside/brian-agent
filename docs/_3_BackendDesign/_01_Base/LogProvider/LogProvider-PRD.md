# LogProvider PRD

## 1. 组件简介

### 1.1 目标

解耦日志和系统，为上层提供统一的日志操作接口。所有的日志调用都要通过 LogProvider 来完成日志的输出方式。

### 1.2 定位

LogProvider 是日志的唯一操作入口，上层不可直接调用 console.log 或其他日志库。
所有组件的日志输出（包括 AOP 切面自动记录的日志）均通过 LogProvider 完成。

LogProvider **支持双存储模式**：本地文件 + SQLite 持久化，可通过 `write_mode` 配置项切换：
- `FILE`：仅写入本地文件（默认行为，向后兼容）
- `BOTH`：双写模式（文件 + SQLite），支持日志查询和统计
- `SQLITE`：仅写入 SQLite，不写文件

### 1.3 集成依赖

- 依赖 RelationDBProvider：日志规则（log_rule）与配置项（log_config）存储于关系数据库
- 依赖 shared/aop（AOP 基础框架）：LogProvider 提供 LogInterceptor，实现 shared/aop 的 Interceptor 接口，作为 AOP 四切入点中日志切面的具体实现

### 1.4 日志文件存储设计

日志只写入本地文件，不存储于数据库。每个模块只有一个日志文件，最大 200MB，自动清理超过两周的日志。

```
{file_path}/                          # 默认 ./data/logs
├── SoulService/                      # 按模块名分目录
│   └── SoulService.log               # 唯一日志文件（≤ 200MB）
├── LLMService/
│   └── LLMService.log
└── RelationDBService/
    └── RelationDBService.log
```

**文件命名规则**：`{模块名}.log`（每个模块只有一个文件）

**文件大小控制**：
- 每个文件最大 200MB（由配置项 `max_file_size` 控制）
- 写入后若文件超过 200MB，触发清理：
  1. 先删除超过两周（14 天）的日志行
  2. 若清理后仍超过 200MB，从文件头部截断，仅保留最近的日志内容

**日志行格式**（单行，便于解析）：
```
[2026-07-25T10:30:00.123Z] [INFO] [SoulService] [trace:abc123] addSoul done | {"key":"value"} | 15ms
```
格式：`[时间戳] [级别] [模块名] [trace_id] 消息 | 元数据JSON | 耗时`

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

写入日志到本地文件。按模块名分目录存储，文件采用滚动方式（每个文件最大 200MB）。

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

### 3.7 查询日志（queryLogs）

**功能**：从 SQLite log_record 表查询日志记录，支持多维过滤和分页。

**条件**：

| 条件 | 类型 | 说明 |
| ------ | ---- | ---- |
| level | STRING | 日志级别（DEBUG/INFO/WARN/ERROR） |
| source | STRING | 日志来源模块（模糊匹配） |
| keyword | STRING | 关键词（匹配 message 字段） |
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

**注意**：queryLogs 和 getLogStats 仅在 `write_mode` 为 `BOTH` 或 `SQLITE` 时有效。若为 `FILE` 模式，SQLite 中无数据。

## 4. 数据库表结构

> 日志记录在 `FILE` 模式下不存储于数据库，在 `BOTH` / `SQLITE` 模式下双写到 `log_record` 表。
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
| file_path | ./data/logs | STRING | 日志文件根目录 |
| max_file_size | 209715200 | INT | 单文件最大大小（字节，200MB = 200 * 1024 * 1024） |
| retention_days | 14 | INT | 日志保留天数（两周，超过则自动清理） |
| write_mode | BOTH | STRING | 写入模式：FILE（仅文件）/ SQLITE（仅数据库）/ BOTH（双写，默认） |

### 4.3 log_record 表

日志持久化表，在 `write_mode` 为 `BOTH` 或 `SQLITE` 时存储日志记录。

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

1. 创建 log_record 表和 log_config 表（通过 RelationDBAccess.executeRaw）
2. 写入默认配置项（enabled=true 等）
3. 从 log_config 读取 enabled 状态恢复运行时状态

## 8. 方法调用示例

```typescript
const logAccess = new LogAccess(relationDb);
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
