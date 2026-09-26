# ADR-005 Runtime v2 代码即编排,弃 workflow

> 状态:accepted　日期:2026-09-26(反向登记)

## 背景
v1(AgentExecution 阶段执行 + PlannerAgent DAG)复杂且不可观测;commit bcd2479 前后逐步迁移。

## 决策
编排退回代码:Runtime/Loop 的 AgentLoopService 两级循环(外=轮次预算,内=单轮工具消费),RunGatewayService 管生命周期(submitRun/waitRun/steerRun/abortRun/waitPermission);IterationBudget 防失控。v1 保留兼容;buildContext DROP 遗留表(agent_plan/planner_agent_config)。

## 备选方案
| 方案 | 未选原因 |
|---|---|
| workflow/DAG 引擎 | 声明式编排调试难、观测断层 |

## 后果
- 正面:全链路可观测(Metrics spans + Report 事件流);逻辑可单测。
- 负面:新编排形态需改代码(v1 引擎暂留双轨)。
