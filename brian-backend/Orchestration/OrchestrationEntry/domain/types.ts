import { Input, Context, Output } from '@brian-agent/base';

export class OrchestrationEntryContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

export class ReceiveWorkInput extends Input {
  session_id!: string;
  user_query!: string;
  force_orchestration_strategy?: string;
  user_profile?: Record<string, unknown>;
}

export class ReceiveWorkOutput extends Output {
  work_id = '';
  interact_id = '';
  orchestration_strategy = '';
  final_response = '';
}

export class SelectOrchestrationStrategyInput extends Input {
  user_query!: string;
  work_context?: Record<string, unknown>;
}

export class SelectOrchestrationStrategyOutput extends Output {
  strategy = '';
  complexity = 0;
  reason = '';
  plan?: Array<{ step: number; description: string }>;
}

export class ReceiveWorkAsyncInput extends Input {
  session_id!: string;
  user_query!: string;
  callback_queue?: string;
  force_orchestration_strategy?: string;
}

export class ReceiveWorkAsyncOutput extends Output {
  work_id = '';
  interact_id = '';
  job_id = '';
}

export class BuildWorkContextInput extends Input {
  session_id!: string;
  work_id!: string;
  user_query!: string;
  max_recent_works?: number;
}

export class BuildWorkContextOutput extends Output {
  work_context: Record<string, unknown> = {};
}

export class GetWorkStatusInput extends Input {
  work_id?: string;
  session_id?: string;
  status?: string;
  page?: { current: number; size: number };
}

export class GetWorkStatusOutput extends Output {
  works: Array<{
    work_id: string;
    interact_id: string;
    session_id: string;
    user_query: string;
    status: string;
    orchestration_strategy: string;
    task_count: number;
    completed_task_count: number;
    elapsed_ms: number;
    error_message: string;
    created: number;
    updated: number;
  }> = [];
}

export class CancelWorkInput extends Input {
  work_id!: string;
  reason?: string;
}

export class CancelWorkOutput extends Output {
  cancelled = false;
}

export class ConfigOrchestrationEntryInput extends Input {
  complexity_decompose_threshold?: number;
  strategy_prompt_template_id?: string;
  default_strategy?: string;
  max_recent_works?: number;
  async_worker_interval?: number;
}

export class ConfigOrchestrationEntryOutput extends Output {
  config: Record<string, unknown> = {};
}
