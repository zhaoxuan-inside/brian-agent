import type { Metrics, Report } from '@brian-agent/base';
import { Input, Context, Output } from '@brian-agent/base';
import { AbortReason } from '../../shared/types';

export class RunGatewayContext extends Context {}

export enum LaneKind {
  Session = 'session',
  Main = 'main',
  Subagent = 'subagent',
  Background = 'background',
}

export const LANE_CONCURRENCY: Record<LaneKind, number> = {
  [LaneKind.Session]: 1,
  [LaneKind.Main]: 16,
  [LaneKind.Subagent]: 8,
  [LaneKind.Background]: 2,
}

export enum QueueMode {
  
  Steer = 'steer',
  
  Followup = 'followup',
  
  Collect = 'collect',
  
  Interrupt = 'interrupt',
}

export enum RunStatus {
  Accepted = 'accepted',
  Running = 'running',
  Queued = 'queued',
  Finished = 'finished',
  Error = 'error',
  Aborted = 'aborted',
}

export interface RunRecord {
  id: string;
  session_key: string;
  
  session_id: string;
  agent_def_id: string;
  lane: string;
  status: RunStatus;
  stop_reason?: string;
  queue_mode?: QueueMode;
  budget_total: number;
  budget_used: number;
  accepted_at: number;
  started_at?: number;
  settled_at?: number;
  created: number;
  updated: number;
}

export class SubmitRunInput extends Input {
  
  session_key!: string;
  
  session_id?: string;
  
  user_message!: string;
  
  queue_mode?: QueueMode;
  context_id?: string;
  
  budget_total?: number;
  
  lane_kind?: LaneKind;
  
  parent_run_id?: string;
  
  agent_ref?: string;
}

export class SubmitRunOutput extends Output {
  
  run_id!: string;
  
  accepted_at!: number;
  
  queued!: boolean;
  
  steered!: boolean;
}

export class WaitRunInput extends Input {
  
  run_id!: string;
  
  timeout_ms?: number;
}

export class WaitRunOutput extends Output {
  
  status!: RunStatus;
  
  stop_reason?: string;
}

export class SteerRunInput extends Input {
  
  session_key!: string;
  
  message!: string;
}

export class SteerRunOutput extends Output {
  
  run_id!: string;
  
  enqueued!: boolean;
}

export class AbortRunInput extends Input {
  
  run_id!: string;
  
  reason!: AbortReason;
}

export class AbortRunOutput extends Output {
  
  signalled!: boolean;
}

export class SoRunStatusInput extends Input {
  
  run_id!: string;
}

export class SoRunStatusOutput extends Output {
  
  run?: RunRecord;
}

export class WaitPermissionInput extends Input {
  
  permission_id!: string;
  
  tool_id?: string;
}

export class WaitPermissionOutput extends Output {
  
  approved = false;
  
  answered = false;
  
  auto_approved = false;
}

export class AnswerPermissionInput extends Input {
  
  permission_id!: string;
  
  approved!: boolean;
  
  remember?: boolean;
}

export class AnswerPermissionOutput extends Output {
  
  answered = false;
}

export class WaitUserAnswerInput extends Input {
  
  ask_id!: string;
  
  run_id!: string;
  
  session_key!: string;
}

export class WaitUserAnswerOutput extends Output {
  
  answer = '';
  
  answered = false;
}

export class AnswerUserAskInput extends Input {
  
  ask_id!: string;
  
  answer!: string;
}

export class AnswerUserAskOutput extends Output {
  
  answered = false;
}

export class ConfigRunsInput extends Input {
  
  enabled?: boolean;
  
  permission_wait_timeout_ms?: number;
  
  trusted_tools?: string[];
  
  
  eval_async?: boolean;
  
  eval_skip_low_risk?: boolean;
}

export class ConfigRunsOutput extends Output {
  
  permission_wait_timeout_ms?: number;
  
  trusted_tools?: string[];
  
  eval_async?: boolean;
  
  eval_skip_low_risk?: boolean;
}

export interface SessionLane {
  
  activeRunId?: string;
  
  pending: Array<{ runId: string; input: SubmitRunInput; parent?: { metrics?: Metrics; report?: Report } }>;
  
  steering: string[];
}

export interface Waiter {
  resolve: (result: { status: RunStatus; stop_reason?: string }) => void;
}

export const RUNTIME_RUN_TABLE = 'runtime_run';

export const RUNTIME_RUNS_CONFIG_TABLE = 'runtime_runs_config';
