import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import http from 'http';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import { ComponentDisabledError } from '../../shared/errors';
import type { Logger } from '../../shared/aop/AopProxy';
import {
  CDTContext,
  StartCDTInput,
  StartCDTOutput,
  StopCDTInput,
  StopCDTOutput,
  GetCDTEndpointInput,
  GetCDTEndpointOutput,
  ExecCDPInput,
  ExecCDPOutput,
  IsCDTRunningInput,
  IsCDTRunningOutput,
  CDT_CONFIG_TABLE,
  CDT_CHROME_PATHS,
  CDT_DEFAULT_PORT,
  CDT_DEFAULT_PROFILE_DIR,
  CDT_PROFILE_SNAPSHOT_SOURCE,
  type CDTEnv,
} from '../domain/types';
import { copySnapshotAuthFiles, readSeedMarker, resolveSnapshotSourceDir, writeSeedMarker } from './ProfileSnapshot';

interface CDPResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

const CDP_COMMAND_TIMEOUT_MS = 30_000;

const keyMap: Record<string, string> = {
  Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  Shift: 'ShiftLeft', Control: 'ControlLeft', Alt: 'AltLeft', Meta: 'MetaLeft',
  Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ' ': 'Space',
};

const VK_MAP: Record<string, number> = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Space: 32,
  PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Delete: 46, Insert: 45, CapsLock: 20, NumLock: 144, ScrollLock: 145,
  Shift: 16, Control: 17, Alt: 18, Meta: 91,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117,
  F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
};

function computeModifiers(ctrl: boolean, alt: boolean, shift: boolean, meta: boolean): number {
  return (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
}

function fillKeyParams(
  key: string, params: Record<string, unknown>,
  ctrl = false, alt = false, shift = false, meta = false,
): void {
  params.key = key;
  params.code = keyMap[key] || `Key${key.toUpperCase()}`;
  if (key.length === 1) {
    params.windowsVirtualKeyCode = key.toUpperCase().charCodeAt(0);
  } else if (VK_MAP[key]) {
    params.windowsVirtualKeyCode = VK_MAP[key];
  }
  const mods = computeModifiers(ctrl, alt, shift, meta);
  if (mods) params.modifiers = mods;
}

export class CDTService {
  private enabled = true;
  private readonly config: ConfigService;
  private process: ChildProcess | null = null;
  private pid = 0;
  private port = CDT_DEFAULT_PORT;
  private endpoint = '';

  private lastProfileDir = '';
  private dataDir = '';
  private wsSequentialId = 0;
  private screencastWs: import('ws').WebSocket | null = null;
  private keepAliveWs: import('ws').WebSocket | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private commandWs: import('ws').WebSocket | null = null;
  private commandSeqId = 0;
  private latestFrame = '';
  private latestFrameWidth = 0;
  private latestFrameHeight = 0;
  private spoofedEnv: CDTEnv | null = null;

  constructor(private readonly relationDb: RelationDBAccess, dataDir: string = '', private readonly logger?: Logger) {
    this.config = new ConfigService(relationDb, CDT_CONFIG_TABLE);
    this.dataDir = dataDir;

    process.on('exit', () => {
      const child = this.process;
      if (child && child.pid && child.exitCode === null) {
        try {
          child.kill('SIGKILL');
        } catch {

        }
      }
    });
  }

  async initialize(): Promise<void> {
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  static platform(): string {
    const p = process.platform;
    if (p === 'darwin') return 'macos';
    if (p === 'win32') return 'windows';
    return 'linux';
  }

  static detectChromePath(): string | null {

    const builtin = process.env.BRIAN_CHROME_PATH;
    if (builtin && existsSync(builtin)) return builtin;

    const platform = CDTService.platform();
    const candidates = CDT_CHROME_PATHS[platform] || [];

    for (const candidate of candidates) {
      try {
        if (platform === 'windows') {
          if (existsSync(candidate)) return candidate;
        } else if (platform === 'macos') {
          if (existsSync(candidate)) return candidate;
        } else {
          const result = execSync(`which ${candidate} 2>/dev/null`, {
            encoding: 'utf-8',
            timeout: 3000,
          }).trim();
          if (result) return result;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  async startCDT(_input: StartCDTInput, output: StartCDTOutput, _ctx: CDTContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!this.enabled) throw new ComponentDisabledError('CDTProvider');

    if (this.isProcessAlive()) {
      this.fillRunningEndpoint(output);
      return true;
    }

    this.port = await this.config.getInt('port', CDT_DEFAULT_PORT);

    const chromePath = await this.resolveChromePath(output);
    if (!chromePath) return false;

    const { headless, absProfileDir } = await this.prepareProfileLaunch(metrics);
    const args = await this.buildChromeLaunchArgs(headless, absProfileDir);

    const ep = await this.spawnAndWaitForEndpoint(chromePath, args, absProfileDir, output, metrics);
    if (!ep) return false;

    this.endpoint = ep;

    await this.injectAntiDetection();

    if (!await this.ensureKeepAlive(output, metrics)) return false;

    this.fillRunningEndpoint(output);
    return true;
  }

  private fillRunningEndpoint(output: StartCDTOutput): void {
    output.endpoint = this.endpoint;
    output.port = this.port;
    output.pid = this.pid;
  }

  private async resolveChromePath(output: StartCDTOutput): Promise<string | null> {
    const configured = await this.config.getString('chrome_path', '');
    if (configured) return configured;
    const detected = CDTService.detectChromePath();
    if (!detected) {
      output.error = '未找到 Chrome 可执行文件，请在 cdt_config 中设置 chrome_path';
      return null;
    }
    return detected;
  }

  private async prepareProfileLaunch(metrics?: Metrics): Promise<{ headless: boolean; absProfileDir: string }> {
    const headless = await this.config.getBoolean('headless', false) || !process.env.DISPLAY;
    const profileDir = await this.config.getString('profile_dir', CDT_DEFAULT_PROFILE_DIR) || CDT_DEFAULT_PROFILE_DIR;
    const absProfileDir = join(this.dataDir, profileDir);
    if (!existsSync(absProfileDir)) mkdirSync(absProfileDir, { recursive: true });

    await this.seedProfileFromSnapshot(absProfileDir, metrics);
    return { headless, absProfileDir };
  }

  private async buildChromeLaunchArgs(headless: boolean, absProfileDir: string): Promise<string[]> {
    const windowWidth = await this.config.getInt('window_width', 1920);
    const windowHeight = await this.config.getInt('window_height', 1080);
    const args: string[] = [
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${absProfileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      `--window-size=${windowWidth},${windowHeight}`,
    ];
    if (headless) {
      args.push('--headless=new');
      args.push('--disable-gpu');
      args.push('--disable-blink-features=AutomationControlled');
      args.push('--disable-features=UserAgentReduction');
      args.push('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36');
      args.push('--lang=zh-CN');
      args.push('--accept-lang=zh-CN,zh;q=0.9,en;q=0.8');
    }
    args.push('about:blank');
    return args;
  }

  private async spawnAndWaitForEndpoint(
    chromePath: string,
    args: string[],
    absProfileDir: string,
    output: StartCDTOutput,
    metrics?: Metrics,
  ): Promise<string | null> {
    this.freeDebugPort(metrics);

    if (!this.spawnChromeProcess(chromePath, args, absProfileDir, output)) return null;

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2000);
    });

    const ep = await this.fetchWebSocketEndpoint();
    if (!ep) {
      output.error = `无法获取 CDT WebSocket 端点（端口 ${this.port}），请确认 Chrome 已启动`;
      this.killProcess(metrics);
      return null;
    }

    return ep;
  }

  private spawnChromeProcess(chromePath: string, args: string[], absProfileDir: string, output: StartCDTOutput): boolean {
    try {
      this.process = spawn(chromePath, args, { stdio: 'ignore', detached: false });
      this.lastProfileDir = absProfileDir;
      this.pid = this.process.pid || 0;

      this.process.on('exit', (code, signal) => {
        if (this.pid && this.process && this.process.pid === this.pid) {
          this.handleUnexpectedExit(code, signal);
        }
      });
      this.process.on('error', (err) => {
        this.handleUnexpectedExit(null, null, err.message);
      });
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      output.error = `启动 Chrome 失败: ${msg}`;
      return false;
    }
  }

  private async ensureKeepAlive(output: StartCDTOutput, metrics?: Metrics): Promise<boolean> {
    if (await this.startKeepAlive(metrics)) return true;
    output.error = 'CDT WebSocket 保活连接失败，Chrome 进程可能不稳定';
    this.killProcess(metrics);
    return false;
  }

  async stopCDT(_input: StopCDTInput, _output: StopCDTOutput, _ctx: CDTContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.stopCommandWs();
    this.stopKeepAlive();
    this.stopScreencast();
    this.killProcess(metrics);
    this.process = null;
    this.pid = 0;
    this.endpoint = '';
    return true;
  }

  async soCDTEndpoint(_input: GetCDTEndpointInput, output: GetCDTEndpointOutput, _ctx: CDTContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.endpoint = this.endpoint;
    return true;
  }

  async isCDTRunning(_input: IsCDTRunningInput, output: IsCDTRunningOutput, _ctx: CDTContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const alive = this.isProcessAlive() || (await this.isCDPEndpointAlive());
    output.running = alive;
    output.pid = alive ? this.pid : 0;
    output.port = alive ? this.port : 0;
    return true;
  }

  async execCDP(input: ExecCDPInput, output: ExecCDPOutput, _ctx: CDTContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!this.endpoint) {
      output.error = 'CDT 未启动';
      return false;
    }

    const id = ++this.wsSequentialId;
    const message = JSON.stringify({
      id,
      method: input.method,
      params: input.params || {},
    });

    try {
      const ws = await this.connectWebSocket();

      return new Promise((resolve) => {
        let resolved = false;
        const timer = setTimeout(() => {
          output.error = `CDP 命令超时（${CDP_COMMAND_TIMEOUT_MS}ms）：${input.method}`;
          cleanup();
          resolve(false);
        }, CDP_COMMAND_TIMEOUT_MS);

        const cleanup = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          try {
            ws.close();
          } catch (err) {
            metrics?.warn('CDTService.execCDP 关闭 CDP WebSocket 失败（连接可能已断开）', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        };

        ws.on('message', (data: Buffer) => {
          try {
            const response: CDPResponse = JSON.parse(data.toString());
            if (response.id === id) {
              if (response.error) {
                output.error = `CDP 错误 ${response.error.code}: ${response.error.message}`;
                cleanup();
                resolve(false);
              } else {
                output.result = response.result;
                cleanup();
                resolve(true);
              }
            }
          } catch (err) {
            metrics?.warn('CDTService.execCDP 收到非 JSON CDP 消息，已忽略', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });

        ws.on('error', (err: Error) => {
          output.error = `CDP WebSocket 错误: ${err.message}`;
          cleanup();
          resolve(false);
        });

        ws.on('close', () => {
          if (!resolved) {
            output.error = 'CDP WebSocket 连接已关闭';
            cleanup();
            resolve(false);
          }
        });

        ws.send(message);
      });
    } catch (e: unknown) {
      output.error = `CDP 连接失败: ${e instanceof Error ? e.message : String(e)}`;
      return false;
    }
  }

  async startScreencast(maxWidth = 1920, maxHeight = 1080, quality = 80): Promise<boolean> {
    if (!this.endpoint) return false;
    this.stopScreencast();

    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { WebSocket } = require('ws') as typeof import('ws');
    const ws = new WebSocket(this.endpoint);

    return new Promise((resolve) => {
      ws.once('open', () => {
        ws.send(JSON.stringify({
          id: 0,
          method: 'Page.startScreencast',
          params: { format: 'jpeg', quality, maxWidth, maxHeight, everyNthFrame: 1 },
        }));
      });

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.method === 'Page.screencastFrame') {
            const d = msg.params || {};
            this.latestFrame = `data:image/jpeg;base64,${d.data || ''}`;
            const meta = d.metadata || {};
            this.latestFrameWidth = meta.deviceWidth || 0;
            this.latestFrameHeight = meta.deviceHeight || 0;
            ws.send(JSON.stringify({
              id: 0, method: 'Page.screencastFrameAck', params: { sessionId: d.sessionId || 0 },
            }));
          }
        } catch (err) {
          this.logger?.warn?.('[CDTService] screencast 帧解析失败，已忽略该帧', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

      ws.once('error', () => resolve(false));

      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          this.screencastWs = ws;
          resolve(true);
        }
      }, 500);
    });
  }

  stopScreencast(): void {
    if (this.screencastWs) {
      try { this.screencastWs.close(); } catch {  }
      this.screencastWs = null;
    }
    this.latestFrame = '';
  }

  getLatestFrame(): string {
    return this.latestFrame;
  }

  getLatestFrameDimensions(): { width: number; height: number } {
    return { width: this.latestFrameWidth, height: this.latestFrameHeight };
  }

  private async getCommandWs(): Promise<import('ws').WebSocket | null> {
    if (this.commandWs?.readyState === 1 ) {
      return this.commandWs;
    }
    this.stopCommandWs();
    try {
      this.commandWs = await this.connectWebSocket();
      return this.commandWs;
    } catch {
      return null;
    }
  }

  private stopCommandWs(): void {
    if (this.commandWs) {
      try { this.commandWs.close(); } catch {  }
      this.commandWs = null;
    }
  }

  private sendCmd(ws: import('ws').WebSocket, method: string, params: Record<string, unknown>): void {
    ws.send(JSON.stringify({ id: ++this.commandSeqId, method, params }));
  }

  private lastMouseX = 0;
  private lastMouseY = 0;

  async sendMouseEvent(
    type: string, x: number, y: number, button: string = 'left', clickCount: number = 1,
    deltaX: number = 0, deltaY: number = 0, buttons: number = 0,
    ctrl = false, alt = false, shift = false, meta = false,
  ): Promise<void> {
    const ws = await this.getCommandWs();
    if (!ws) return;
    const btnMask = button === 'right' ? 2 : button === 'middle' ? 4 : 1;
    const btns = buttons > 0 ? buttons
      : type === 'mousePressed' ? btnMask
      : type === 'mouseMoved' ? btnMask
      : type === 'mouseReleased' ? 0
      : 0;
    const mods = computeModifiers(ctrl, alt, shift, meta);
    const params: Record<string, unknown> = {
      type, x, y, button, clickCount, buttons: btns,
      pointerType: 'mouse',
      timestamp: Date.now() / 1000,
    };
    if (type === 'mouseMoved') {
      params.movementX = x - this.lastMouseX;
      params.movementY = y - this.lastMouseY;
    }
    this.lastMouseX = x;
    this.lastMouseY = y;
    if (mods) params.modifiers = mods;
    if (type === 'mouseWheel') { params.deltaX = deltaX; params.deltaY = deltaY; }
    this.sendCmd(ws, 'Input.dispatchMouseEvent', params);
  }

  async sendKeyEvent(
    type: string, text: string = '', key: string = '',
    ctrl = false, alt = false, shift = false, meta = false,
  ): Promise<void> {
    const ws = await this.getCommandWs();
    if (!ws) return;
    const params: Record<string, unknown> = { type };
    if (type === 'char') {
      params.text = text;
    } else {
      fillKeyParams(key || text, params, ctrl, alt, shift, meta);
    }
    this.sendCmd(ws, 'Input.dispatchKeyEvent', params);
  }

  async sendKeyBatch(
    events: Array<{ type: string; text?: string; key?: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }>,
  ): Promise<void> {
    const ws = await this.getCommandWs();
    if (!ws) return;
    for (const ev of events) {
      const params: Record<string, unknown> = { type: ev.type };
      if (ev.type === 'char') {
        params.text = ev.text || '';
      } else {
        fillKeyParams(ev.key || ev.text || '', params, ev.ctrl, ev.alt, ev.shift, ev.meta);
      }
      this.sendCmd(ws, 'Input.dispatchKeyEvent', params);
    }
  }

  async insertText(text: string): Promise<void> {
    if (!text) return;
    const ws = await this.getCommandWs();
    if (!ws) return;
    this.sendCmd(ws, 'Input.insertText', { text });
  }

  async injectAntiDetection(env?: CDTEnv): Promise<void> {
    if (env) this.spoofedEnv = { ...this.spoofedEnv, ...env };
    const e = this.spoofedEnv || {};
    const ws = await this.getCommandWs();
    if (!ws) return;
    const platform = e.platform || 'Win32';
    const userAgent = e.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
    const acceptLang = e.acceptLang || 'zh-CN';
    const acceptLangFull = e.acceptLangFull || 'zh-CN,zh;q=0.9,en;q=0.8';
    const hardwareConcurrency = e.hardwareConcurrency || 8;
    const deviceMemory = e.deviceMemory || 8;
    const languages = e.languages || ['zh-CN', 'zh', 'en'];

    this.sendCmd(ws, 'Emulation.setUserAgentOverride', {
      userAgent,
      acceptLanguage: acceptLang,
      platform,
    });

    this.sendCmd(ws, 'Network.setExtraHTTPHeaders', {
      headers: {
        'Accept-Language': acceptLangFull,
        'sec-ch-ua': '"Chromium";v="150", "Not?A_Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': `"${platform.startsWith('Mac') ? 'macOS' : platform.startsWith('Win') ? 'Windows' : 'Linux'}"`,
      },
    });

    const langArr = JSON.stringify(languages);
    const script = `
      try {
        // webdriver 必须重定义在 Navigator.prototype（原型级）：实例级 defineProperty 会
        // 制造自有属性，被 _.has(navigator,'webdriver') 类检测（sannysoft WebDriver New）识破
        Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
        Object.defineProperty(navigator, 'platform', { get: () => ${JSON.stringify(platform)} });
        Object.defineProperty(navigator, 'languages', { get: () => ${langArr} });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${hardwareConcurrency} });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => ${deviceMemory} });
        Object.defineProperty(Event.prototype, 'isTrusted', { get: () => true });
      } catch (_) {}
      window.chrome = window.chrome || { runtime: {}, loadTimes: () => {}, csi: () => {} };
      const _oq = navigator.permissions?.query;
      if (_oq) {
        navigator.permissions.query = (p) => (
          p && p.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : _oq.call(navigator.permissions, p)
        );
      }
    `;

    this.sendCmd(ws, 'Page.enable', {});
    this.sendCmd(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: script });
    this.sendCmd(ws, 'Runtime.evaluate', { expression: script });
  }

  private async seedProfileFromSnapshot(profileDir: string, metrics?: Metrics): Promise<void> {
    try {
      const raw = await this.config.getString(CDT_PROFILE_SNAPSHOT_SOURCE, '');
      const source = resolveSnapshotSourceDir(raw);
      if (!source) {
        if (raw) {
          metrics?.warn?.('CDTService.seedProfileFromSnapshot 源 profile 目录不存在，跳过播种', { source: raw });
        }
        return;
      }
      if (readSeedMarker(profileDir) === source) return;
      if (!copySnapshotAuthFiles(source, profileDir, metrics)) return;
      writeSeedMarker(profileDir, source);
    } catch (err) {
      metrics?.warn?.('CDTService.seedProfileFromSnapshot 播种失败（不阻塞 Chrome 启动）', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private freeDebugPort(metrics?: Metrics): void {
    try {
      execSync(`fuser -k ${this.port}/tcp 2>/dev/null || true`, { timeout: 3000 });
    } catch (err) {
      metrics?.warn('CDTService.freeDebugPort 释放调试端口失败（fuser 不可用或执行超时）', {
        error: err instanceof Error ? err.message : String(err),
        port: this.port,
      });
    }

    if (this.lastProfileDir) {
      try {
        execSync(`pkill -KILL -f "user-data-dir=${this.lastProfileDir}" 2>/dev/null || true`, { timeout: 3000 });
      } catch (err) {
        metrics?.warn('CDTService.freeDebugPort 按 profile 清理残留 Chrome 失败（pkill 不可用或超时）', {
          error: err instanceof Error ? err.message : String(err),
          profile_dir: this.lastProfileDir,
        });
      }
    }
  }

  private async handleUnexpectedExit(
    code: number | null,
    signal: string | null,
    errorMessage?: string,
  ): Promise<void> {
    const reason = errorMessage
      ? `错误: ${errorMessage}`
      : `退出码=${code}, 信号=${signal}`;
    if (await this.isCDPEndpointAlive()) {
      this.logger?.warn?.(`[CDTService] Chrome 启动进程退出（${reason}），但 CDP 端点仍存活（浏览器 re-exec），保留会话状态`);
      return;
    }
    this.logger?.warn?.(`[CDTService] Chrome 进程非预期退出 (${reason})`);

    this.stopCommandWs();
    this.stopKeepAlive();
    this.stopScreencast();
    this.process = null;
    this.pid = 0;
    this.endpoint = '';
  }

  private async isCDPEndpointAlive(): Promise<boolean> {
    if (!this.port) {
      return false;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/json/version`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async startKeepAlive(metrics?: Metrics): Promise<boolean> {
    this.stopKeepAlive();

    try {

      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { WebSocket } = require('ws') as typeof import('ws');
      const ws = new WebSocket(this.endpoint);

      return new Promise((resolve) => {
        let resolved = false;

        const onOpen = () => {
          if (resolved) return;
          resolved = true;
          ws.off('error', onError);
          this.keepAliveWs = ws;

          this.keepAliveTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({
                  id: 0,
                  method: 'Browser.getVersion',
                  params: {},
                }));
              } catch (err) {
                metrics?.warn('CDTService.startKeepAlive 心跳发送失败（等待下一次心跳）', {
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }, 30000);

          resolve(true);
        };

        const onError = (err: Error) => {
          if (resolved) return;
          resolved = true;
          ws.off('open', onOpen);
          this.logger?.warn?.(`[CDTService] 保活 WebSocket 连接失败: ${err.message}`);
          try { ws.close(); } catch {  }
          resolve(false);
        };

        ws.once('open', onOpen);
        ws.once('error', onError);

        ws.on('close', () => {
          if (this.keepAliveWs === ws) {
            this.stopKeepAlive();
            if (this.isProcessAlive()) {
              this.logger?.warn?.('[CDTService] 保活 WebSocket 意外断开，Chrome 仍运行中，将尝试重连');
              this.startKeepAlive(metrics).catch(() => {});
            }
          }
        });
      });
    } catch (e: unknown) {
      this.logger?.warn?.(`[CDTService] 保活 WebSocket 创建失败: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.keepAliveWs) {
      try { this.keepAliveWs.close(); } catch {  }
      this.keepAliveWs = null;
    }
  }

  private isProcessAlive(): boolean {
    if (!this.process || !this.pid) return false;
    try {
      process.kill(this.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private killProcess(metrics?: Metrics): void {
    if (!this.pid) return;
    try {
      process.kill(this.pid, 'SIGKILL');
    } catch (err) {
      metrics?.warn('CDTService.killProcess 终止 Chrome 进程失败（进程可能已先行退出）', {
        error: err instanceof Error ? err.message : String(err),
        pid: this.pid,
      });
    }
  }

  private async fetchWebSocketEndpoint(): Promise<string | null> {
    const url = `http://127.0.0.1:${this.port}/json`;
    return new Promise((resolve) => {
      const req = http.get(url, { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            const targets: Array<{ type: string; webSocketDebuggerUrl: string }> = JSON.parse(data);
            const page = targets.find(t => t.type === 'page');
            resolve(page?.webSocketDebuggerUrl || null);
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  private connectWebSocket(): Promise<import('ws').WebSocket> {
    return new Promise((resolve, reject) => {
      try {

        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        const { WebSocket } = require('ws') as typeof import('ws');
        const ws = new WebSocket(this.endpoint);

        const timer = setTimeout(() => {
          try { ws.close(); } catch {  }
          reject(new Error(`CDP WebSocket 连接超时（${CDP_COMMAND_TIMEOUT_MS}ms）`));
        }, CDP_COMMAND_TIMEOUT_MS);
        ws.once('open', () => { clearTimeout(timer); resolve(ws); });
        ws.once('error', (err: Error) => { clearTimeout(timer); reject(err); });
      } catch (e) {
        reject(e);
      }
    });
  }
}
