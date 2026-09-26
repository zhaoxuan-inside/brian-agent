import { HttpService } from '../application/HttpService';
import type { ConfigService } from '../../shared/config/ConfigService';
import type { HttpRequest, HttpContext, ExecRequestInput, ExecRequestOutput } from '../domain/HttpTypes';
import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';

export class HttpAccess {
  private readonly service: HttpService;

  

  constructor(config?: ConfigService) {
    this.service = new HttpService(config);
  }

  

  async execRequest(input: ExecRequestInput, output: ExecRequestOutput, _context: HttpContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    const req: HttpRequest = {
      url: input.url,
      method: input.method,
      headers: input.headers,
      body: input.body,
      timeoutMs: input.timeout_ms,
      signal: input.signal,
    };
    output.response = await this.service.request(req);
    return true;
  }
}
