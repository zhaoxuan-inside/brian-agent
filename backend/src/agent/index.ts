import type { AgentTypeEnum, EvalTypeEnum, ResponseFormatEnum, StyleEnum, DepthEnum, ToolTypeEnum, TaskDag, WorkAgentResult, ScoresEvalWork, ScoresEvalWriter, UserProfile, ExecutionRuleSteps, ExecutionRulePhase, ExecutionRuleStep } from './AgentLibrary/agentTypes';
export type { AgentTypeEnum, EvalTypeEnum, ResponseFormatEnum, StyleEnum, DepthEnum, ToolTypeEnum, TaskDag, WorkAgentResult, ScoresEvalWork, ScoresEvalWriter, UserProfile, ExecutionRuleSteps, ExecutionRulePhase, ExecutionRuleStep };

// types
export type { GraphNode, GraphEdge, TaskGraph, ExecutionTrace, ReACTTrace } from './types';

// AOP
export { AopProxy } from './infra/aopProxy';
export type { Interceptor, AopProxyOptions } from './infra/aopProxy';

// Infrastructure
export { parseInput, validateInput, preprocess, extractContext } from './infra/inputAdapter';
export { initState, updateState, createCheckpoint, restoreCheckpoint, listCheckpoints } from './infra/stateManager';
export { formatOutput, formatAsText, formatAsJSON, formatAsMarkdown, applyTemplate } from './infra/outputFormatter';

// Capability
export { buildSystemPrompt, injectVariables, injectSoul, injectTools, getSoulTemplate, getWorkTemplate } from './capability/promptTemplate';
export { defineStyle, definePersonality, defineContentRules, defineConstraints, defineTemperatureProfile, generateSoulConfig } from './capability/soulConfig';
export type { SoulConfig } from './capability/soulConfig';

// === PRD Agent Layer Modules ===

export { AgentLibraryService, createAgentLibraryService } from './AgentLibrary/AgentLibrary';
export type { AddAgentInput, MatchAgentInput, UpdateAgentInput, RecordAgentUsageInput, GetAgentInput, AgeAgentInput, GetAgentRuleInput, UpdateAgentRuleInput, ConfigAgentLibraryInput, AddAgentOutput, MatchAgentOutput, UpdateAgentOutput, RecordAgentUsageOutput, GetAgentOutput, AgeAgentOutput, GetAgentRuleOutput, UpdateAgentRuleOutput, ConfigAgentLibraryOutput } from './AgentLibrary/AgentLibrary';
export { getAgentByAgentId, listAgents, recordAgentUsage, getAgentLibraryConfig } from './AgentLibrary/db';

export { AgentBuilderService, createAgentBuilderService } from './AgentBuilder/AgentBuilder';
export type { BuildAgentInput, OptimizeAgentInput, BuildPlannerAgentInput, BuildWriterAgentInput, BuildEvolutorAgentInput, ConfigAgentBuilderInput, BuildAgentOutput, OptimizeAgentOutput, BuildPlannerAgentOutput, BuildWriterAgentOutput, BuildEvolutorAgentOutput, ConfigAgentBuilderOutput } from './AgentBuilder/AgentBuilder';

export { AgentExecutionService, createAgentExecutionService } from './AgentExecution/AgentExecution';
export type { ExecAgentInput, ExecAgentAsyncInput, ThinkInput, ActInput, ReflectInput, AnswerInput, GetTraceInput, GetExecQueueStatusInput, ConfigAgentExecutionInput, ExecAgentOutput, ExecAgentAsyncOutput, ThinkOutput, ActOutput, ReflectOutput, AnswerOutput, GetTraceOutput, GetExecQueueStatusOutput, ConfigAgentExecutionOutput } from './AgentExecution/AgentExecution';

export { AgentStrategyService, createAgentStrategyService } from './AgentStrategy/AgentStrategy';
export type { MatchStrategyInput, GetStrategyInput, SoStrategyInput, AddStrategyInput, UpdateStrategyInput, ConfigAgentStrategyInput, MatchStrategyOutput, GetStrategyOutput, SoStrategyOutput, AddStrategyOutput, UpdateStrategyOutput, ConfigAgentStrategyOutput } from './AgentStrategy/AgentStrategy';

export { PlannerAgentService, createPlannerAgentService } from './PlannerAgent/PlannerAgent';
export type { PlanInput, ReplanInput, GetPlanInput, ConfigPlannerAgentInput, PlanOutput, ReplanOutput, GetPlanOutput, ConfigPlannerAgentOutput } from './PlannerAgent/PlannerAgent';

export { WriterAgentService, createWriterAgentService } from './WriterAgent/WriterAgent';
export type { WriteInput, SaveUserProfileInput, GetUserProfileInput, ConfigWriterAgentInput, WriteOutput, SaveUserProfileOutput, GetUserProfileOutput, ConfigWriterAgentOutput } from './WriterAgent/WriterAgent';

export { EvolutorAgentService, createEvolutorAgentService } from './EvolutorAgent/EvolutorAgent';
export type { EvalWorkAgentInput, EvalWriterAgentInput, StartEvalScheduleInput, StopEvalScheduleInput, GetEvaluationInput, GetEvolutionReportInput, ConfigEvolutorAgentInput, EvalWorkAgentOutput, EvalWriterAgentOutput, StartEvalScheduleOutput, StopEvalScheduleOutput, GetEvaluationOutput, GetEvolutionReportOutput, ConfigEvolutorAgentOutput } from './EvolutorAgent/EvolutorAgent';

// Atomic functions
export { execThink, execAct, execReflect, execAnswer } from './atomic';
export type { ThinkStep, ObserveEntry } from './atomic/think';

// Strategy execution
export { executeReACT, executePlanExecute, executeCoT } from './strategy';

// Legacy (kept for compatibility with app.ts)
export { AgentLibrary } from './agentLibrary';
export { AgentBuilder } from './agentBuilder';
export { MetaAgent } from './metaAgent';
export { TaskPlanner } from './planner';
export { GraphExecutor } from './executor';
export { SkillManager } from './skillManager';
export { AgentLifecycle } from './lifecycle';
