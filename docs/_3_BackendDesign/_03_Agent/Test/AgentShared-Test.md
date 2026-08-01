# Agent 共享模块测试用例

> 模块代码：`brian-backend/Agent/shared/`  
> 测试范围：`buildTaskSignature`、`parseJsonObject` 工具函数  
> 覆盖目标：100% 分支覆盖

---

## 1. buildTaskSignature — 构建任务签名

### TC-SH-001: 正常格式 [domain] + 正文

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `buildTaskSignature('hello world', 'coding')` |
| **预期结果** | 返回 `'[coding] hello world'` |
| **覆盖场景** | 基础功能 |

### TC-SH-002: domain 为空字符串时默认 'general'

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `buildTaskSignature('x')` |
| **预期结果** | 返回 `'[general] x'` |
| **覆盖场景** | 默认值逻辑 |

### TC-SH-003: domain 为 whitespace 时默认 'general'

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `buildTaskSignature('test', '   ')` |
| **预期结果** | 返回 `'[general] test'` |
| **覆盖场景** | domain trim 边界 |

### TC-SH-004: task_content 截断为 256 字符

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 构造 300 字符 body，调用 `buildTaskSignature(body_300, 'd')` |
| **预期结果** | 返回字符串长度 = `'[d] '.length + 256` |
| **覆盖场景** | 超长任务截断 |

### TC-SH-005: task_content 恰好 256 字符

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 构造恰好 256 字符 body，调用 `buildTaskSignature(body_256, 'd')` |
| **预期结果** | 返回字符串长度 = `'[d] '.length + 256`，内容完整保留 |
| **覆盖场景** | 边界值不截断 |

### TC-SH-006: task_content 为 null/undefined

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `buildTaskSignature(null as any, 'd')` |
| **预期结果** | 返回 `'[d] '`（body 为空字符串），不抛异常 |
| **覆盖场景** | null safety |

### TC-SH-007: domain 中包含特殊字符

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `buildTaskSignature('test', 'ai-ml')` |
| **预期结果** | 返回 `'[ai-ml] test'` |
| **覆盖场景** | domain 特殊字符 |

---

## 2. parseJsonObject — 解析 JSON 对象

### TC-SH-008: 纯 JSON 对象解析

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `parseJsonObject('{"a":1}')` |
| **预期结果** | 返回 `{ a: 1 }` |
| **覆盖场景** | 纯 JSON 直接解析 |

### TC-SH-009: 从混合文本中提取嵌入式 JSON

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `parseJsonObject('prefix {"b":2} suffix')` |
| **预期结果** | 返回 `{ b: 2 }` |
| **覆盖场景** | 正则提取 JSON |

### TC-SH-010: 嵌套 JSON 对象

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `parseJsonObject('{"a":{"b":1},"c":[1,2]}')` |
| **预期结果** | 返回 `{ a: { b: 1 }, c: [1, 2] }` |
| **覆盖场景** | 嵌套结构解析 |

### TC-SH-011: 文本中多个 JSON，提取第一个嵌入的

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `parseJsonObject('start {"a":1} middle {"b":2} end')` |
| **预期结果** | 返回 `{ a: 1 }`（第一个 `{...}` 块） |
| **覆盖场景** | 多个 JSON 块时取第一个 |

### TC-SH-012: 空字符串输入

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `parseJsonObject('')` |
| **预期结果** | 返回 `null` |
| **覆盖场景** | falsy 输入保护 |

### TC-SH-013: 非 JSON 纯文本

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `parseJsonObject('this is just text')` |
| **预期结果** | 返回 `null`（无 `{...}` 匹配也不可解析） |
| **覆盖场景** | 无效输入 |

### TC-SH-014: 格式错误的 JSON

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `parseJsonObject('{"a":1,}')` |
| **预期结果** | 返回 `null` |
| **覆盖场景** | 非法 JSON |

### TC-SH-015: JSON 数组（非对象）

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `parseJsonObject('[1,2,3]')` |
| **预期结果** | 返回 `null`（因为 `typeof array !== 'object'` 的判断实际会将 array 视为 object，需确认实现行为） |
| **覆盖场景** | 非对象 JSON 类型 |

### TC-SH-016: 跨行嵌入式 JSON

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 `parseJsonObject('prefix\n{"key":\n"value"}\nsuffix')` |
| **预期结果** | 返回 `{ key: 'value' }` |
| **覆盖场景** | 多行 JSON 提取 |
