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

  get pid(): number | undefined {
    return this.child?.pid;
  }

  spawn(command: string, args: string[] = []): void {
    this.child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf-8')));
    this.child.stderr?.on('data', () => {  });
    this.child.on('exit', (code, signal) => this.onExit(code, signal));
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
    const err = new Error(`MCP stdio 进程已退出 (code=${code}, signal=${signal})`);
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

  kill(): void {
    const c = this.child;
    if (c && c.pid) {
      try {
        process.kill(-c.pid, 'SIGTERM');
      } catch {
        try {
          c.kill('SIGTERM');
        } catch {

        }
      }
    }
    this.pending.clear();
    this.child = null;
  }
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
  if (!res.ok) throw new Error(`MCP HTTP 调用失败: HTTP ${res.status} ${text}`);
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
