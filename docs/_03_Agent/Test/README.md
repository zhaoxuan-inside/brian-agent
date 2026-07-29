# Agent 层测试用例总览

> 测试范围：`brian-backend/Agent/` 全部 8 个模块  
> 测试用例总数：**216**  
> 接口覆盖：**45/45 (100%)**  
> 场景覆盖：**≥80%**  
> 编写依据：`docs/_03_Agent/` 下 PRD 文档 + `brian-backend/Agent/` 下实际代码实现

---

## 文档索引

| 文档 | 对应模块 | 接口数 | 测试用例数 | 覆盖重点 |
|------|---------|--------|----------|---------|
| [AgentShared-Test.md](./AgentShared-Test.md) | `shared/` 工具函数 | 2 个工具函数 | 16 | 签名构建、JSON 解析边界 |
| [AgentLibrary-Test.md](./AgentLibrary-Test.md) | `AgentLibrary/` | 9 | 47 | CRUD、匹配、老化、配置 |
| [AgentStrategy-Test.md](./AgentStrategy-Test.md) | `AgentStrategy/` | 6 | 28 | 策略匹配、内置策略、规则校验 |
| [AgentBuilder-Test.md](./AgentBuilder-Test.md) | `AgentBuilder/` | 6 | 32 | Agent 组装、系统 Agent 构建、优化 |
| [AgentExecution-Test.md](./AgentExecution-Test.md) | `AgentExecution/` | 9 | 35 | 执行引擎、原子操作、策略驱动 |
| [PlannerAgent-Test.md](./PlannerAgent-Test.md) | `PlannerAgent/` | 4 | 21 | DAG 规划、重规划、循环校验 |
| [WriterAgent-Test.md](./WriterAgent-Test.md) | `WriterAgent/` | 4 | 20 | 回复生成、用户偏好、格式输出 |
| [EvolutorAgent-Test.md](./EvolutorAgent-Test.md) | `EvolutorAgent/` | 7 | 33 | 评估体系、调度优化、进化报告 |

---

## 接口覆盖矩阵

| 接口 | AgentLibrary | AgentBuilder | AgentExecution | AgentStrategy | PlannerAgent | WriterAgent | EvolutorAgent |
|------|:-----------:|:-----------:|:-------------:|:-----------:|:-----------:|:-----------:|:-----------:|
| addAgent | ✓ | | | | | | |
| matchAgent | ✓ | | | | | | |
| updateAgent | ✓ | | | | | | |
| recordAgentUsage | ✓ | | | | | | |
| getAgent | ✓ | | | | | | |
| ageAgent | ✓ | | | | | | |
| getAgentRule | ✓ | | | | | | |
| updateAgentRule | ✓ | | | | | | |
| configAgentLibrary | ✓ | | | | | | |
| buildAgent | | ✓ | | | | | |
| optimizeAgent | | ✓ | | | | | |
| buildPlannerAgent | | ✓ | | | | | |
| buildWriterAgent | | ✓ | | | | | |
| buildEvolutorAgent | | ✓ | | | | | |
| configAgentBuilder | | ✓ | | | | | |
| execAgent | | | ✓ | | | | |
| execAgentAsync | | | ✓ | | | | |
| think | | | ✓ | | | | |
| act | | | ✓ | | | | |
| reflect | | | ✓ | | | | |
| answer | | | ✓ | | | | |
| getTrace | | | ✓ | | | | |
| getExecQueueStatus | | | ✓ | | | | |
| configAgentExecution | | | ✓ | | | | |
| matchStrategy | | | | ✓ | | | |
| getStrategy | | | | ✓ | | | |
| soStrategy | | | | ✓ | | | |
| addStrategy | | | | ✓ | | | |
| updateStrategy | | | | ✓ | | | |
| configAgentStrategy | | | | ✓ | | | |
| plan | | | | | ✓ | | |
| replan | | | | | ✓ | | |
| getPlan | | | | | ✓ | | |
| configPlannerAgent | | | | | ✓ | | |
| write | | | | | | ✓ | |
| saveUserProfile | | | | | | ✓ | |
| getUserProfile | | | | | | ✓ | |
| configWriterAgent | | | | | | ✓ | |
| evalWorkAgent | | | | | | | ✓ |
| evalWriterAgent | | | | | | | ✓ |
| startEvalSchedule | | | | | | | ✓ |
| stopEvalSchedule | | | | | | | ✓ |
| getEvaluation | | | | | | | ✓ |
| getEvolutionReport | | | | | | | ✓ |
| configEvolutorAgent | | | | | | | ✓ |

---

## 关键场景覆盖

### 端到端流程
- [x] 用户请求 → Planner 分解 → AgentBuilder 构建 → AgentExecution 执行 → WriterAgent 汇总 → Evolutor 评估优化
- [x] Agent 复用机制（matchAgent）
- [x] Agent 老化与优化闭环（ageAgent → Evolutor → optimizeAgent）

### 异常路径
- [x] LLM 调用失败的各种兜底策略
- [x] DAG 校验失败的回退处理
- [x] MQ 服务不可用时的容错
- [x] 无效参数校验（ValidationError / NotFoundError）
- [x] 边界数值处理（score 0/100、threshold 0/1、空列表等）

### 并发与异步
- [x] execAgentAsync 异步执行 + MQ 回调
- [x] Evolutor 调度器（多 Worker 协作）
- [x] 重复启动的幂等性

### 策略引擎
- [x] CoT 单步 → Answer
- [x] ReAct 多轮迭代 + max_iterations 限制
- [x] Plan-and-Solve 多阶段（phases + sub_steps）
- [x] execute_rule JSON DSL 解析 + steps/phases 分支

### 组件绑定
- [x] Agent ↔ LLM (1:1)
- [x] Agent ↔ Soul (1:1)
- [x] Agent ↔ Skill (1:N)
- [x] Agent ↔ MCP (1:N)
- [x] optimizeAgent 重匹配全组件

---

## 测试环境与依赖

```
vitest                 # 测试运行器
RelationDBAccess       # 真实 SQLite (temp 目录，每个测试独立 DB)
LLMAccess              # 测试中 Mock（模拟 LLM 返回）
PromptsAccess          # 配合 RelationDB 使用
MQAccess / MQCoreAccess # 测试中 Mock
其他 Core Access       # 测试中 Mock
```

每个测试用例使用 do-verify 模式：
1. 在 `beforeEach` 中初始化独立 SQLite 数据库和所有 Access 层实例
2. 执行被测试接口
3. 验证 output 结果 + 数据库状态 + 依赖调用
4. 在 `afterEach` 中清理 temp 目录

---

## 编写日期

2026-07-28
