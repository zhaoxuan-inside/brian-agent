import { Context, Input, Output } from '@brian-agent/base';

export class IntentAgentContext extends Context {
}

export const INTENT_SOUL_BRIEF = '内置需求理解与意图比对专家';
export const INTENT_SOUL_CONTENT =
  '你是一个精通需求分析与意图推断的专业 Agent。你的职责是结合用户的最新输入、历史沟通对话、固定钉住的信息以及引用的特定消息，将模糊或不完整的用户需求改写为明确、具体、可直接交付执行 Agent 的任务描述，并对原始输入与理解需求的匹配程度进行 0-100 的打分。';
export const INTENT_SOUL_USAGE = '系统内置 - 需求理解与意图匹配评估';

export class UnderstandRequirementInput extends Input {
  session_id!: string;
  work_id?: string;
  user_query!: string;
  citing_msg_ids?: string[];
  selected_msg_ids?: string[];
  run_id?: string;
}

// ===== 修改后的 UnderstandRequirementOutput 定义：追加 PromptProvider 返回的完整 Prompt 与 Token 用量 =====
export class UnderstandRequirementOutput extends Output {
  understood_requirement = '';
  match_score = 100;
  reasoning = '';
  should_modify_query = false;
  threshold_score = 80;
  prompt = '';
  input_tokens = 0;
  output_tokens = 0;
}
