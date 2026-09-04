# Agent执行框架

> **影响说明（2026-09-04 决策，Runtime v2）**：详见 `docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md` §10 退役清单。要点：
> - **AgentExecution（1559 行）退役**：ExecutionRule steps/phases 状态机 + Think/Act/Reflect 模拟工具调用被 Runtime `Loop/`（两级循环 + 原生 tool_calls + LLMEvent 流）替代；
> - **PlannerAgent**：planHierarchical 的 TaskDAG 输出退役 → Runtime `update_plan` 工具（过程性计划卡）；评估 prompt/`replan` 分析能力并入 curator；
> - **IntentAgent 暂停语义退役** → Runtime `ask_user` 工具（Deferred 挂起，答复=下一条消息）；
> - **WriterAgent Block JSON 输出退役** → 主循环 assistant 流 + 块 chunker（`Bus/Bus-PRD.md` §6）；
> - **EvolutorAgent MQ worker 拓扑退役** → background lane 上的 curator 声明代理（评估 prompt 复用）；
> - **AgentBuilder/AgentLibrary 组件匹配保留**：收敛为 Runtime `Agents/matchAgentDef`（去随机重建）；
> - Agent 构成（策略/LLM/Skill/MCP/Soul）与三层匹配思想保留；策略不再可配置为循环 JSON（循环固定，差异=声明数据）。
> 下文为历史设计文档，供对照与迁移期参考。

## 1. 设计目标

1. **与上层编排框架分层解耦**：上层编排框架负责接收用户请求，根据编排策略将请求拆解为子任务或直接将任务（简单任务）提交给Agent进行任务完成； 对于复杂任务会调用PlannerAgent将任务进行拆解，根据任务之间的依赖关系建立任务之间依赖关系（DAG），然后上层编排框架将任务DAG图中的每一个节点任务提交给Agent执行框架。**任务具体交由哪个LLM执行、配备哪些Skill和MCP、承载怎样的Soul、采用何种策略——这些决策全部由Agent层自主完成**构建一个可以执行的Agent，这样就会在上层任务编排层从任务DAG图变成Agent DAG图，由上层编排层根据DAG图的依赖关系按照依赖关系调用DAG图中每一个节点对应的Agent，然后将Agent结果传递给下游的Agent，也就是上层编排框架负责处理任务和Agent之间的依赖关系，Agent层的Agent负责具体的任务执行。
2. **Agent层自主决策**：Agent执行框架接收到任务后，**自主分析任务特征并自主决策**该任务应绑定哪个LLM、配备哪些Skill、挂载哪些MCP工具、采用哪种Soul（人格）、选择哪种执行策略，最终将每个任务节点转换为一个可执行的Agent实例。该决策过程不依赖上层编排框架的任何预先指定，确保Agent层具备完整的自主性。
3. **策略与执行解耦**：将Agent的"思考推理策略"（CoT、ReAct、Plan-and-Solve等）与"具体执行动作"分离，使执行框架能够根据配置灵活切换策略，而无需修改底层代码逻辑。
4. **原子能力复用**：将Agent执行过程抽象为若干独立、可组合的原子接口（Think、Act、Reflect、Answer），各接口可独立开发、测试和部署，提升框架的可维护性和扩展性。
5. **执行闭环自驱**：原子接口的执行结果统一返回给执行框架内部的调度器，由执行框架根据策略逻辑（顺序/循环/条件分支）**自行决定任务的推进**。
6. **全链路可观测**：完整记录执行框架内每一次Think、Act、Reflect、Answer的输入输出、耗时及Token用量，支持执行过程追溯、性能分析和调试排错。
7. **动态产生以及优化Agent**： 框架根据每个任务的特征自主产生适合的Agent（策略、LLM、Skill、MCP、Soul），完成指定的任务节点；每次产生Agent都需要消耗成本因此需要根据任务来保存Agent并复用，也需要根据评估结果以及Agent的使用频率来优化和老化Agent。

**Agent的构成**：
1. 策略：思考的策略；
2. LLM（Large Language Model）：负责执行推理和生成输出。
3. Skill（技能）：同Agent SKill对于Skill的定位；
4. MCP（多模态处理）：标准的MCP的定位；
5. Soul（智能体）：要执行的任务应该有的人类品格。

**必须有的Agent**：
1. Writer Agent，用来进行信息汇总，人性化展示信息的Agent；所有Agent执行完成后对结果的重新组织（依赖用户画像）；
2. Evolutor Agent，用来对给用户的返回进行评估打分的Agent；用户Agent的优化；
3. Planner Agent，负责对复杂任务的拆分和依赖关系的建立；

重要：还会有其他类型的Agent，这些Agent就是根据策略的不同以及具体的任务的不同，来创建不同的Agent，通称为Work Agent负责执行具体的任务；

## 2. Agent 匹配与构建三层优化架构

为了降低大模型调用成本、提升响应速度并确保 Agent 实例的高效复用，Agent 构建与匹配遵循以下三层递进逻辑：

1. **第一层匹配（基于输入特征相似度算法）**：
   - 系统将当前提问/任务指令与 AgentLibrary 中已有 Agent 处理过的任务特征（`task_signature`）进行归一化、去标点与字符 Bigram Jaccard 相似度匹配；
   - 若最高相似度得分 ≥ `similarity_threshold`（默认 `0.7`），直接复用评分最高且处于启用状态的已有 Agent，避免重复构建。
2. **第二层匹配（基于 LLM 大模型智能打分）**：
   - 若第一层特征相似度未达到阈值，提取所有候选 Agent 的名称 (`agent_name`)、用途/描述 (`agent_purpose`) 及配置；
   - 组装打分 Prompt 提交给 LLM，由大模型评估用户提问与候选 Agent 用途的契合度并给出 0.0~1.0 范围的评估打分；
   - 若最高打分 ≥ 阈值，选取 LLM 打分最高的 Agent 进行复用。
3. **第三层构建（用途生成与 Agent 创建）**：
   - 若两层匹配均未命中（或显式指定 `force_new`），触发 Agent 新建流程；
   - 构建流程中自动通过任务分析与 Prompt 提炼生成该 Agent 的明确用途说明 (`agent_purpose`) 并持久化存入 `agent` 数据库表，供后置匹配与界面直观展示。
