import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

export class SkillContext extends Context {}

export interface FileEntry {
  
  name: string;
  
  content: string;
}

export interface SkillData {

  name: string;

  skill_brief: string;


  skill_md: string;

  scripts?: FileEntry[];

  references?: FileEntry[];

  assets?: FileEntry[];

  positive_examples?: string[];

  negative_examples?: string[];

  enable?: boolean;
}

export interface SkillRecord extends SkillData {
  
  id: string;
  
  created: number;
  
  updated: number;
  
  enable: boolean;
  

  system: boolean;
}

export interface SystemSkillSeedSpec {
  
  id: string;
  name: string;
  skill_brief: string;
  skill_md: string;
}

export class SeedSystemSkillsInput extends Input {
  
  specs!: SystemSkillSeedSpec[];
}

export class SeedSystemSkillsOutput extends Output {
  
  seeded = 0;
  
  inserted: string[] = [];
  
  refreshed: string[] = [];
}

export class AddSkillInput extends Input {
  
  data!: SkillData;
}

export class AddSkillOutput extends Output {
  
  id = '';
}

export class GetSkillInput extends Input {
  
  id?: string;
  
  conditions?: Condition[];
}

export class GetSkillOutput extends Output {
  
  skill: SkillRecord | null = null;
}

export class UpdateSkillInput extends Input {
  
  id?: string;
  
  conditions?: Condition[];
  
  data!: Partial<SkillData>;
}

export class UpdateSkillOutput extends Output {
  
  affected_rows = 0;
}

export class DelSkillInput extends Input {
  
  ids?: string[];
  
  conditions?: Condition[];
}

export class DelSkillOutput extends Output {
  
  affected_rows = 0;
}

export class SoSkillInput extends Input {
  
  keyword?: string;
  
  conditions?: Condition[];
  
  order_by?: OrderBy[];
  
  page?: Page;
}

export class SoSkillOutput extends Output {
  
  list: SkillRecord[] = [];
  
  total = 0;
}

export class ExecSkillInput extends Input {
  
  id!: string;
  
  params!: Record<string, unknown>;
}

export class ExecSkillOutput extends Output {
  
  result: unknown = null;
}

export class EnableSkillInput extends Input {
  
  enable!: boolean;
}

export class EnableSkillOutput extends Output {}

export const SKILL_TABLE = 'skill_record';
export const SKILL_EMBEDDING_TABLE = 'skill_embedding_record';
export const SKILL_EXAMPLE_EMBEDDING_TABLE = 'skill_example_embedding_record';
export const SKILL_USAGE_TABLE = 'skill_usage_org';
export const SKILL_CONFIG_TABLE = 'skill_config_record';
