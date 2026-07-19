import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { getConfig } from './config.js';

const traceIdStorage = new AsyncLocalStorage<string>();

export function getTraceId(): string | undefined {
  return traceIdStorage.getStore();
}

export function runWithTraceId<T>(traceId: string, fn: () => T): T {
  return traceIdStorage.run(traceId, fn);
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private stream: fs.WriteStream | null = null;
  private currentDate: string = '';
  private logDir: string = '';

  constructor() {
    try {
      const config = getConfig();
      this.logDir = path.resolve(config.logDir);
      this.ensureLogDir();
      this.rotateLog();
    } catch (e) {
      console.warn('Failed to initialize logger:', e);
    }
  }

  private ensureLogDir(): boolean {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      return true;
    } catch (e) {
      console.warn('Failed to create log directory:', e);
      return false;
    }
  }

  private rotateLog(): void {
    try {
      const dirCreated = this.ensureLogDir();
      if (!dirCreated) {
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (today !== this.currentDate) {
        if (this.stream) {
          this.stream.end();
          this.stream = null;
        }
        this.currentDate = today;
        const logPath = path.join(this.logDir, `brian-agent-${today}.log`);
        try {
          this.stream = fs.createWriteStream(logPath, { flags: 'a' });
          this.stream.on('error', (e: Error) => {
            console.warn('Log stream error:', e);
            this.stream = null;
          });
        } catch (e) {
          console.warn('Failed to create log file, logging to console only:', e);
        }
      }
    } catch (e) {
      console.warn('Failed to rotate log:', e);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const config = getConfig();
    const configLevel = config.logLevel;
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[configLevel];
  }

  private format(level: LogLevel, module: string, message: string, data?: unknown): string {
    const ts = new Date().toISOString();
    const traceId = getTraceId() || '-';
    let line = `[${ts}] [${traceId}] [${level.toUpperCase()}] [${module}] ${message}`;
    if (data !== undefined) {
      try {
        line += ` | ${JSON.stringify(data)}`;
      } catch {
        line += ` | [unserializable data]`;
      }
    }
    return line + '\n';
  }

  private write(level: LogLevel, module: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;
    try {
      this.rotateLog();
      const line = this.format(level, module, message, data);
      if (this.stream) {
        this.stream.write(line);
      }
      if (level === 'error') {
        process.stderr.write(line);
      } else {
        process.stdout.write(line);
      }
    } catch (e) {
      console.warn('Failed to write log:', e);
    }
  }

  debug(module: string, message: string, data?: unknown): void {
    this.write('debug', module, message, data);
  }

  info(module: string, message: string, data?: unknown): void {
    this.write('info', module, message, data);
  }

  warn(module: string, message: string, data?: unknown): void {
    this.write('warn', module, message, data);
  }

  error(module: string, message: string, data?: unknown): void {
    this.write('error', module, message, data);
  }

  request(module: string, method: string, url: string, body?: unknown): void {
    this.write('info', module, `→ ${method} ${url}`, body ? { body } : undefined);
  }

  response(module: string, method: string, url: string, status: number, durationMs: number, data?: unknown): void {
    this.write('info', module, `← ${method} ${url} ${status} (${durationMs}ms)`, data ? { data } : undefined);
  }

  agent(module: string, event: string, data?: unknown): void {
    this.write('info', module, `Agent: ${event}`, data);
  }
}

export const logger = new Logger();