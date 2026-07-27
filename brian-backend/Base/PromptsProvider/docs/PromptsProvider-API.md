# PromptsProvider API 文档

> 解耦 Prompt 模板管理与上层执行框架，通过 Repository 设计模式为上层提供统一的 Prompt 模板操作接口。
> 基于 RelationDBProvider（SQLite）实现。

## 依赖

```typescript
import { RelationDBAccess } from '@brian-agent/base/RelationDBProvider';
import { PromptsAccess } from '@brian-agent/base/PromptsProvider';

const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
await relationDb.initialize();

const prompts = new PromptsAccess(relationDb);
await prompts.initialize();
```

## 方法签名

统一签名：`Promise<boolean> method(Input input, Context context, Output output)`

### addPrompt - 新增 Prompt

```typescript
const output = new AddPromptOutput();
await prompts.addPrompt(
  {
    data: {
      prompt_template_title: '翻译助手',
      prompt_template_brief: '多语言翻译 Prompt',
      prompt_template: '请将以下文本翻译为{{target_language}}：\n\n{{source_text}}',
    },
  },
  new PromptContext(),
  output,
);
console.log(output.id);
```

### delPrompt - 删除 Prompt

支持按 ID 批量删除或按条件删除（ids 与 conditions 至少传一个）。

```typescript
await prompts.delPrompt({ ids: ['uuid-1', 'uuid-2'] }, new PromptContext(), new DelPromptOutput());
```

### updatePrompt - 更新 Prompt

支持按 ID 或按条件更新。资源级启用/禁用通过修改 enable 字段实现。

```typescript
await prompts.updatePrompt(
  { id: 'uuid-1', data: { prompt_template: '新内容', enable: false } },
  new PromptContext(),
  new UpdatePromptOutput(),
);
```

### getPrompt - 获取 Prompt

按 ID 或按条件获取第一条（id 与 conditions 至少传一个）。

```typescript
const output = new GetPromptOutput();
await prompts.getPrompt({ id: 'uuid-1' }, new PromptContext(), output);
console.log(output.prompt);
```

### soPrompt - 搜索 Prompt

支持关键词（匹配 prompt_template_title、prompt_template_brief）、条件过滤、排序、分页。

```typescript
const output = new SoPromptOutput();
await prompts.soPrompt(
  {
    keyword: '翻译',
    page: { current: 1, size: 10 },
    order_by: [{ field: 'created', direction: 'DESC' }],
  },
  new PromptContext(),
  output,
);
console.log(output.list, output.total);
```

### execPrompt - 执行/渲染 Prompt

接收 Prompt 模板 ID 及变量参数，完成 `{{variable}}` 变量替换后返回完整 Prompt 字符串。
调用成功后自动更新 `prompt_template_usage` 表当日使用次数 +1。

```typescript
const output = new ExecPromptOutput();
await prompts.execPrompt(
  {
    id: 'uuid-1',
    variables: { target_language: '英文', source_text: '你好，世界' },
  },
  new PromptContext(),
  output,
);
console.log(output.prompt);
// => 请将以下文本翻译为英文：
//
//    你好，世界
```

### enablePrompts - 启用/禁用组件

运行时控制 Prompts 组件可用状态，状态持久化到 prompts_config。

```typescript
await prompts.enablePrompts({ enable: false }, new PromptContext(), new EnablePromptsOutput());
```

## 表结构

### prompt_template 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 毫秒时间戳 |
| updated | INTEGER | 毫秒时间戳 |
| prompt_template_title | TEXT | Prompt 名称 |
| prompt_template_brief | TEXT | Prompt 摘要（可空） |
| prompt_template | TEXT | Prompt 内容（Markdown 格式模板） |
| enable | INTEGER | 是否启用 (0/1)，默认 1 |

### prompt_template_usage 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 毫秒时间戳 |
| updated | INTEGER | 毫秒时间戳 |
| prompt_template_id | TEXT | 关联 prompt_template.id |
| usage_date | TEXT | YYYY-MM-DD |
| usage_count | INTEGER | 当日使用次数 |

> 仅当 `execPrompt` 成功调用时，当天 usage_count 才会加 1。

### prompts_config 表

| config_key | config_value | value_type | description |
|------------|-------------|------------|-------------|
| enabled | true | BOOLEAN | Prompts 组件是否启用（enablePrompts 读写） |
