/**
 * @fileoverview MCP 传输层客户端。
 *
 * 支持 MCP（Model Context Protocol）的四种调用方式：
 * 1. `stdio`           —— 本地进程，JSON-RPC 2.0 over stdin/stdout（换行分隔 JSON）；
 * 2. `streamable-http` —— 单个 HTTP 端点，POST JSON-RPC 2.0，响应为 JSON 或 SSE 流；
 * 3. `http-sse`        —— 旧版 HTTP 传输，POST JSON-RPC 2.0 + SSE 响应；
 * 4. `rest`            —— 平台托管的原生 REST API（如阿里云百炼 / Smithery 托管连接）。
 *
 * 无第三方 MCP SDK 依赖，JSON-RPC 2.0 协议在本文件内实现。
 */

import { spawn, type ChildProcess } from 'child_process';
import { ExecRequestInput, ExecRequestOutput, HttpContext } from '../../ToolProvider/domain/HttpTypes';
import { HttpAccess } from '../../ToolProvider/access/HttpAccess';

/** MCP 通信方式 */
export type McpTransportType = 'stdio' | 'streamable-http' | 'http-sse' | 'rest';

/** 传输配置（对应 mcp_install.transport_config 的 JSON 结构） */
export interface McpTransportConfig {
  /** stdio：启动命令 */
  command?: string;
  /** stdio：命令参数 */
  args?: string[];
  /** http/rest：端点 URL */
  url?: string;
  /** rest：HTTP 方法，默认 POST */
  method?: string;
  /** http/rest：额外请求头 */
  headers?: Record<string, string>;
  /** rest：认证 token（Bearer） */
  auth_token?: string;
}

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 60000;

// ---------------------------------------------------------------------------
// JSON-RPC / SSE 解析
// ---------------------------------------------------------------------------

function parseJsonObject(line: string): Record<string, unknown> | null {
  const t = line.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 从 SSE 文本中提取 JSON-RPC 响应对象（含 result/error） */
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

/** 从 JSON-RPC 响应中抽取 result，若含 error 则抛错 */
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

/** 统一 HTTP 请求入口（由 ToolProvider 集中处理代理/超时） */
const http = new HttpAccess();

// ---------------------------------------------------------------------------
// stdio 客户端（长驻进程 + JSON-RPC 请求/响应关联）
// ---------------------------------------------------------------------------

/**
 * 基于 stdio 的 MCP 客户端。
 *
 * 以 `spawn(command, args, { stdio: ['pipe','pipe','pipe'] })`（无 shell）启动，
 * 通过换行分隔的 JSON-RPC 2.0 消息与进程双向通信。支持请求/响应按 id 关联，
 * 忽略通知（id 为 null）与服务端 stderr 日志。
 */
export class StdioMcpClient {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private buffer = '';

  get pid(): number | undefined {
    return this.child?.pid;
  }

  /** 启动进程（无 shell，保证 stdout 为纯净 JSON-RPC 流） */
  spawn(command: string, args: string[] = []): void {
    this.child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf-8')));
    this.child.stderr?.on('data', () => { /* stderr 仅作日志，忽略 */ });
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
      if (id == null) continue; // 通知消息
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

  /** 进程是否真实存活 */
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

  /** 发送 JSON-RPC 请求并等待响应 */
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

  /** MCP 握手 */
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

  /** 列出工具 */
  async listTools(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    return this.request('tools/list', {}, timeoutMs);
  }

  /** 调用工具 */
  async callTool(name: string, args: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args }, timeoutMs);
  }

  /** 终止进程（按进程组） */
  kill(): void {
    const c = this.child;
    if (c && c.pid) {
      try {
        process.kill(-c.pid, 'SIGTERM');
      } catch {
        try {
          c.kill('SIGTERM');
        } catch {
          /* 二次 kill 失败可容忍：进程可能已自行退出（ESRCH），随进程退出自然回收 */
        }
      }
    }
    this.pending.clear();
    this.child = null;
  }
}

// ---------------------------------------------------------------------------
// HTTP 传输（streamable-http / http-sse）
// ---------------------------------------------------------------------------

/**
 * Streamable HTTP / HTTP+SSE 调用工具。
 *
 * POST JSON-RPC 2.0 `tools/call` 到端点，Accept 同时声明 JSON 与 SSE；
 * 响应为 JSON 时直接解析，为 SSE 流时提取 JSON-RPC 响应。
 */
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
      /* 非 JSON 响应保持原文（协议格式容忍）：unwrapRpcResult 按原文返回给调用方 */
    }
    result = unwrapRpcResult(parsed);
  }
  return { raw: text, result };
}

// ---------------------------------------------------------------------------
// REST 传输（平台原生 API）
// ---------------------------------------------------------------------------

/** 平台托管的原生 REST API 调用工具 */
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
    /* 非 JSON 响应保持原文（协议格式容忍）：2xx 非 JSON 体按原文返回给调用方 */
  }
  return { raw: text, result };
}
