import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpAccess, ExecRequestInput, ExecRequestOutput, HttpContext } from '../ToolProvider';

const PROXY_KEYS = [
  'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy',
];

function clearProxyEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const k of PROXY_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  return saved;
}

function restoreProxyEnv(saved: Record<string, string | undefined>): void {
  for (const k of PROXY_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

async function startHangingServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(() => {  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('HttpService 超时/取消回归', () => {
  const savedEnv = clearProxyEnv();
  afterEach(() => restoreProxyEnv(savedEnv));

  it('代理请求超时应 reject 而非永久挂起', async () => {
    const hanging = await startHangingServer();
    process.env.HTTP_PROXY = `http://127.0.0.1:${hanging.port}`;
    const httpSvc = new HttpAccess();
    const started = Date.now();
    try {
      await expect(
        httpSvc.execRequest(Object.assign(new ExecRequestInput(), { url: 'http://example.com/test', method: 'GET', timeout_ms: 200 }), new ExecRequestOutput(), new HttpContext()),
      ).rejects.toThrow(/timeout/i);
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      await hanging.close();
    }
  });

  it('代理请求被 abort 时应 reject', async () => {
    const hanging = await startHangingServer();
    process.env.HTTP_PROXY = `http://127.0.0.1:${hanging.port}`;
    const httpSvc = new HttpAccess();
    const controller = new AbortController();
    const pending = httpSvc.execRequest(
      Object.assign(new ExecRequestInput(), { url: 'http://example.com/test', method: 'GET', timeout_ms: 5000, signal: controller.signal }),
      new ExecRequestOutput(),
      new HttpContext(),
    );
    controller.abort();
    try {
      await expect(pending).rejects.toThrow();
    } finally {
      await hanging.close();
    }
  });

  it('直连（本地）超时应 reject', async () => {
    const hanging = await startHangingServer();
    const httpSvc = new HttpAccess();
    const started = Date.now();
    try {
      await expect(
        httpSvc.execRequest(Object.assign(new ExecRequestInput(), { url: `http://127.0.0.1:${hanging.port}/test`, method: 'GET', timeout_ms: 200 }), new ExecRequestOutput(), new HttpContext()),
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      await hanging.close();
    }
  });
});
