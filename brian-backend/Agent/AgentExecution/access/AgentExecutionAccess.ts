/**
 * @fileoverview AgentExecution 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化 agent_execution_config / agent_execution_trace 表结构（SchemaInitializer）；
 * 2. 封装 application 层 AgentExecutionService，提供统一签名方法入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面。
 */

import { Metrics, Report } from '@brian-agent/base';
import type {
  RelationDBAccess, LLMAccess, PromptsAccess, SkillAccess, SoulAccess, MCPAccess, MQAccess, StreamAccess, Logger,
} from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, MCPCoreAccess, MQCoreAccess, SkillCoreAccess, LLMCoreAccess, CDTCoreAccess } from '@brian-agent/core';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import { AgentExecutionSchemaInitializer } from '../infrastructure/AgentExecutionSchemaInitializer';
import { AgentExecutionService } from '../application/AgentExecutionService';
import {
  AgentExecutionContext,
  ExecAgentInput, ExecAgentOutput,
  ExecAgentAsyncInput, ExecAgentAsyncOutput,
  ThinkInput, ThinkOutput,
  ActInput, ActOutput,
  ReflectInput, ReflectOutput,
  AnswerInput, AnswerOutput,
  GetTraceInput, GetTraceOutput,
  GetExecQueueStatusInput, GetExecQueueStatusOutput,
  ConfigAgentExecutionInput, ConfigAgentExecutionOutput,
} from '../domain/types';

/**
 * AgentExecution 接入层：Agent 执行引擎的统一入口。
 *
 * 覆盖同步/异步执行 Agent、Think/Act/Reflect/Answer 原子操作、
 * 执行轨迹与队列状态查询、执行参数配置。全部方法内部先等待表结构初始化完成。
 */
export class AgentExecutionAccess {
  private readonly service: AgentExecutionService;
  private readonly initPromise: Promise<void>;

  /**
   * @param relationDb 关系数据库接入层（表结构初始化、配置与轨迹落库）
   * @param llmAccess LLM 接入层（Think/Reflect/Answer 阶段推理）
   * @param promptsAccess Prompts 接入层（阶段 prompt 模板渲染）
   * @param skillAccess Skill 接入层（Act 执行 Skill）
   * @param soulAccess Soul 接入层（加载 system prompt）
   * @param mcpAccess MCP 接入层（Act 执行 MCP）
   * @param mqAccess MQ 接入层（异步任务投递与队列统计）
   * @param agentLibrary AgentLibrary 接入层（加载 Agent 元数据、记录使用统计）
   * @param agentStrategy AgentStrategy 接入层（加载执行策略规则）
   * @param infoCore InfoCore 接入层（会话上下文构建与执行结果存档）
   * @param mqCore MQCore 接入层（启动/查询异步执行 Worker）
   * @param skillCore SkillCore 接入层
   * @param mcpCore MCPCore 接入层
   * @param llmCore LLMCore 接入层（Agent LLM 绑定解析）
   * @param cdtCore 可选 CDT 接入层（内置浏览器工具；缺省时工具清单不含 browser）
   * @param logger 可选日志记录器
   * @param streamAccess 可选流推送接入层
   */
  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    skillAccess: SkillAccess,
    soulAccess: SoulAccess,
    mcpAccess: MCPAccess,
    mqAccess: MQAccess,
    agentLibrary: AgentLibraryAccess,
    agentStrategy: AgentStrategyAccess,
    infoCore: InfoCoreAccess,
    mqCore: MQCoreAccess,
    skillCore: SkillCoreAccess,
    mcpCore: MCPCoreAccess,
    llmCore: LLMCoreAccess,
    cdtCore?: CDTCoreAccess,
    logger?: Logger,
    streamAccess?: StreamAccess,
  ) {
    this.initPromise = new AgentExecutionSchemaInitializer(relationDb).init();
    const raw = new AgentExecutionService(
      relationDb, llmAccess, promptsAccess, skillAccess, soulAccess, mcpAccess,
      mqAccess, agentLibrary, agentStrategy, infoCore, mqCore, skillCore, mcpCore, llmCore,
      cdtCore, logger, streamAccess,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  /**
   * 等待表结构初始化完成（agent_execution_config / agent_execution_trace）。
   *
   * 初始化在构造函数中已启动，本方法幂等：重复调用仅等待同一 Promise；
   * 各业务方法内部亦会先 await 初始化，调用方可选调用。
   */
  async initialize(): Promise<void> {
    await this.initPromise;
  }

  /**
   * 同步执行一个 Agent 实例：按策略规则（CoT/ReAct/Plan-and-Solve）驱动
   * Think→Act→Reflect→Answer 循环直到产生最终答案。
   *
   * Agent 不存在或未启用、绑定 LLM 无效时抛错终止；无 Act 步的策略在工具可用时
   * 升级为 ReAct 循环；会话上下文构建失败降级为纯任务内容，不阻断执行。
   * 执行完成后记录使用统计，并将轨迹归档到 info_raw（saveInfo）与
   * agent_execution_trace 表（内存侧保留最近 100 条 LRU）。
   *
   * @param input 关键字段 agent_id、task_content；max_iterations 缺省取模块配置（默认 10）
   * @param output 回传 answer（最终答案）、iterations（实际迭代次数）、trace_id、elapsed_ms
   * @param context 会话上下文（session_id/work_id/run_id），session_id 用于构建会话记忆上下文
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 是否执行完成；未产生有效答案时置 output.error 并返回 false
   * @see docs/_3_BackendDesign/_03_Agent/AgentExecution/AgentExecution-PRD.md §2.1
   */
  async execAgent(i: ExecAgentInput, o: ExecAgentOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execAgent(i, o, c, metrics, report);
  }

  /**
   * 异步执行 Agent：将任务投递到 agent.execution MQ 队列并确保 Worker 在运行后立即返回。
   *
   * Worker 消费消息后同步调用 execAgent 执行，完成后将结果投递到
   * input.callback_queue（若指定）；startWorker 对同队列幂等复用，
   * 重复启动的失败已容忍（仅告警）。适用于长任务或批量任务。
   *
   * @param input 关键字段 agent_id、task_content；callback_queue 可选（结果回调队列）
   * @param output 回传 job_id（异步任务 ID）
   * @param context 会话上下文，session_id 随任务载荷透传给 Worker
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 投递成功且 Worker 就绪即返回 true，执行结果经回调队列异步获取
   * @see docs/_3_BackendDesign/_03_Agent/AgentExecution/AgentExecution-PRD.md §2.2
   */
  async execAgentAsync(i: ExecAgentAsyncInput, o: ExecAgentAsyncOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execAgentAsync(i, o, c, metrics, report);
  }

  /**
   * 执行 Think 原子步：LLM 基于当前上下文推理，产出推理文本与下一步行动计划。
   *
   * 渲染 think 模板（模块配置优先，未配置回退内置模板）并以 Soul 作 system prompt；
   * 结果以 info_type=THINK 存档到记忆链路。
   *
   * @param input 关键字段 llm_id、soul_id、task_content、context_data、history、iteration、tools_json
   * @param output 回传 reasoning、next_action（JSON）、prompt、raw_response 与 token 统计
   * @param context 会话上下文（session_id/run_id/work_id），随 LLM 调用透传
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 执行完成返回 true；缺 llm_id 或 LLM 调用失败抛 ValidationError
   * @see docs/_3_BackendDesign/_03_Agent/AgentExecution/AgentExecution-PRD.md §2.3.1
   */
  async execThink(i: ThinkInput, o: ThinkOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.execThink(i, o, c, metrics, report);
  }

  /**
   * 执行 Act 原子步：按 next_action 决策调用工具（SKILL/MCP 沙箱调用或内置浏览器 CDT）。
   *
   * SKILL/MCP 先校验 tool_id 在 Agent 绑定列表中，越界抛 ValidationError；
   * CDT 无需绑定校验；tool_type=NONE 时不调用外部工具。
   * 步骤结果以 info_type=SKILL/MCP/CDT 存档，工具执行失败同样落档后抛错。
   *
   * @param input 关键字段 next_action（JSON：tool_type/tool_id/params）、skill_ids、mcp_ids
   * @param output 回传 result（工具结果）、tool_type、tool_id、params、next_action
   * @param context 会话上下文（session_id 等），用于步骤结果存档
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 执行完成返回 true；动作非法、工具未绑定或执行失败抛异常
   * @see docs/_3_BackendDesign/_03_Agent/AgentExecution/AgentExecution-PRD.md §2.3.2
   */
  async execAct(i: ActInput, o: ActOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.execAct(i, o, c, metrics, report);
  }

  /**
   * 执行 Reflect 原子步：评估当前执行进展，判定继续迭代或给出最终答案。
   *
   * iteration ≥ max_iterations 时跳过 LLM 调用直接返回 should_continue=false；
   * 结果以 info_type=REFLECT 存档到记忆链路。
   *
   * @param input 关键字段 llm_id、soul_id、history、iteration、max_iterations、tools_json
   * @param output 回传 should_continue、reflection、prompt、raw_response 与 token 统计
   * @param context 会话上下文（session_id/run_id/work_id），随 LLM 调用透传
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 执行完成返回 true；缺 llm_id 或 LLM 调用失败抛 ValidationError
   * @see docs/_3_BackendDesign/_03_Agent/AgentExecution/AgentExecution-PRD.md §2.3.3
   */
  async execReflect(i: ReflectInput, o: ReflectOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.execReflect(i, o, c, metrics, report);
  }

  /**
   * 执行 Answer 原子步：基于完整执行历史生成最终的用户可见答案。
   *
   * 渲染 answer 模板（模块配置优先，未配置回退内置模板）并以 Soul 作 system prompt；
   * 本步不单独落 RESPONSE 存档（最终回复由编排层 WriterAgent 统一写入，避免多回复混淆）。
   *
   * @param input 关键字段 llm_id、soul_id、task_content、history、context_data
   * @param output 回传 answer、prompt、raw_response 与 token 统计
   * @param context 会话上下文（session_id/run_id/work_id），随 LLM 调用透传
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 执行完成返回 true；缺 llm_id 或 LLM 调用失败抛 ValidationError
   * @see docs/_3_BackendDesign/_03_Agent/AgentExecution/AgentExecution-PRD.md §2.3.4
   */
  async execAnswer(i: AnswerInput, o: AnswerOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.execAnswer(i, o, c, metrics, report);
  }

  /**
   * 按 trace_id 查询一次 Agent 执行的完整链路轨迹。
   *
   * 三级回源：内存 LRU → agent_execution_trace 表 → InfoCore 最近信息回退检索；
   * 均未命中时 output.trace = null（回退检索失败同样按未找到处理，不视为失败）。
   *
   * @param input trace_id：执行追踪 ID
   * @param output 回传 trace（trace_id/agent_id/起止时间/total_elapsed_ms/iterations/total_token_usage），未命中为 null
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 查询完成返回 true（含未命中场景）
   * @see docs/_3_BackendDesign/_03_Agent/AgentExecution/AgentExecution-PRD.md §2.4
   */
  async soTrace(i: GetTraceInput, o: GetTraceOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soTrace(i, o, c, metrics, report);
  }

  /**
   * 查看 agent.execution 队列的异步执行状态。
   *
   * 聚合队列统计（pending/processing/completed/failed）与运行中 Worker 列表；
   * 两类查询失败均降级为零值/空列表，不影响调用。
   *
   * @param input 无必填字段
   * @param output 回传 queue_stats（四类数量统计）与 workers（Worker 列表）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 始终返回 true，查询失败以降级值表达
   * @see docs/_3_BackendDesign/_03_Agent/AgentExecution/AgentExecution-PRD.md §2.5
   */
  async soExecQueueStatus(i: GetExecQueueStatusInput, o: GetExecQueueStatusOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soExecQueueStatus(i, o, c, metrics, report);
  }

  /**
   * 配置 AgentExecution 执行参数：Think/Reflect/Answer prompt 模板 ID、
   * default_max_iterations 与 async_worker_interval。
   *
   * 配置行不存在时先按默认值初始化；prompt 模板 ID 校验存在性，迭代上限与
   * Worker 间隔必须为正数，违规抛 ValidationError；仅更新传入的字段（部分更新语义）。
   *
   * @param input 全部字段可选，仅传入字段参与校验与更新
   * @param output 回传 config（更新后的完整生效配置）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 配置完成返回 true
   * @see docs/_3_BackendDesign/_03_Agent/AgentExecution/AgentExecution-PRD.md §2.6
   */
  async configAgentExecution(i: ConfigAgentExecutionInput, o: ConfigAgentExecutionOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentExecution(i, o, c, metrics, report);
  }
}