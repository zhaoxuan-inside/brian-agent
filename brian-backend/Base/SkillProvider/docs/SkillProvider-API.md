# SkillProvider API 文档

> 解耦 Skill 和系统，通过 Repository 设计模式为上层提供统一的 Skill 操作接口。
> 基于 RelationDBProvider（SQLite）实现，集成 Node.js vm 沙箱执行环境。

## 依赖

```typescript
import { RelationDBAccess } from '@brian-agent/base/RelationDBProvider';
import { SkillAccess } from '@brian-agent/base/SkillProvider';

const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
await relationDb.initialize();

const skill = new SkillAccess(relationDb);
await skill.initialize();
```

## 方法签名

统一签名：`Promise<boolean> method(Input input, Context context, Output output)`

### addSkill - 新增 Skill

```typescript
const output = new AddSkillOutput();
await skill.addSkill(
  {
    data: {
      skill_brief: '天气查询',
      work: 'result = `查询 ${params.city} 的天气`',
      scripts: '/data/skills/weather/scripts',
      references: '/data/skills/weather/references',
      assets: '/data/skills/weather/assets',
    },
  },
  new SkillContext(),
  output,
);
console.log(output.id);
```

### getSkill - 获取 Skill

按 ID 或按条件获取第一条（id 与 conditions 至少传一个）。

```typescript
const output = new GetSkillOutput();
await skill.getSkill({ id: 'uuid-1' }, new SkillContext(), output);
console.log(output.skill);
```

### updateSkill - 更新 Skill

支持按 ID 或按条件更新。资源级启用/禁用通过修改 enable 字段实现。

```typescript
await skill.updateSkill(
  { id: 'uuid-1', data: { skill_brief: '新摘要', enable: false } },
  new SkillContext(),
  new UpdateSkillOutput(),
);
```

### delSkill - 删除 Skill

支持按 ID 批量删除或按条件删除（ids 与 conditions 至少传一个）。
删除 Skill 后同步清理 skill_usage 表中引用该 Skill 的记录。

```typescript
await skill.delSkill({ ids: ['uuid-1', 'uuid-2'] }, new SkillContext(), new DelSkillOutput());
```

### soSkill - 搜索 Skill

支持关键词（匹配 skill_brief）、条件过滤、排序、分页。

```typescript
const output = new SoSkillOutput();
await skill.soSkill(
  {
    keyword: '天气',
    page: { current: 1, size: 10 },
    order_by: [{ field: 'created', direction: 'DESC' }],
  },
  new SkillContext(),
  output,
);
console.log(output.list, output.total);
```

### execSkill - 执行 Skill

在 Node.js vm 沙箱中执行指定 Skill 的操作指南（work），执行成功后更新 skill_usage 当天使用次数。

沙箱内可用变量：
- `params`：调用方传入的执行参数；
- `result`：脚本需将结果写入此变量，由 output 回传；
- `console.log`：空实现，避免输出污染主进程。

```typescript
const output = new ExecSkillOutput();
await skill.execSkill(
  { id: 'uuid-1', params: { city: '北京' } },
  new SkillContext(),
  output,
);
console.log(output.result);
```

### enableSkill - 启用/禁用组件

运行时控制 Skill 组件可用状态，状态持久化到 skill_config。禁用期间所有 Skill 操作将返回失败。

```typescript
await skill.enableSkill({ enable: false }, new SkillContext(), new EnableSkillOutput());
```

## 表结构

### skill 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 毫秒时间戳 |
| updated | INTEGER | 毫秒时间戳 |
| skill_brief | TEXT | Skill 元数据（应用场景） |
| work | TEXT | Skill 操作指南 |
| scripts | TEXT | 脚本存放路径 |
| references | TEXT | 深度参考资料存放路径 |
| assets | TEXT | 静态资源存放路径 |
| enable | INTEGER | 是否启用 (0/1)，默认 1 |

### skill_usage 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 毫秒时间戳 |
| updated | INTEGER | 毫秒时间戳 |
| skill_id | TEXT | 关联 skill.id |
| usage_date | TEXT | YYYY-MM-DD |
| usage_count | INTEGER | 当日使用次数，默认 0 |

### skill_config 表

| config_key | config_value | value_type | description |
|------------|-------------|------------|-------------|
| enabled | true | BOOLEAN | Skill 组件是否启用（enableSkill 读写） |
