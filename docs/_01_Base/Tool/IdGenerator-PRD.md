# IdGenerator（Base Tool）

## 1. 设计目标

1. 为 Base / Core / Agent / Application 全层提供统一的 ID 与时间工具；
2. 禁止各层自行实现 `uuid`、秒级时间戳等分叉逻辑；
3. 表主键 `id`、业务时间字段 `created` / `updated` 一律通过本工具生成。

## 2. 模块位置

```
brian-backend/Base/shared/id/IdGenerator.ts
```

通过 `@brian-agent/base` 导出：

```typescript
import { IdGenerator } from '@brian-agent/base';
```

## 3. 接口

| 方法 | 返回 | 说明 |
|------|------|------|
| `IdGenerator.generate()` | `string` | UUID v4，用作表主键 `id` 及业务唯一 ID |
| `IdGenerator.now()` | `number` | **毫秒**级 Unix 时间戳，用作 `created` / `updated` |
| `IdGenerator.today()` | `string` | `YYYY-MM-DD`，用于按天统计表 |

## 4. 使用规范

1. **禁止**使用 `IdGenerator.uuid()`（不存在）；统一 `generate()`；
2. **禁止** `Math.floor(Date.now() / 1000)` 写入库；统一 `IdGenerator.now()`（毫秒）；
3. 老化、配额等时间窗口计算必须以毫秒为基准：`now - days * 24 * 60 * 60 * 1000`；
4. Schema 初始化种子数据同样使用本工具。

## 5. 重要内容

所有方法为静态方法，无需实例化；不经过 AopProxy（纯工具函数）。
