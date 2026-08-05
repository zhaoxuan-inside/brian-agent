/**
 * @fileoverview CDTProvider 应用服务层（Chrome DevTools Protocol）。
 *
 * 管理 Chrome 进程的启动/停止，通过 CDP WebSocket 与浏览器通信。
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import http from 'http';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
} from '../../shared/errors';
import { IdGenerator } from '../../shared/id/IdGenerator';
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
  CDT_DEFAULT_CONFIGS,
  CDT_CHROME_PATHS,
  CDT_DEFAULT_PORT,
  CDT_DEFAULT_PROFILE_DIR,
  type CDTEnv,
} from '../domain/types';

/** CDP WebSocket 响应类型 */
interface CDPResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/** 常用键名到 CDP code 的映射 */
const keyMap: Record<string, string> = {
  Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  Shift: 'ShiftLeft', Control: 'ControlLeft', Alt: 'AltLeft', Meta: 'MetaLeft',
  Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ' ': 'Space',
};

/** 非字符键的 Windows Virtual-Key Code */
const VK_MAP: Record<string, number> = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Space: 32,
  PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Delete: 46, Insert: 45, CapsLock: 20, NumLock: 144, ScrollLock: 145,
  Shift: 16, Control: 17, Alt: 18, Meta: 91,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117,
  F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
};

/** CDP modifiers 位掩码: 1=Alt, 2=Ctrl, 4=Meta, 8=Shift */
function computeModifiers(ctrl: boolean, alt: boolean, shift: boolean, meta: boolean): number {
  return (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
}

/** 补全非字符键的 code / key / windowsVirtualKeyCode / modifiers */
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

  constructor(private readonly relationDb: RelationDBAccess, dataDir: string = '') {
    this.config = new ConfigService(relationDb, CDT_CONFIG_TABLE);
    this.dataDir = dataDir;
  }

  async initialize(): Promise<void> {
    await this.config.initDefaults([...CDT_DEFAULT_CONFIGS]);
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  // ============================================================
  // 操作系统检测
  // ============================================================

  /** 获取当前操作系统类型 */
  static platform(): string {
    const p = process.platform;
    if (p === 'darwin') return 'macos';
    if (p === 'win32') return 'windows';
    return 'linux';
  }

  /** 自动检测 Chrome 可执行文件路径 */
  static detectChromePath(): string | null {
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

  // ============================================================
  // 进程生命周期
  // ============================================================

  async startCDT(
    _input: StartCDTInput,
    _ctx: CDTContext,
    output: StartCDTOutput,
  ): Promise<boolean> {
    if (!this.enabled) throw new ComponentDisabledError('CDTProvider');

    if (this.isProcessAlive()) {
      output.endpoint = this.endpoint;
      output.port = this.port;
      output.pid = this.pid;
      return true;
    }

    this.port = await this.config.getInt('port', CDT_DEFAULT_PORT);

    let chromePath = await this.config.getString('chrome_path', '');
    if (!chromePath) {
      const detected = CDTService.detectChromePath();
      if (!detected) {
        output.error = '未找到 Chrome 可执行文件，请在 cdt_config 中设置 chrome_path';
        return false;
      }
      chromePath = detected;
    }

    const headless = await this.config.getBoolean('headless', false) || !process.env.DISPLAY;
    const profileDir = await this.config.getString('profile_dir', CDT_DEFAULT_PROFILE_DIR) || CDT_DEFAULT_PROFILE_DIR;
    const absProfileDir = join(this.dataDir, profileDir);
    if (!existsSync(absProfileDir)) mkdirSync(absProfileDir, { recursive: true });

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

    this.freeDebugPort();

    try {
      this.process = spawn(chromePath, args, {
        stdio: 'ignore',
        detached: false,
      });

      this.pid = this.process.pid || 0;

      this.process.on('exit', (code, signal) => {
        if (this.pid && this.process && this.process.pid === this.pid) {
          this.handleUnexpectedExit(code, signal);
        }
      });
      this.process.on('error', (err) => {
        this.handleUnexpectedExit(null, null, err.message);
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      output.error = `启动 Chrome 失败: ${msg}`;
      return false;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2000);
    });

    const ep = await this.fetchWebSocketEndpoint();
    if (!ep) {
      output.error = `无法获取 CDT WebSocket 端点（端口 ${this.port}），请确认 Chrome 已启动`;
      this.killProcess();
      return false;
    }

    this.endpoint = ep;

    await this.injectAntiDetection();

    if (!await this.startKeepAlive()) {
      output.error = 'CDT WebSocket 保活连接失败，Chrome 进程可能不稳定';
      this.killProcess();
      return false;
    }

    output.endpoint = ep;
    output.port = this.port;
    output.pid = this.pid;
    return true;
  }

  async stopCDT(
    _input: StopCDTInput,
    _ctx: CDTContext,
    output: StopCDTOutput,
  ): Promise<boolean> {
    this.stopCommandWs();
    this.stopKeepAlive();
    this.stopScreencast();
    this.killProcess();
    this.process = null;
    this.pid = 0;
    this.endpoint = '';
    return true;
  }

  async getCDTEndpoint(
    _input: GetCDTEndpointInput,
    _ctx: CDTContext,
    output: GetCDTEndpointOutput,
  ): Promise<boolean> {
    output.endpoint = this.endpoint;
    return true;
  }

  async isCDTRunning(
    _input: IsCDTRunningInput,
    _ctx: CDTContext,
    output: IsCDTRunningOutput,
  ): Promise<boolean> {
    const alive = this.isProcessAlive();
    output.running = alive;
    output.pid = alive ? this.pid : 0;
    output.port = alive ? this.port : 0;
    return true;
  }

  // ============================================================
  // CDP 通信
  // ============================================================

  async execCDP(
    input: ExecCDPInput,
    _ctx: CDTContext,
    output: ExecCDPOutput,
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

        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            try { ws.close(); } catch { /* ignore */ }
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
          } catch {
            /* ignore non-JSON messages */
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

  // ============================================================
  // CDP Screencast（实时帧流）
  // ============================================================

  async startScreencast(maxWidth = 1920, maxHeight = 1080, quality = 80): Promise<boolean> {
    if (!this.endpoint) return false;
    this.stopScreencast();

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
        } catch { /* ignore */ }
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
      try { this.screencastWs.close(); } catch { /* ignore */ }
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

  // ============================================================
  // 持久命令 WebSocket（复用连接，避免每次 key/mouse 建连）
  // ============================================================

  private async getCommandWs(): Promise<import('ws').WebSocket | null> {
    if (this.commandWs?.readyState === 1 /* WebSocket.OPEN */) {
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
      try { this.commandWs.close(); } catch { /* ignore */ }
      this.commandWs = null;
    }
  }

  private sendCmd(ws: import('ws').WebSocket, method: string, params: Record<string, unknown>): void {
    ws.send(JSON.stringify({ id: ++this.commandSeqId, method, params }));
  }

  // ============================================================
  // CDP 输入转发（Remote Browser 交互）— 复用 commandWs
  // ============================================================

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

  /** 批量发送按键事件（有序，共享同一 WebSocket） */
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

  /** 在光标处插入文本（支持 password 字段，一次发送全部内容） */
  async insertText(text: string): Promise<void> {
    if (!text) return;
    const ws = await this.getCommandWs();
    if (!ws) return;
    this.sendCmd(ws, 'Input.insertText', { text });
  }

  /** 注入反检测脚本 + HTTP 头 + UA/platform 伪装 */
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

    // Emulation API：覆盖 UA + Accept-Language + platform
    this.sendCmd(ws, 'Emulation.setUserAgentOverride', {
      userAgent,
      acceptLanguage: acceptLang,
      platform,
    });

    // Network 层 HTTP 头
    this.sendCmd(ws, 'Network.setExtraHTTPHeaders', {
      headers: {
        'Accept-Language': acceptLangFull,
        'sec-ch-ua': '"Chromium";v="150", "Not?A_Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': `"${platform.startsWith('Mac') ? 'macOS' : platform.startsWith('Win') ? 'Windows' : 'Linux'}"`,
      },
    });

    // JS 层指纹覆盖
    const langArr = JSON.stringify(languages);
    const script = `
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
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
    this.sendCmd(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: script });
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /** 启动前释放调试端口（清理上一次 session 未正确关闭的残留 Chrome 进程） */
  private freeDebugPort(): void {
    try {
      execSync(`fuser -k ${this.port}/tcp 2>/dev/null || true`, { timeout: 3000 });
    } catch {
      /* fuser 不可用或端口未被占用 */
    }
  }

  /**
   * 处理 Chrome 进程非预期退出。
   * 当子进程 exit 事件触发时（非通过 stopCDT 主动停止），重置状态。
   */
  private handleUnexpectedExit(
    code: number | null,
    signal: string | null,
    errorMessage?: string,
  ): void {
    const reason = errorMessage
      ? `错误: ${errorMessage}`
      : `退出码=${code}, 信号=${signal}`;
    console.warn(`[CDTService] Chrome 进程非预期退出 (${reason})`);

    this.stopCommandWs();
    this.stopKeepAlive();
    this.stopScreencast();
    this.process = null;
    this.pid = 0;
    this.endpoint = '';
  }

  /**
   * 建立持久 CDP WebSocket 连接，防止 headless Chrome 因无客户端而自动退出。
   * 同时启动心跳定时器，每 30 秒发送一次 Browser.getVersion 探活。
   */
  private async startKeepAlive(): Promise<boolean> {
    this.stopKeepAlive();

    try {
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
              } catch { /* 心跳失败，等待下一次 */ }
            }
          }, 30000);

          resolve(true);
        };

        const onError = (err: Error) => {
          if (resolved) return;
          resolved = true;
          ws.off('open', onOpen);
          console.warn(`[CDTService] 保活 WebSocket 连接失败: ${err.message}`);
          try { ws.close(); } catch { /* ignore */ }
          resolve(false);
        };

        ws.once('open', onOpen);
        ws.once('error', onError);

        ws.on('close', () => {
          if (this.keepAliveWs === ws) {
            this.stopKeepAlive();
            if (this.isProcessAlive()) {
              console.warn('[CDTService] 保活 WebSocket 意外断开，Chrome 仍运行中，将尝试重连');
              this.startKeepAlive().catch(() => {});
            }
          }
        });
      });
    } catch (e: unknown) {
      console.warn(`[CDTService] 保活 WebSocket 创建失败: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  /** 停止保活连接和心跳定时器 */
  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.keepAliveWs) {
      try { this.keepAliveWs.close(); } catch { /* ignore */ }
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

  private killProcess(): void {
    if (!this.pid) return;
    try {
      process.kill(this.pid, 'SIGKILL');
    } catch {
      /* process already dead */
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
        const { WebSocket } = require('ws') as typeof import('ws');
        const ws = new WebSocket(this.endpoint);
        ws.once('open', () => resolve(ws));
        ws.once('error', reject);
      } catch (e) {
        reject(e);
      }
    });
  }
}
