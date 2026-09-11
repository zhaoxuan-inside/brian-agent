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
  info_type?: string;
  info_creator_id?: string;
  info_creator_role?: string;
  citing_msg_ids?: string[];
  selected_msg_ids?: string[];
  skip_intent_check?: boolean;
}

export class ReceiveWorkOutput extends Output {
  work_id = '';
  interact_id = '';
  orchestration_strategy = '';
  final_response = '';
  /** 是否因需求理解无法自动决策而暂停，等待用户确认（此时 final_response 为空，不应流式输出文本） */
  paused = false;
  /** 暂停等待用户补充参数时的澄清问题（需用户补充参数才能执行的任务） */
  clarifications: Array<{ question: string; domain?: string }> = [];
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
  session_type?: string;
  info_type?: string;
  info_creator_id?: string;
  info_creator_role?: string;
  selected_msg_ids?: string[];
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
  selected_msg_ids?: string[];
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

export class ConfirmIntentInput extends Input {
  session_id!: string;
  work_id!: string;
  action!: 'APPROVE' | 'KEEP' | 'CANCEL';
  understood_requirement?: string;
}

export class ConfirmIntentOutput extends Output {
  success = false;
  action_applied = '';
  next_status = '';
  /** 确认后重入编排得到的最终回复（CANCEL 或失败时为空），供 SSE 流式回传 */
  final_response = '';
  interact_id = '';
}

/** 用户补充参数后重入编排的入参（澄清问题答案提交）。 */
export class SubmitClarificationInput extends Input {
  session_id!: string;
  work_id!: string;
  /** 用户对澄清问题的回答，按 clarifications 顺序对应 */
  answers!: Array<{ question: string; answer: string }>;
}

export class SubmitClarificationOutput extends Output {
  success = false;
  /** 重入编排得到的最终回复（失败时为空），供 SSE 流式回传 */
  final_response = '';
  interact_id = '';
  /** 若重入后仍因缺少参数再次暂停，返回新一轮澄清问题 */
  clarifications: Array<{ question: string; domain?: string }> = [];
}

export class ConfigOrchestrationEntryInput extends Input {
  complexity_decompose_threshold?: number;
  strategy_prompt_template_id?: string;
  default_strategy?: string;
  max_recent_works?: number;
  async_worker_interval?: number;
  /** 是否启用 Planner 任务拆解（PLANNING 策略）；false 时仅使用单 Agent（SIMPLE）执行 */
  enable_planner?: boolean;
}

export class ConfigOrchestrationEntryOutput extends Output {
  config: Record<string, unknown> = {};
}
