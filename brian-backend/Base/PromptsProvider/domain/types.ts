import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

export class PromptContext extends Context {}

export interface PromptTemplateData {

  prompt_template_title: string;

  prompt_template_brief?: string;

  prompt_template: string;

  positive_examples?: string[];

  negative_examples?: string[];

  is_system?: boolean;

  enable?: boolean;
}

export interface PromptTemplateRecord extends PromptTemplateData {
  id: string;
  created: number;
  updated: number;
  enable: boolean;
}

export interface PromptTemplateUsageRecord {
  id: string;
  created: number;
  updated: number;
  prompt_template_id: string;
  usage_date: string;
  usage_count: number;
}

export class AddPromptInput extends Input {
  
  data!: PromptTemplateData;
}

export class AddPromptOutput extends Output {
  
  id = '';
}

export class DelPromptInput extends Input {
  
  ids?: string[];
  
  conditions?: Condition[];
}

export class DelPromptOutput extends Output {
  
  affected_rows = 0;
}

export class UpdatePromptInput extends Input {
  
  id?: string;
  
  conditions?: Condition[];
  
  data!: Partial<PromptTemplateData>;
}

export class UpdatePromptOutput extends Output {
  
  affected_rows = 0;
}

export class GetPromptInput extends Input {
  
  id?: string;
  
  conditions?: Condition[];
}

export class GetPromptOutput extends Output {
  
  prompt: PromptTemplateRecord | null = null;
}

export class SoPromptInput extends Input {
  
  keyword?: string;
  
  conditions?: Condition[];
  
  order_by?: OrderBy[];
  
  page?: Page;
}

export class SoPromptOutput extends Output {
  
  list: PromptTemplateRecord[] = [];
  
  total = 0;
}

export class ExecPromptInput extends Input {
  
  id!: string;
  
  variables!: Record<string, unknown>;
}

export class ExecPromptOutput extends Output {
  
  prompt = '';
}

export class EnablePromptsInput extends Input {
  
  enable!: boolean;
}

export class EnablePromptsOutput extends Output {}

export class ClosePromptInput extends Input {}

export class ClosePromptOutput extends Output {}

export const PROMPT_TEMPLATE_TABLE = 'prompt_template_record';
export const PROMPT_TEMPLATE_EMBEDDING_TABLE = 'prompt_template_embedding_record';
export const PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE = 'prompt_template_example_embedding_record';
export const PROMPT_TEMPLATE_USAGE_TABLE = 'prompt_template_usage_org';
export const PROMPTS_CONFIG_TABLE = 'prompts_config_record';
