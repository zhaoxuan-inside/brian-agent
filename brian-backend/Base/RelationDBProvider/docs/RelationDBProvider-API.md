# RelationDBProvider API 文档

> 解耦关系型数据库和系统，为上层提供统一的关系数据操作接口。集成 SQLite。
> 所有对数据的操作都必须通过 RelationDBProvider。

## 初始化

```typescript
import { RelationDBAccess } from '@brian-agent/base/RelationDBProvider';

const access = new RelationDBAccess({ dbPath: './data/brian.db' });
await access.initialize(); // 创建配置表、恢复 enabled 状态
```

## 方法签名

统一签名：`Promise<boolean> method(Input input, Context context, Output output)`
- 返回值 `true` 表示执行完成
- 实际数据通过 `output` 参数（引用传递）回传

### CURD 操作

#### insertDB - 新增记录

```typescript
const output = new InsertDBOutput();
await access.insertDB(
  { table: 'soul', data: [
    { field: 'id', value: 'uuid-xxx' },
    { field: 'soul_content', value: '...' },
  ]},
  new DBContext(),
  output,
);
console.log(output.affected_rows); // 影响行数
```

#### deleteDB - 删除记录

```typescript
const output = new DeleteDBOutput();
await access.deleteDB(
  { table: 'soul', conditions: [{ field: 'id', operator: 'EQ', value: 'uuid-xxx' }] },
  new DBContext(),
  output,
);
```

#### updateDB - 更新记录

```typescript
const output = new UpdateDBOutput();
await access.updateDB(
  { table: 'soul', data: [{ field: 'soul_content', value: 'new' }],
    conditions: [{ field: 'id', operator: 'EQ', value: 'uuid-xxx' }] },
  new DBContext(),
  output,
);
```

#### selectDB - 查询记录列表

```typescript
const output = new SelectDBOutput();
await access.selectDB(
  { query_param: {
      table: 'soul',
      conditions: [{ field: 'enable', operator: 'EQ', value: true }],
      order_by: [{ field: 'created', direction: 'DESC' }],
      page: { current: 1, size: 10 },
  }},
  new DBContext(),
  output,
);
console.log(output.rows, output.total);
```

#### selectOneDB - 查询单条记录

```typescript
const output = new SelectOneDBOutput();
await access.selectOneDB(
  { query_param: { table: 'soul', conditions: [{ field: 'id', operator: 'EQ', value: 'xxx' }] }},
  new DBContext(),
  output,
);
console.log(output.row); // null 或记录对象
```

#### countDB - 统计记录数

```typescript
const output = new CountDBOutput();
await access.countDB({ table: 'soul' }, new DBContext(), output);
console.log(output.count);
```

#### transactionDB - 执行事务

```typescript
const output = new TransactionDBOutput();
await access.transactionDB(
  { operations: [
    { type: 'INSERT', table: 'soul', data: [{ field: 'id', value: 'a' }] },
    { type: 'UPDATE', table: 'soul', data: [{ field: 'enable', value: false }],
      conditions: [{ field: 'id', operator: 'EQ', value: 'b' }] },
  ]},
  new DBContext(),
  output,
);
```

### 可视化与运维

#### visualizedDB - 可视化数据

scope 取值：`health`（连接状态、响应时间）/ `volume`（各表记录数）/ `diskUsage`（磁盘占用）

#### enableDB - 启用/禁用

运行时控制数据库可用状态，状态持久化到 relationdb_config。可恢复。

#### closeDB - 关闭连接

终态操作，执行后需重新初始化组件。

## 公共查询对象

Condition / OrderBy / Page / DataObject / QueryParam / Operation 定义于 shared/query，被所有 Provider 引用。

### Condition 操作符

| 操作符 | 含义 | value 示例 |
| ------ | ----- | ----- |
| EQ | 等于 | 100 |
| NE | 不等于 | 100 |
| GT / LT / GE / LE | 大于/小于/大于等于/小于等于 | 100 |
| LIKE | 模糊匹配 | "%keyword%" |
| IN / NOT_IN | 包含/不包含于列表 | [1, 2, 3] |
| IS_NULL / IS_NOT_NULL | 为空/不为空 | - |
| BETWEEN | 在区间内 | [10, 20] |

## 配置表

表名：`relationdb_config`（库名 `relationdb`）

| config_key | config_value | value_type | description |
| ------ | ----- | ----- | ----- |
| enabled | true | BOOLEAN | 关系数据库是否启用 |

## RPC 改造说明

access 层方法签名 `(input, context, output)` 均为可序列化对象，可直接包装为 RPC handler：

```typescript
// 示例：HTTP RPC 包装
app.post('/rpc/relationdb/insertDB', async (req, res) => {
  const output = new InsertDBOutput();
  await access.insertDB(req.body.input, new DBContext(), output);
  res.json(output);
});
```
