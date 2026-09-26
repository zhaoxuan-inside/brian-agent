import { Input, Context, Output } from '@brian-agent/base';
import type { Metrics, Report } from '@brian-agent/base';
import type { z } from 'zod';

export class SkillRuntimeContext extends Context {}

export enum SkillResultStatus {
  Ok = 'ok',
  
  Error = 'error',
  
  Denied = 'denied',
}

export interface SkillResult {
  
  status: SkillResultStatus;
  
  output: string;
  
  elapsed_ms?: number;
}

export interface ComponentScope {
  
  skills: string[];
  
  mcps: string[];
}

export interface SkillExecutionContext {
  
  run_id?: string;
  
  session_key?: string;
  
  signal?: AbortSignal;
  
  emitEvent?: (type: string, payload: unknown) => void;
  
  component_scope?: ComponentScope;
  
  metrics?: Metrics;
  
  report?: Report;
}

export interface SkillDef<P> {
  
  id: string;
  
  description: string;
  
  parameters: z.ZodType<P>;
  
  max_output?: number;
  
  execute(args: P, ctx: SkillExecutionContext): Promise<SkillResult>;
}

export interface AnySkillDef {
  id: string;
  description: string;
  parameters: z.ZodType<unknown>;
  max_output?: number;
  execute(args: unknown, ctx: SkillExecutionContext): Promise<SkillResult>;
}

export interface SkillSpecJson {
  id: string;
  description: string;
  
  parameters: Record<string, unknown>;
}

export class RegisterSkillInput extends Input {
  
  def!: AnySkillDef;
}

export class RegisterSkillOutput extends Output {}

export class ExecSkillInput extends Input {
  
  tool_id!: string;
  
  raw_args!: string;
  
  run_id?: string;
  
  session_key?: string;
  
  signal?: AbortSignal;
  
  emitEvent?: (type: string, payload: unknown) => void;
  
  component_scope?: ComponentScope;
}

export class ExecSkillOutput extends Output {
  
  result!: SkillResult;
}

export class SoSkillsInput extends Input {
  
  skill_ids?: string[];
  
  run_id?: string;
}

export class SoSkillsOutput extends Output {
  
  specs: SkillSpecJson[] = [];
}

export class RegisterRunSkillsInput extends Input {
  
  run_id!: string;
  
  skill_ids: string[] = [];
}

export class RegisterSkillsOutput extends Output {
  
  registered: string[] = [];
}

export class ClearRunSkillsInput extends Input {
  run_id!: string;
}

export class RegisterBuiltinSkillsInput extends Input {
  
  enabled?: string[];
}

export class RegisterBuiltinSkillsOutput extends Output {
  
  registered: string[] = [];
}

export class ConfigToolInput extends Input {
  
  default_max_output?: number;
}

export class ConfigToolOutput extends Output {}
