import type { GraphState, StrategyType, UnifiedMemoryItem } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_QUALITY_THRESHOLD = 0.7;

export function initState(
  userMessage: string,
  maxIterations?: number
): GraphState {
  return {
    userMessage,
    taskPlan: [],
    subTaskResults: new Map(),
    memoryContext: [],
    iterationCount: 0,
    maxIterations: maxIterations ?? DEFAULT_MAX_ITERATIONS,
    currentStrategy: 'react',
    qualityScore: 0,
    qualityThreshold: DEFAULT_QUALITY_THRESHOLD,
    finalOutput: '',
    errors: [],
    trace: [],
    checkpoints: new Map(),
  };
}

export function updateState(
  state: GraphState,
  updates: Partial<GraphState>
): GraphState {
  const updated: GraphState = {
    userMessage: updates.userMessage ?? state.userMessage,
    taskPlan: updates.taskPlan ?? state.taskPlan,
    subTaskResults: updates.subTaskResults ?? state.subTaskResults,
    memoryContext: updates.memoryContext ?? state.memoryContext,
    iterationCount: updates.iterationCount ?? state.iterationCount,
    maxIterations: updates.maxIterations ?? state.maxIterations,
    currentStrategy: updates.currentStrategy ?? state.currentStrategy,
    qualityScore: updates.qualityScore ?? state.qualityScore,
    qualityThreshold: updates.qualityThreshold ?? state.qualityThreshold,
    finalOutput: updates.finalOutput ?? state.finalOutput,
    errors: updates.errors ?? state.errors,
    trace: updates.trace ?? state.trace,
    checkpoints: updates.checkpoints ?? state.checkpoints,
  };

  return updated;
}

export function createCheckpoint(
  state: GraphState,
  label: string
): string {
  const checkpointId = uuidv4();

  // Deep clone the state (excluding the checkpoints map itself to avoid recursion)
  const checkpointState: GraphState = {
    userMessage: state.userMessage,
    taskPlan: state.taskPlan.map(p => ({ ...p })),
    subTaskResults: new Map(state.subTaskResults),
    memoryContext: state.memoryContext.map(m => ({ ...m })),
    iterationCount: state.iterationCount,
    maxIterations: state.maxIterations,
    currentStrategy: state.currentStrategy,
    qualityScore: state.qualityScore,
    qualityThreshold: state.qualityThreshold,
    finalOutput: state.finalOutput,
    errors: state.errors.map(e => ({ ...e })),
    trace: state.trace.map(t => ({ ...t })),
    checkpoints: new Map(), // Don't nest checkpoints
  };

  state.checkpoints.set(checkpointId, checkpointState);

  return checkpointId;
}

export function restoreCheckpoint(
  state: GraphState,
  checkpointId: string
): GraphState {
  const checkpoint = state.checkpoints.get(checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint "${checkpointId}" not found`);
  }

  // Restore the checkpoint data into the current state
  state.userMessage = checkpoint.userMessage;
  state.taskPlan = checkpoint.taskPlan.map(p => ({ ...p }));
  state.subTaskResults = new Map(checkpoint.subTaskResults);
  state.memoryContext = checkpoint.memoryContext.map(m => ({ ...m }));
  state.iterationCount = checkpoint.iterationCount;
  state.maxIterations = checkpoint.maxIterations;
  state.currentStrategy = checkpoint.currentStrategy;
  state.qualityScore = checkpoint.qualityScore;
  state.qualityThreshold = checkpoint.qualityThreshold;
  state.finalOutput = checkpoint.finalOutput;
  state.errors = checkpoint.errors.map(e => ({ ...e }));
  state.trace = checkpoint.trace.map(t => ({ ...t }));

  return state;
}

export function listCheckpoints(state: GraphState): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];

  for (const [id, checkpoint] of state.checkpoints.entries()) {
    result.push({
      id,
      label: `Checkpoint at iteration ${checkpoint.iterationCount} (strategy: ${checkpoint.currentStrategy})`,
    });
  }

  return result;
}