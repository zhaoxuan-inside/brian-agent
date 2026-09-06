import { Input, Context, Output } from '@brian-agent/base';

export class MonitorContext extends Context {}

export interface HealthComponent {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: Record<string, string | number>;
}

export class GetHealthAllInput extends Input {}
export class GetHealthAllOutput extends Output {
  status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  uptime = 0;
  components: HealthComponent[] = [];
}

export class GetResourcesInput extends Input {}
export class GetResourcesOutput extends Output {
  cpu = 0;
  memory = 0;
  disk = 0;
  cores = 0;
  load1 = 0;
  load5 = 0;
  load15 = 0;
  timestamp = 0;
}

export class GetTokenTrendInput extends Input {}
export class GetTokenTrendOutput extends Output {
  points: Array<{ date: string; tokens: number }> = [];
}

export class GetModelDistributionInput extends Input {}
export class GetModelDistributionOutput extends Output {
  models: Array<{
    model: string;
    type: string;
    tokens: number;
    input_tokens: number;
    output_tokens: number;
    deleted: boolean;
  }> = [];
}

export class GetTokenUsageInput extends Input {}
export class GetTokenUsageOutput extends Output {
  today: { tokens: number; requests: number } = { tokens: 0, requests: 0 };
  month: { tokens: number; requests: number } = { tokens: 0, requests: 0 };
}

export class QueryLogsInput extends Input {
  level?: string;
  source?: string;
  keyword?: string;
  work_id?: string;
  interact_id?: string;
  log_source?: string;
  start_time?: number;
  end_time?: number;
  page?: number;
  pageSize?: number;
}
export class QueryLogsOutput extends Output {
  entries: Array<{
    id: string;
    timestamp: number;
    level: string;
    source: string;
    message: string;
    trace_id: string;
    caller: string;
    work_id: string;
    interact_id: string;
  }> = [];
  total = 0;
  page = 1;
  pageSize = 50;
}

export class GetLogStatsInput extends Input {
  start_time?: number;
  end_time?: number;
}
export class GetLogStatsOutput extends Output {
  distribution: Array<{ level: string; count: number }> = [];
}

export class GetLogSourcesInput extends Input {}
export class GetLogSourcesOutput extends Output {
  sources: string[] = [];
}

export class DeleteLogsInput extends Input {
  ids: string[] = [];
}
export class DeleteLogsOutput extends Output {
  deleted_count = 0;
}

export class ClearLogsInput extends Input {}
export class ClearLogsOutput extends Output {
  deleted_count = 0;
}
