# Planner Agent 模块测试用例

> 模块代码：`brian-backend/Agent/PlannerAgent/`  
> 接口数量：4 个（plan、replan、getPlan、configPlannerAgent）  
> 测试用例总数：21  
> 覆盖目标：100% 接口覆盖，≥80% 场景覆盖

---

## 1. plan — 任务规划与 DAG 生成

### TC-PA-001: 简单任务 — 复杂度低于阈值返回单节点 DAG

| 项 | 内容 |
|---|------|
| **前置条件** | Planner Agent 已构建；complexity_decompose_threshold=50 |
| **测试步骤** | 调用 plan（work_id、interact_id、task_content='简单任务'、task_complexity=30） |
| **预期结果** | task_dag 包含 1 个 node（task_id、task_content、task_complexity=30、dependencies=[]），0 个 edge |
| **覆盖场景** | 单节点 DAG |

### TC-PA-002: 复杂任务 — 复杂度高于阈值 LLM 分解为多节点 DAG

| 项 | 内容 |
|---|------|
| **前置条件** | Planner Agent 已构建；complexity_decompose_threshold=50；plan_prompt_template_id 配置有效；LLM 返回规范的 DAG JSON |
| **测试步骤** | 调用 plan（task_content='构建完整的用户认证系统'、task_complexity=75） |
| **预期结果** | LLM 被调用；DAG 包含多个 node 和 edge；所有节点有合法 task_id；task_dag 通过 DAG 校验 |
| **覆盖场景** | LLM 多节点 DAG |

### TC-PA-003: task_complexity 未传入时自动估算

| 项 | 内容 |
|---|------|
| **前置条件** | Planner Agent 已构建；threshold=50 |
| **测试步骤** | 调用 plan（task_content='一个短任务'、不传 task_complexity） |
| **预期结果** | 根据 task_content 长度估算 complexity；较短任务生成单节点 DAG |
| **覆盖场景** | complexity 自动估算 |

### TC-PA-004: LLM DAG 校验失败时重试一次

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 第一次返回的 DAG node 数量超过 max_subtask_count（或存在循环依赖）；重试后返回合法 DAG |
| **测试步骤** | 调用 plan（复杂任务） |
| **预期结果** | LLM 被调用 2 次（重试 1 次）；最终返回合法 DAG |
| **覆盖场景** | DAG 校验失败重试 |

### TC-PA-005: LLM DAG 重试仍失败时回退到单节点 DAG

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 连续 2 次返回非法 DAG |
| **测试步骤** | 调用 plan |
| **预期结果** | 不抛异常；返回单节点 DAG（task_content 为原始任务内容） |
| **覆盖场景** | 重试耗尽回退 |

### TC-PA-006: DAG 循环依赖检测 —— 有循环时拒绝并重试

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 返回的 DAG 包含循环（edges 形成 A→B→C→A 环） |
| **测试步骤** | 调用 plan |
| **预期结果** | 校验识别到循环依赖，触发重试或回退 |
| **覆盖场景** | 循环依赖检测 |

### TC-PA-007: DAG 节点 ID 唯一性校验

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 返回的 DAG 中 nodes 有两个相同的 task_id |
| **测试步骤** | 调用 plan |
| **预期结果** | 校验失败，触发重试或回退 |
| **覆盖场景** | 节点 ID 重复校验 |

### TC-PA-008: DAG edge 引用不存在的节点

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 返回的 DAG 中 edge from_task_id 指向不存在的 node |
| **测试步骤** | 调用 plan |
| **预期结果** | 校验识别到无效引用，触发重试或回退 |
| **覆盖场景** | 边引用校验 |

### TC-PA-009: Plan 结果保存到 InfoCore

| 项 | 内容 |
|---|------|
| **前置条件** | plan 执行成功 |
| **测试步骤** | 调用 plan 后，通过 InfoCore 查询 |
| **预期结果** | InfoCore 中保存了 plan 信息（plan_id、work_id、task_dag） |
| **覆盖场景** | Plan 持久化 |

### TC-PA-010: LLM 调用失败时回退到单节点 DAG

| 项 | 内容 |
|---|------|
| **前置条件** | plan_prompt_template_id 已配置，但 LLM 调用失败/抛异常 |
| **测试步骤** | 调用 plan（task_complexity=70，超过阈值） |
| **预期结果** | 使用单节点 DAG 作为兜底；不抛异常 |
| **覆盖场景** | LLM 失败兜底 |

---

## 2. replan — 失败重规划

### TC-PA-011: 子任务失败后重规划（仅重规划下游和未完成节点）

| 项 | 内容 |
|---|------|
| **前置条件** | 存在一个已完成部分节点的 DAG Plan（plan_id='P1'：5 个节点，其中 node-2 标记为失败） |
| **测试步骤** | 调用 replan（plan_id='P1'、failed_task_id='node-2'） |
| **预期结果** | 新 plan（plan_id='P2'）包含未完成和下游节点（不包括已完成的 node-1）；plan.P2.parent_plan_id='P1'；失败的 node-2 被标记重试或替换 |
| **覆盖场景** | 部分重规划 |

### TC-PA-012: replan 生成的新 Plan 链接到父 Plan

| 项 | 内容 |
|---|------|
| **前置条件** | 类似 TC-PA-011 |
| **测试步骤** | 调用 replan |
| **预期结果** | 新 Plan 的 parent_plan_id 等于原 plan_id |
| **覆盖场景** | Plan 血缘链接 |

### TC-PA-013: replan 所有子任务均已完成时返回空 Plan

| 项 | 内容 |
|---|------|
| **前置条件** | Plan 中所有节点均已完成 |
| **测试步骤** | 调用 replan |
| **预期结果** | output.task_dag 可能为空或 output 包含 "all tasks completed" 标记 |
| **覆盖场景** | 无需重规划 |

### TC-PA-014: replan 只有一个失败节点（无下游）

| 项 | 内容 |
|---|------|
| **前置条件** | DAG：node-1(完成) → node-2(失败)，node-2 无下游 |
| **测试步骤** | 调用 replan（failed_task_id='node-2'） |
| **预期结果** | 新 Plan 仅包含 node-2 的重试版本 |
| **覆盖场景** | 单个叶节点失败 |

---

## 3. getPlan — 查询规划

### TC-PA-015: 按 plan_id 查询

| 项 | 内容 |
|---|------|
| **前置条件** | 存在一个 Plan（plan_id='plan-1'） |
| **测试步骤** | 调用 getPlan（plan_id='plan-1'） |
| **预期结果** | output.plans 长度=1，task_dag 正确 |
| **覆盖场景** | 精确查询 |

### TC-PA-016: 按 work_id 查询所有关联 Plan

| 项 | 内容 |
|---|------|
| **前置条件** | 存在 2 个 Plan 属于同一个 work_id（初次 Plan + replan） |
| **测试步骤** | 调用 getPlan（work_id='work-1'） |
| **预期结果** | output.plans 长度=2（parent_plan 和 child_plan） |
| **覆盖场景** | work_id 查询 |

### TC-PA-017: 查询不存在的 plan_id 返回空

| 项 | 内容 |
|---|------|
| **前置条件** | 无此 plan_id |
| **测试步骤** | 调用 getPlan（plan_id='不存在的ID'） |
| **预期结果** | output.plans 为空数组 |
| **覆盖场景** | 空结果 |

### TC-PA-018: 带分页查询

| 项 | 内容 |
|---|------|
| **前置条件** | 存在 10 个 Plan |
| **测试步骤** | 调用 getPlan（page={current:1,size:5}、order_by=[{field:'created',direction:'DESC'}） |
| **预期结果** | output.plans 长度=5，最新的 5 个 Plan |
| **覆盖场景** | 分页查询 |

---

## 4. configPlannerAgent — 配置 Planner

### TC-PA-019: 首次配置写入默认值

| 项 | 内容 |
|---|------|
| **前置条件** | planner_agent_config 表为空 |
| **测试步骤** | 调用 configPlannerAgent（不传参数） |
| **预期结果** | 配置初始化：complexity_decompose_threshold=50、plan_prompt_template_id=''、max_subtask_count=10 |
| **覆盖场景** | 默认配置初始化 |

### TC-PA-020: 更新 complexity_decompose_threshold

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化（threshold=50） |
| **测试步骤** | 调用 configPlannerAgent（complexity_decompose_threshold=30） |
| **预期结果** | output.config.complexity_decompose_threshold=30；plan 接口将使用新阈值 |
| **覆盖场景** | 阈值更新 |

### TC-PA-021: 更新所有配置字段

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化 |
| **测试步骤** | 调用 configPlannerAgent（complexity_decompose_threshold=40、plan_prompt_template_id='prompt-1'、max_subtask_count=20） |
| **预期结果** | 所有字段正确更新 |
| **覆盖场景** | 全量配置更新 |

---

## 附录：Plan DAG 格式示例

```json
{
  "nodes": [
    {
      "task_id": "node-1",
      "task_content": "设计数据库表结构",
      "task_complexity": 30,
      "task_domain": "database",
      "priority": 1,
      "dependencies": []
    },
    {
      "task_id": "node-2",
      "task_content": "实现 API 接口",
      "task_complexity": 50,
      "task_domain": "backend",
      "priority": 2,
      "dependencies": ["node-1"]
    },
    {
      "task_id": "node-3",
      "task_content": "编写前端页面",
      "task_complexity": 40,
      "task_domain": "frontend",
      "priority": 2,
      "dependencies": ["node-1"]
    }
  ],
  "edges": [
    { "from_task_id": "node-1", "to_task_id": "node-2" },
    { "from_task_id": "node-1", "to_task_id": "node-3" }
  ]
}
```
