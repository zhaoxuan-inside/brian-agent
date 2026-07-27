# LogProvider API 文档

> 解耦日志和系统，通过 Repository 设计模式为上层提供统一的日志操作接口。
> 所有的日志调用都要通过 LogProvider 来完成日志的输出方式。

## 依赖

```typescript
import { RelationDBAccess } from '@brian-agent/base/RelationDBProvider';
import { LogAccess, LogInterceptor } from '@brian-agent/base/LogProvider';

const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
await relationDb.initialize();

const logAccess = new LogAccess(relationDb);
await logAccess.initialize();
```

## 方法

### addLog - 新增日志
### getLog - 获取日志
### soLog - 搜索日志（支持 level/source/trace_id/keyword/时间范围过滤）
### delLog - 删除日志（支持 ids/conditions/before_time）
### countLog - 统计日志数量
### visualizedLog - 可视化（health/volume/levelDistribution/sourceDistribution）
### enableLog - 启用/禁用组件

## AOP 集成

LogProvider 通过 LogInterceptor 实现 AOP 日志切面：

```typescript
// 创建日志拦截器（使用原始 Service，避免递归）
const logInterceptor = new LogInterceptor(logAccess.getRawService());

// 将拦截器注入到其他 Provider
const soulAccess = new SoulAccess(relationDb, {
  interceptors: [logInterceptor],
});
```

## 四个切入点

| 切入点 | 时机 | LogInterceptor 实现 |
| ------ | ---- | ---- |
| beforeExecute | 方法执行前 #1 | 记录方法调用开始（DEBUG） |
| preExecute | 方法执行前 #2 | - |
| postExecute | 方法执行后 #1 | - |
| afterExecute | 方法执行后 #2 | 记录方法执行完成（INFO/ERROR + 耗时） |

## 表结构

### log_record 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created/updated | INTEGER | 毫秒时间戳 |
| level | TEXT | DEBUG/INFO/WARN/ERROR |
| source | TEXT | 日志来源 |
| message | TEXT | 日志消息 |
| trace_id | TEXT | 请求追踪 ID |
| caller | TEXT | 调用方标识 |
| metadata | TEXT | 附加元数据（JSON） |
| elapsed_ms | INTEGER | 耗时（毫秒） |

## 默认配置

| config_key | config_value | value_type |
|------------|-------------|------------|
| enabled | true | BOOLEAN |
| default_level | INFO | STRING |
| console_output | true | BOOLEAN |
| file_output | false | BOOLEAN |
| retention_days | 30 | INT |
