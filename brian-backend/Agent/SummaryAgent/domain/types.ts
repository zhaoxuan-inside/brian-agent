import { Input, Context, Output } from '@brian-agent/base';

export class SummaryAgentContext extends Context {
}

export class GenerateSummaryInput extends Input {
  info_type!: string;
  info!: string;
}

export class GenerateSummaryOutput extends Output {
  summary = '';
}

/** 内置摘要生成 Soul 的标识（soul_brief，用于幂等复用） */
export const SUMMARY_SOUL_BRIEF = '摘要生成专家';

export const SUMMARY_SOUL_CONTENT = '你是一位专业的摘要生成专家，负责从系统响应内容中提炼出简洁、准确、保留关键信息与结论的摘要。';
export const SUMMARY_SOUL_USAGE = '为系统响应内容生成摘要';
