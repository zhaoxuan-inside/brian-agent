import { spawn, type ChildProcess } from 'child_process';
import { ExecRequestInput, ExecRequestOutput, HttpContext } from '../../ToolProvider/domain/HttpTypes';
import { HttpAccess } from '../../ToolProvider/access/HttpAccess';

export type McpTransportType = 'stdio' | 'streamable-http' | 'http-sse' | 'rest';

export interface McpTransportConfig {

  command?: string;

  args?: string[];

  url?: string;

  method?: string;

  headers?: Record<string, string>;

  auth_token?: string;

  env?: Record<string, string>;
}

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 60000;

function parseJsonObject(line: string): Record<string, unknown> | null {
  const t = line.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseSseResponse(text: string): unknown {
  const events: unknown[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) continue;
    const data = dataLines.join('\n');
    try {
      events.push(JSON.parse(data));
    } catch {
      events.push(data);
    }
  }
  for (const e of events) {
    if (e && typeof e === 'object' && ('result' in (e as object) || 'error' in (e as object))) {
      return e;
    }
  }
  return events.length > 0 ? events : text;
}

function unwrapRpcResult(response: unknown): unknown {
  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    if (obj.error) {
      const err = obj.error as Record<string, unknown>;
      throw new Error(String(err.message ?? JSON.stringify(obj.error)));
    }
    if ('result' in obj) return obj.result;
  }
  return response;
}

const http = new HttpAccess();

export class StdioMcpClient {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private buffer = '';

  private lastStderr = '';

  get pid(): number | undefined {
    return this.child?.pid;
  }

  spawn(command: string, args: string[] = [], customEnv?: Record<string, string>): void {
    const home = process.env.HOME || '';
    const extraPaths = [
      home ? `${home}/.local/bin` : '',
      home ? `${home}/.npm-global/bin` : '',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ].filter(Boolean);
    const currentPath = process.env.PATH || '';
    const mergedPath = Array.from(new Set([...currentPath.split(':'), ...extraPaths])).filter(Boolean).join(':');

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: mergedPath,
      ...(customEnv || {}),
    };

    this.lastStderr = '';
    this.child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
    this.child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf-8')));
    this.child.stderr?.on('data', (chunk: Buffer) => {
      this.lastStderr = (this.lastStderr + chunk.toString('utf-8')).slice(-2000);
    });
    this.child.on('error', (err: Error) => this.onProcessError(err));
    this.child.on('exit', (code, signal) => this.onExit(code, signal));
  }

  private onProcessError(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private onData(text: string): void {
    this.buffer += text;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      const msg = parseJsonObject(line);
      if (!msg) continue;
      const id = msg.id;
      if (id == null) continue;
      const pending = this.pending.get(Number(id));
      if (pending) {
        this.pending.delete(Number(id));
        clearTimeout(pending.timer);
        if (msg.error) {
          const err = msg.error as Record<string, unknown>;
          pending.reject(new Error(String(err.message ?? JSON.stringify(msg.error))));
        } else {
          pending.resolve(msg.result);
        }
      }
    }
  }

  private onExit(code: number | null, signal: string | null): void {
    const detail = this.lastStderr ? ` (${this.lastStderr.trim()})` : '';
    const err = new Error(`MCP stdio 进程已退出 (code=${code}, signal=${signal})${detail}`);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  isAlive(): boolean {
    const c = this.child;
    if (!c || !c.pid) return false;
    if (c.exitCode !== null || c.signalCode !== null) return false;
    try {
      process.kill(c.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  request(method: string, params: Record<string, unknown> = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    const c = this.child;
    if (!c || !c.stdin || !this.isAlive()) {
      return Promise.reject(new Error('MCP stdio 进程未运行'));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP 请求超时: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      c.stdin!.write(payload + '\n');
    });
  }

  async initialize(): Promise<unknown> {
    return this.request(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'brian-agent', version: '1.0.0' },
      },
      15000,
    );
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args }, timeoutMs);
  }

  async listTools(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Array<{ name: string; description?: string; inputSchema?: any }>> {
    try {
      const resp = await this.request('tools/list', {}, timeoutMs);
      const unwrapped = unwrapRpcResult(resp);
      if (unwrapped && typeof unwrapped === 'object' && 'tools' in (unwrapped as object)) {
        return ((unwrapped as any).tools || []) as Array<{ name: string; description?: string; inputSchema?: any }>;
      }
      return [];
    } catch {
      return [];
    }
  }

  kill(): void {
    const c = this.child;
    if (c && c.pid) {
      try {
        c.kill('SIGTERM');
      } catch {

      }
    }
    this.pending.clear();
    this.child = null;
  }
}

/** JSON-RPC tools/list over HTTP（R7）：与 callToolOverHttp 同构的请求通道 */
export async function listToolsOverHttp(
  config: McpTransportConfig,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Array<{ name: string; description?: string; inputSchema?: any }>> {
  if (!config.url) throw new Error('HTTP 传输缺少 url');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(config.headers || {}),
  };
  if (config.auth_token) headers.Authorization = `Bearer ${config.auth_token}`;
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const httpInput = Object.assign(new ExecRequestInput(), { url: config.url, method: 'POST', headers, body, timeout_ms: timeoutMs });
  const httpOutput = new ExecRequestOutput();
  await http.execRequest(httpInput, httpOutput, new HttpContext());
  const res = httpOutput.response;
  const text = res.bodyText;
  if (!res.ok) throw new Error(`MCP tools/list 失败: HTTP ${res.status} ${text.slice(0, 200)}`);
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('MCP tools/list 响应不是合法 JSON');
  }
  const unwrapped = unwrapRpcResult(parsed);
  if (unwrapped && typeof unwrapped === 'object' && 'tools' in (unwrapped as object)) {
    return ((unwrapped as any).tools || []) as Array<{ name: string; description?: string; inputSchema?: any }>;
  }
  return [];
}

export async function callToolOverHttp(
  config: McpTransportConfig,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ raw: string; result: unknown }> {
  if (!config.url) throw new Error('HTTP 传输缺少 url');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(config.headers || {}),
  };
  if (config.auth_token) headers.Authorization = `Bearer ${config.auth_token}`;
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  });
  const httpInput = Object.assign(new ExecRequestInput(), { url: config.url, method: 'POST', headers, body, timeout_ms: timeoutMs });
  const httpOutput = new ExecRequestOutput();
  await http.execRequest(httpInput, httpOutput, new HttpContext());
  const res = httpOutput.response;
  const text = res.bodyText;
  if (!res.ok) {
    if (res.status === 401 && config.url.includes('.run.tools')) {
      throw new Error('Smithery 托管端点需要 SMITHERY_API_KEY 授权 (HTTP 401)，请在系统环境提供 SMITHERY_API_KEY');
    }
    throw new Error(`MCP HTTP 调用失败: HTTP ${res.status} ${text}`);
  }
  const contentType = res.headers['content-type'] || '';
  let result: unknown;
  if (contentType.includes('text/event-stream')) {
    result = unwrapRpcResult(parseSseResponse(text));
  } else {
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {

    }
    result = unwrapRpcResult(parsed);
  }
  return { raw: text, result };
}

export async function callToolOverRest(
  config: McpTransportConfig,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ raw: string; result: unknown }> {
  if (!config.url) throw new Error('REST 传输缺少 url');
  const method = (config.method || 'POST').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers || {}),
  };
  if (config.auth_token) headers.Authorization = `Bearer ${config.auth_token}`;
  const body = JSON.stringify({ tool: toolName, ...args });
  const httpInput = Object.assign(new ExecRequestInput(), { url: config.url, method, headers, body, timeout_ms: timeoutMs });
  const httpOutput = new ExecRequestOutput();
  await http.execRequest(httpInput, httpOutput, new HttpContext());
  const res = httpOutput.response;
  const text = res.bodyText;
  if (!res.ok) throw new Error(`MCP REST 调用失败: HTTP ${res.status} ${text}`);
  let result: unknown = text;
  try {
    result = JSON.parse(text);
  } catch {

  }
  return { raw: text, result };
}

export function generateMockParamsFromSchema(inputSchema: any): Record<string, unknown> {
  if (!inputSchema || typeof inputSchema !== 'object') return {};
  const props = inputSchema.properties || {};
  const result: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries<any>(props)) {
    if (!prop || typeof prop !== 'object') continue;
    if (prop.default !== undefined) {
      result[key] = prop.default;
      continue;
    }
    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      result[key] = prop.enum[0];
      continue;
    }
    const type = prop.type || 'string';
    const lowerKey = key.toLowerCase();
    if (type === 'string') {
      if (lowerKey.includes('url') || lowerKey.includes('link')) result[key] = 'https://example.com';
      else if (lowerKey.includes('email')) result[key] = 'user@example.com';
      else if (lowerKey.includes('repo')) result[key] = 'brian-agent';
      else if (lowerKey.includes('owner') || lowerKey.includes('user')) result[key] = 'hardstone';
      else if (lowerKey.includes('path') || lowerKey.includes('file')) result[key] = 'README.md';
      else if (lowerKey.includes('query') || lowerKey.includes('search')) result[key] = 'test query';
      else result[key] = prop.description ? prop.description.slice(0, 20) : 'sample_value';
    } else if (type === 'number' || type === 'integer') {
      result[key] = 1;
    } else if (type === 'boolean') {
      result[key] = true;
    } else if (type === 'array') {
      result[key] = [];
    } else if (type === 'object') {
      result[key] = {};
    }
  }
  return result;
}
