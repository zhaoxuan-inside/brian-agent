import http from 'node:http';
import https from 'node:https';
import type { HttpRequest, HttpResponse } from '../domain/HttpTypes';
import type { ConfigService } from '../../shared/config/ConfigService';

const DEFAULT_TIMEOUT_MS = 60000;

type ProxySettle = (err: Error | null, value?: HttpResponse) => void;

export class HttpService {
  private readonly config?: ConfigService;

  

  constructor(config?: ConfigService) {
    this.config = config;
  }

  

  async getDefaultTimeout(): Promise<number> {
    if (this.config) {
      try {
        const configured = await this.config.getInt('http_timeout_ms', DEFAULT_TIMEOUT_MS);
        if (configured > 0) return configured;
      } catch {
        return DEFAULT_TIMEOUT_MS;
      }
    }
    return DEFAULT_TIMEOUT_MS;
  }

  

  async request(req: HttpRequest): Promise<HttpResponse> {
    const timeoutMs = req.timeoutMs ?? await this.getDefaultTimeout();

    const proxy =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(req.url);
    } catch {
      parsedUrl = new URL(req.url, 'http://localhost');
    }

    const isLocalhost =
      parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === '::1' ||
      parsedUrl.hostname === '0.0.0.0';

    if (!proxy || isLocalhost) {
      return this.directFetch(req, timeoutMs);
    }

    return this.proxyFetch(req, parsedUrl, proxy, timeoutMs);
  }

  

  private async directFetch(req: HttpRequest, timeoutMs: number): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const signal = req.signal
      ? this.combineSignals(req.signal, controller.signal)
      : controller.signal;

    try {
      const res = await fetch(req.url, {
        method: req.method || 'GET',
        headers: req.headers,
        body: Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : req.body,
        signal,
      });
      const bodyText = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: this.headersToRecord(res.headers),
        bodyText,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  

  private proxyFetch(
    req: HttpRequest,
    parsedUrl: URL,
    proxy: string,
    timeoutMs: number,
  ): Promise<HttpResponse> {
    return new Promise<HttpResponse>((resolve, reject) => {
      const settle = this.createProxySettle(resolve, reject);
      const agent = this.resolveProxyAgent(parsedUrl, proxy);
      const options = this.buildProxyOptions(parsedUrl, req, agent, timeoutMs);
      const clientReq = this.openProxyRequest(parsedUrl, options);
      const cleanup = this.armProxyTimeout(clientReq, req, timeoutMs, settle);
      this.attachProxyResponse(clientReq, cleanup, settle);
      this.sendProxyBody(clientReq, req);
    });
  }

  
  private createProxySettle(
    resolve: (v: HttpResponse) => void,
    reject: (e: Error) => void,
  ): ProxySettle {
    let settled = false;
    return (err, value) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value as HttpResponse);
    };
  }

  
  private resolveProxyAgent(parsedUrl: URL, proxy: string): unknown {
    try {
      if (parsedUrl.protocol === 'https:') {
        
        
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        const { HttpsProxyAgent } = require('https-proxy-agent');
        return new HttpsProxyAgent(proxy);
      }
      
      
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { HttpProxyAgent } = require('http-proxy-agent');
      return new HttpProxyAgent(proxy);
    } catch {
      return undefined;
    }
  }

  
  private buildProxyOptions(
    parsedUrl: URL,
    req: HttpRequest,
    agent: unknown,
    timeoutMs: number,
  ): https.RequestOptions {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers ?? {})) {
      if (v !== undefined) headers[k] = String(v);
    }
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: req.method || 'GET',
      headers,
      timeout: timeoutMs,
    };
    if (agent) options.agent = agent as https.RequestOptions['agent'];
    return options;
  }

  
  private openProxyRequest(parsedUrl: URL, options: https.RequestOptions): http.ClientRequest {
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    return lib.request(options);
  }

  
  private armProxyTimeout(
    clientReq: http.ClientRequest,
    req: HttpRequest,
    timeoutMs: number,
    settle: ProxySettle,
  ): () => void {
    const timer = setTimeout(() => clientReq.destroy(this.timeoutError(timeoutMs)), timeoutMs);
    const cleanup = (): void => clearTimeout(timer);
    clientReq.on('timeout', () => clientReq.destroy(this.timeoutError(timeoutMs)));
    clientReq.on('error', (err) => {
      cleanup();
      settle(err instanceof Error ? err : new Error(String(err)));
    });
    req.signal?.addEventListener('abort', () => clientReq.destroy(new Error('Request aborted')));
    return cleanup;
  }

  
  private attachProxyResponse(
    clientReq: http.ClientRequest,
    cleanup: () => void,
    settle: ProxySettle,
  ): void {
    clientReq.on('response', (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('error', (err) => {
        cleanup();
        settle(err instanceof Error ? err : new Error(String(err)));
      });
      res.on('end', () => {
        cleanup();
        settle(null, this.buildProxyHttpResponse(res, chunks));
      });
    });
  }

  
  private buildProxyHttpResponse(res: http.IncomingMessage, chunks: Buffer[]): HttpResponse {
    const status = res.statusCode || 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: res.statusMessage || '',
      headers: this.lowercaseHeaders(res.headers),
      bodyText: Buffer.concat(chunks).toString('utf-8'),
    };
  }

  
  private sendProxyBody(clientReq: http.ClientRequest, req: HttpRequest): void {
    if (req.body) {
      clientReq.write(typeof req.body === 'string' ? req.body : req.body.toString());
    }
    clientReq.end();
  }

  
  private timeoutError(timeoutMs: number): Error {
    return new Error(`Request timeout after ${timeoutMs}ms`);
  }

  private headersToRecord(h: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    h.forEach((v, k) => { result[k] = v; });
    return result;
  }

  private lowercaseHeaders(h: Record<string, string | string[] | undefined>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      if (v !== undefined) {
        result[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
      }
    }
    return result;
  }

  private combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
    if (a.aborted || b.aborted) {
      return AbortSignal.abort();
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    a.addEventListener('abort', onAbort, { once: true });
    b.addEventListener('abort', onAbort, { once: true });
    return controller.signal;
  }
}
