# DDD 领域驱动设计规范

> 本规范约束 brian-backend 全部业务模块的内部结构。与 `DevStandards.md`（方法签名/命名）配套使用。
> 核心原则：**去重优先** —— 写新逻辑前先查 `Base/shared`、`Core/shared`、`Agent/shared` 已有能力与 `docs/MethodIndex/` 索引，禁止复制粘贴已有实现。

## 1. 模块分层职责

```
<Module>/
├── access/            # 接入层（不变）：AopProxy 外壳、表初始化、RPC 预留。禁止业务逻辑。
├── application/       # 应用层（瘦）：流程编排 only
│   └── processors/    # （可选）被 Service 编排的无 I/O 数据处理步骤
├── domain/            # 领域层（新增行为）
│   ├── types.ts       # Input/Output/Context、Record 接口、表名/默认值常量（原有约定不变）
│   ├── entities/      # （按需）带不变量校验的实体/值对象
│   └── services/      # 领域服务：纯业务规则与数据加工
└── infrastructure/    # 基础设施（不变）：SchemaInitializer、外部 I/O 实现
```

| 层 | 职责 | 禁止 |
|----|------|------|
| access | AopProxy 包装、转发、生命周期（initialize） | 业务逻辑、数据加工 |
| application | 输入校验 → 编排领域服务与外部 access → 装配 Output → 异常转译 | 行内数据加工（Map 聚合/字段映射/排序计算）、行内 SQL 组装 |
| domain/services | 纯函数/纯类：业务规则判定、数据聚合、映射、排序、计算；输入输出均为普通对象/Record | 任何 I/O（DB/HTTP/access 调用）、任何框架依赖 |
| infrastructure | 建表、外部资源适配 | 业务规则 |

## 2. 流程控制与数据处理拆分判据

一个方法体内出现以下两类内容并存时必须拆分：

- **流程控制（留 application）**：调用其他 access/服务、条件分发（策略选择）、事务/消息边界、异常转译、Metrics/Report 上报。
- **数据处理（下沉 domain 或共享工具）**：`{field,value}` 组装、Map/Reduce 聚合、字段映射、排序与分页计算、字符串/JSON 加工、阈值计算。

拆分形态：领域服务方法保持**纯函数**（相同输入恒定输出），便于单测与复用；Service 负责取数（I/O）→ 交给领域服务加工 → 写回（I/O）。

**方法长度约束（10–30 行）**：单个方法（含签名与闭括号）目标区间为 10–30 行。
> 模块级覆盖：`Runtime`（编排内核）按其 `Runtime-PRD.md` §7 执行 **≤40 行**（2026-09-05 注记；实测全部 ≤30）。其它模块仍以 10–30 为准。
- **拆分**：超过 30 行的方法须拆出私有方法或领域服务函数；
- **合并**：被唯一调用点使用、方法体 ≤10 行、且合并后调用方仍 ≤30 行的"一次性碎片"应回并调用方，避免为拆而拆；
- **连贯性优先**：拆分与合并的前提是逻辑连贯——同一步骤的取数+校验不强行拆开，无关联的副作用不合并进同一段；一个私有方法应表达一个完整语义步骤。
- 纯声明式内容（如 SchemaInitializer 的 DDL 清单）允许通过**数据驱动表**收敛长度。
- 分析工具：`npm run analyze:methods`（生成拆分队列 >30 行与合并候选清单）。

## 3. 复用与去重优先级（强约束）

引入新逻辑前按顺序查找：

1. `Base/shared/`（base/aop/query/errors/config + newRecord/newPatch/callLLMJson 等公共件）
2. 层级 shared：`Core/shared`（ConfigHelper/MatchCacheHelper/SimilarityHelper/AgingEngine/SingleRowConfigStore）、`Agent/shared`（AgentKit、signature）、`Orchestration/shared`
3. `docs/MethodIndex/` 索引中既有方法
4. 确无可用实现才新写；若发现别处已有相同逻辑，**必须合并为共享实现**并替换全部调用点。

发现重复时的合并顺序：抽公共函数 → 放到依赖层级最低的合适 shared 目录 → 全调用点替换 → 删除原副本 → 由测试兜底。

## 4. 设计模式选择表

| 场景 | 模式 | 参考实现 |
|------|------|----------|
| 多提供商/多协议差异 | Strategy + Factory | `Base/LLMProvider/application/strategies/` |
| 提供商请求构建共性 | Template Method（基类钩子） | `Base/LLMProvider/application/strategies/BaseLLMStrategy.ts` |
| 关系库访问 | Repository + SqlBuilder | `Base/RelationDBProvider/` |
| 单行配置读改 | 单行配置仓 | `Core/shared/SingleRowConfigStore` |
| 跨切面（日志/耗时） | Proxy/AOP | `Base/shared/aop/AopProxy.ts` |
| 任务 DAG 调度 | DAG 调度器 | `Orchestration/OrchestrationExecution/application/DagScheduler.ts` |
| Prompt 渲染兜底 | Facade（封装 execPrompt+builtin 兜底） | `renderPromptWithFallback` |
| LLM+JSON 解析降级 | Facade + 可选重试策略 | `callLLMJson` |
| 事件/流上报 | Observer（SSE writer 回调） | `Base/StreamProvider` |

新模块按表选择，不允许自创第四种同类抽象。

## 5. JSDoc 模板（强制）

每个公开方法（access/application/domain）必须有完整说明：

```typescript
/**
 * 一句话说明方法做什么（动词+名词开头）。
 *
 * 补充语义约束（幂等性、默认值、级联行为等），并引用 PRD 条款。
 *
 * @param input  说明关键字段与约束
 * @param output 说明回传的字段
 * @param context 说明用到的背景参数
 * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
 * @param report 上报对象（SSE 通道），无流会话时静默降级
 * @returns 是否执行完成；业务失败通过 output.error/error_code 表达
 * @throws ValidationError 当 xxx（参数校验类错误）
 * @see docs/_3_BackendDesign/_01_Base/SoulProvider/SoulProvider-PRD.md 3.1.2
 */
```

## 6. 质量门（每模块重构完成的定义）

1. `tsc --noEmit` 0 错误；该层 vitest 全绿。
2. 模块内 `as any` / `: any` 为 0；无 `console.log`；无注释保留的旧实现。
3. 公开方法 JSDoc 覆盖率 100%。
4. 方法索引重生成（`npm run docs:index`）且包含本模块全部 access 方法。
5. 对应 PRD 已同步（签名/方法名/新增方法章节/代码变更记录）。

## 7. 模块重构样例（试点沉淀）

### LLMProvider（2026-08-29，中大型模块样例）

**before**：`listLLM` 146 行混合缓存 TTL 判定、策略分发、HTTP、逐条 upsert 字段映射。

**after**：领域服务 `LLMCacheDomainService`（isModelsCacheFresh / extractRemoteErrorDetail / toCacheInsertRecord / toCacheUpdatePatch）；strategies/ 维持 Strategy+Factory+Template Method；PRD 补录 soLLMById。

### SoulProvider（2026-08-29，参考实现）

**before**：`SoulService` 516 行，`soSoul` 单方法内混合关键词预查询（I/O）、usage 四维 Map 聚合、多字段排序、内存分页；`delSoul/updateSoul/soSoulById` 三处重复的"id/ids/conditions 目标条件解析"。

**after**：
- `domain/services/SoulDomainService.ts`（纯函数，零 I/O）：`resolveTargetConditions` / `buildKeywordConditions` / `aggregateUsageStats` / `getUsageValue` / `hasUsageSorting` / `sortByOrder` / `paginate`。全部可独立单测。
- `SoulService` 只剩流程：ensureEnabled → 取数（I/O）→ 调领域服务 → 写回 Output。
- 复用共享件：`newRecord/newPatch` 消除 insert/update 手写样板。
- 验证：SoulProvider 58 用例全绿；PRD 已同步（签名五参 + 代码变更记录）。
