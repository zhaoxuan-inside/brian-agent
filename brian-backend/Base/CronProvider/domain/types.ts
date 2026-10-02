import { Input, Context, Output } from '../../shared/base';

export class CronContext extends Context {}

export interface CronTaskRecord {
  id: string;
  
  name: string;
  
  description: string;
  
  cron: string;
  
  enabled: number;
  
  last_run: number;
  
  next_run: number;
  created: number;
  updated: number;
}

export interface CronTaskRunRecord {
  id: string;
  task_id: string;
  task_name: string;
  
  started_at: number;
  
  finished_at: number;
  
  status: string;
  
  result: string;
  
  error: string;
  created: number;
}

export class ListCronTasksInput extends Input {
}

export class ListCronTasksOutput extends Output {
  tasks: CronTaskRecord[] = [];
}

export class GetCronTaskInput extends Input {
  name!: string;
}

export class GetCronTaskOutput extends Output {
  task: CronTaskRecord | null = null;
}

export class SetCronTaskInput extends Input {
  name!: string;
  cron!: string;
}

export class SetCronTaskOutput extends Output {
  task: CronTaskRecord | null = null;
}

export class SetCronTaskEnabledInput extends Input {
  name!: string;
  enabled!: boolean;
}

export class SetCronTaskEnabledOutput extends Output {
  task: CronTaskRecord | null = null;
}

export class TriggerCronTaskInput extends Input {
  name!: string;
}

export class TriggerCronTaskOutput extends Output {
  run: CronTaskRunRecord | null = null;
}

export class ListCronTaskRunsInput extends Input {
  name?: string;
  
  limit?: number;
}

export class ListCronTaskRunsOutput extends Output {
  runs: CronTaskRunRecord[] = [];
}

export const CRON_TASK_TABLE = 'cron_task_record';
export const CRON_TASK_RUN_TABLE = 'cron_task_run_record';

export const CRON_RUN_STATUS = {
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
