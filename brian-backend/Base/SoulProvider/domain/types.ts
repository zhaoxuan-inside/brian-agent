import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

export class SoulContext extends Context {}

export interface SoulData {

  title?: string;

  soul_content: string;

  soul_brief: string;

  soul_usage: string;

  positive_examples?: string[];

  negative_examples?: string[];

  enable?: boolean;
}

export interface SoulRecord extends SoulData {
  id: string;
  created: number;
  updated: number;
  enable: boolean;
}

export class AddSoulInput extends Input {
  
  data!: SoulData;
}

export class AddSoulOutput extends Output {
  
  id = '';
}

export class DelSoulInput extends Input {
  
  ids?: string[];
  
  conditions?: Condition[];
}

export class DelSoulOutput extends Output {
  
  affected_rows = 0;
}

export class UpdateSoulInput extends Input {
  
  id?: string;
  
  conditions?: Condition[];
  
  data!: Partial<SoulData>;
}

export class UpdateSoulOutput extends Output {
  
  affected_rows = 0;
}

export class GetSoulInput extends Input {
  
  id?: string;
  
  conditions?: Condition[];
}

export class GetSoulOutput extends Output {
  
  soul: SoulRecord | null = null;
}

export class SoSoulInput extends Input {
  
  keyword?: string;
  
  conditions?: Condition[];
  
  order_by?: OrderBy[];
  
  page?: Page;
}

export class SoSoulOutput extends Output {
  
  list: SoulRecord[] = [];
  
  total = 0;
}

export class EnableSoulInput extends Input {
  
  enable!: boolean;
}

export class EnableSoulOutput extends Output {}

export class CloseSoulInput extends Input {}

export class CloseSoulOutput extends Output {}

export class RecordSoulUsageInput extends Input {
  
  soul_id!: string;
}

export class RecordSoulUsageOutput extends Output {}

export const SOUL_TABLE = 'soul_record';
export const SOUL_EMBEDDING_TABLE = 'soul_embedding_record';
export const SOUL_EXAMPLE_EMBEDDING_TABLE = 'soul_example_embedding_record';
export const SOUL_USAGE_TABLE = 'soul_usage_org';
export const SOUL_CONFIG_TABLE = 'soul_config_record';
