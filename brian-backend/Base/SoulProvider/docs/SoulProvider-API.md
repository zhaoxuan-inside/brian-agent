# SoulProvider API 文档

> 解耦 Soul 和系统，通过 Repository 设计模式为上层提供统一的 Soul 操作接口。
> 基于 RelationDBProvider（SQLite）实现。

## 依赖

```typescript
import { RelationDBAccess } from '@brian-agent/base/RelationDBProvider';
import { SoulAccess } from '@brian-agent/base/SoulProvider';

const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
await relationDb.initialize();

const soul = new SoulAccess(relationDb);
await soul.initialize();
```

## 方法签名

统一签名：`Promise<boolean> method(Input input, Context context, Output output)`

### addSoul - 新增 Soul

```typescript
const output = new AddSoulOutput();
await soul.addSoul(
  { data: { soul_content: '你是一个友善的助手', soul_brief: '通用助手', soul_usage: '对话' } },
  new SoulContext(),
  output,
);
console.log(output.id);
```

### delSoul - 删除 Soul

支持按 ID 批量删除或按条件删除（ids 与 conditions 至少传一个）。

```typescript
await soul.delSoul({ ids: ['uuid-1', 'uuid-2'] }, new SoulContext(), new DelSoulOutput());
```

### updateSoul - 更新 Soul

支持按 ID 或按条件更新。资源级启用/禁用通过修改 enable 字段实现。

```typescript
await soul.updateSoul(
  { id: 'uuid-1', data: { soul_content: '新内容', enable: false } },
  new SoulContext(),
  new UpdateSoulOutput(),
);
```

### getSoul - 获取 Soul

按 ID 或按条件获取第一条（id 与 conditions 至少传一个）。

### soSoul - 搜索 Soul

支持关键词（匹配 soul_content、soul_brief）、条件过滤、排序、分页。

```typescript
const output = new SoSoulOutput();
await soul.soSoul(
  { keyword: '助手', page: { current: 1, size: 10 }, order_by: [{ field: 'created', direction: 'DESC' }] },
  new SoulContext(),
  output,
);
console.log(output.list, output.total);
```

### enableSoul - 启用/禁用组件

运行时控制 Soul 组件可用状态，状态持久化到 soul_config。

## 表结构

### soul 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 毫秒时间戳 |
| updated | INTEGER | 毫秒时间戳 |
| soul_content | TEXT | Soul 内容 |
| soul_brief | TEXT | 功能摘要 |
| soul_usage | TEXT | 应用场景 |
| enable | INTEGER | 是否启用 (0/1) |

### soul_usage 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created/updated | INTEGER | 时间戳 |
| soul_id | TEXT | 关联 soul.id |
| usage_date | TEXT | YYYY-MM-DD |
| usage_count | INTEGER | 当日使用次数 |

### soul_config 表
| config_key | config_value | value_type |
|------------|-------------|------------|
| enabled | true | BOOLEAN |
