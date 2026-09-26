export interface HttpRequest {
  
  url: string;
  
  method?: string;
  
  headers?: Record<string, string>;
  
  body?: string | Buffer;
  
  timeoutMs?: number;
  
  signal?: AbortSignal;
}

export interface HttpResponse {
  
  ok: boolean;
  
  status: number;
  
  statusText: string;
  
  headers: Record<string, string>;
  
  bodyText: string;
}

import { Input } from '../../shared/base/Input';
import { Output } from '../../shared/base/Output';
import { Context } from '../../shared/base/Context';

export class HttpContext extends Context {}

export class ExecRequestInput extends Input {
  url!: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout_ms?: number;
  signal?: AbortSignal;
}
export class ExecRequestOutput extends Output {
  response!: HttpResponse;
}
