# Application 层测试用例索引

> 基于 `docs/_05_Application/` 下各子模块 PRD 生成，专业测试用例文档。

---

## 测试文档列表

| 模块 | PRD | 测试文档 | HTTP 端点 | 测试用例数 |
|------|-----|---------|----------|----------|
| Chat | [Chat-PRD.md](../Chat/Chat-PRD.md) | [Chat-Test.md](./Chat-Test.md) | 13 | 89 |
| Config | [Config-PRD.md](../Config/Config-PRD.md) | [Config-Test.md](./Config-Test.md) | ~40 | 124 |
| SelfLearning | [SelfLearning-PRD.md](../SelfLearning/SelfLearning-PRD.md) | [SelfLearning-Test.md](./SelfLearning-Test.md) | 12 + 4 内部方法 | 114 |
| UserProfile | [UserProfile-PRD.md](../UserProfile/UserProfile-PRD.md) | [UserProfile-Test.md](./UserProfile-Test.md) | 7 | 62 |
| Visualization | [Visualization-PRD.md](../Visualization/Visualization-PRD.md) | [Visualization-Test.md](./Visualization-Test.md) | 7 | 98 |

**合计**：覆盖约 79 个 HTTP 端点，487 个测试用例。

---

## 测试用例编号规范

- `TC-CHAT-xxx`：Chat Application 测试用例
- `TC-CFG-xxx`：Config Application 测试用例
- `TC-SL-xxx`：SelfLearning Application 测试用例
- `TC-UP-xxx`：UserProfile Application 测试用例
- `TC-VIS-xxx`：Visualization Application 测试用例

---

## 测试用例分类

各模块测试用例按以下维度分类：

| 维度 | 说明 |
|------|------|
| 正常场景（Happy Path） | 合法输入，预期正常返回 |
| 异常/错误场景 | 非法输入、下层异常、资源不存在 |
| 边界场景 | 空值、极限值、溢出、超时 |
| 权限/校验场景 | 权限约束、类型校验、枚举校验 |
| 跨模块约束 | 端点禁止、委托验证、入口唯一性 |

---

## 覆盖率目标

| 指标 | 目标 |
|------|------|
| HTTP 端点覆盖 | 100% |
| 场景覆盖 | ≥ 80% |
| 正常流程覆盖 | 100% |
| 错误处理覆盖 | ≥ 80% |
| 边界条件覆盖 | ≥ 70% |

---

## 测试环境约定

1. **框架**：vitest + supertest
2. **隔离**：每个 `it` 通过 `beforeEach`/`afterEach` 创建/清理临时目录和 DB
3. **Mock**：下层依赖（Orchestration/Agent/Core/Base）通过 vi.mock 或依赖注入 mock
4. **环境变量**：`BRIAN_LOG_LEVEL=error`、`BRIAN_USE_SQLITE_GRAPH=true`
5. **表结构**：测试中通过 `initDatabase()` 自动创建所需表
6. **命名**：遵循 `_01_TerminologyStandardization.md` 名词字典
