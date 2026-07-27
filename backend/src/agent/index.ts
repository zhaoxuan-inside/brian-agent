// Types
export type { StrategyType, AgentStatus } from '../shared/types';
export type { GraphNode, GraphEdge, TaskGraph, ExecutionTrace, ReACTTrace } from './types';

// AOP
export { AopProxy } from './infra/aopProxy';
export type { Interceptor, AopProxyOptions } from './infra/aopProxy';

// Atomic Interfaces (Think / Act / Reflect / Answer)
export { execThink, execAct, execReflect, execAnswer } from './atomic';
export type { ThinkInput, ThinkOutput, ThinkStep, ObserveEntry, ActInput, ActOutput, ReflectInput, ReflectOutput, AnswerInput, AnswerOutput } from './atomic';

// Scheduler
export { execLoop } from './scheduler/execLoop';
export type { ExecLoopConfig, ExecLoopOutput, ExecutionStatus, StrategyFlowDefinition } from './scheduler/execLoop';

// Strategy — execution functions (Agent layer), config & selection (Core layer)
export { executeReACT, executePlanExecute, executeCoT } from './strategy';

// Capability
export { buildSystemPrompt, injectVariables, injectSoul, injectTools, getSoulTemplate, getWorkTemplate } from './capability/promptTemplate';
export { defineStyle, definePersonality, defineContentRules, defineConstraints, defineTemperatureProfile, generateSoulConfig } from './capability/soulConfig';
export type { SoulConfig } from './capability/soulConfig';

// Infrastructure
export { parseInput, validateInput, preprocess, extractContext } from './infra/inputAdapter';
export { initState, updateState, createCheckpoint, restoreCheckpoint, listCheckpoints } from './infra/stateManager';
export { formatOutput, formatAsText, formatAsJSON, formatAsMarkdown, applyTemplate } from './infra/outputFormatter';

// Core Classes
export { AgentLifecycle } from './lifecycle';
export { AgentLibrary } from './agentLibrary';
export { MetaAgent } from './metaAgent';
export { TaskPlanner } from './planner';
export { GraphExecutor } from './executor';
export { SkillManager } from './skillManager';
export { AgentBuilder } from './agentBuilder';

// Writer & Evolutor (mandatory agents per PRD)
export { WriterAgent } from './writer';
export type { WriteResultInput, WriteResultOutput, WorkContent } from './writer';
export { EvolutorAgent } from './evoluator';
export type { EvaluateResultInput, EvaluateResultOutput } from './evoluator';
