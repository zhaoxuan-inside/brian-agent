import fs from 'fs';
import path from 'path';

const LOG_DIR = './data/logs';

class Logger {
  private stream: fs.WriteStream | null = null;
  private currentDate: string = '';

  constructor() {
    this.ensureLogDir();
    this.rotateLog();
  }

  private ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  private rotateLog() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.currentDate) {
      if (this.stream) this.stream.end();
      this.currentDate = today;
      const logPath = path.join(LOG_DIR, `brian-agent-${today}.log`);
      this.stream = fs.createWriteStream(logPath, { flags: 'a' });
    }
  }

  private format(level: string, module: string, message: string, data?: any): string {
    const ts = new Date().toISOString();
    let line = `[${ts}] [${level}] [${module}] ${message}`;
    if (data) line += ` | ${JSON.stringify(data, null, 0)}`;
    return line + '\n';
  }

  private write(level: string, module: string, message: string, data?: any) {
    this.rotateLog();
    const line = this.format(level, module, message, data);
    if (this.stream) this.stream.write(line);
    // Also console.log for development
    console.log(line.trim());
  }

  info(module: string, message: string, data?: any) { this.write('INFO', module, message, data); }
  warn(module: string, message: string, data?: any) { this.write('WARN', module, message, data); }
  error(module: string, message: string, data?: any) { this.write('ERROR', module, message, data); }
  request(module: string, method: string, url: string, body?: any) {
    this.write('REQ', module, `${method} ${url}`, body ? { body } : undefined);
  }
  response(module: string, method: string, url: string, status: number, durationMs: number, data?: any) {
    this.write('RES', module, `${method} ${url} → ${status} (${durationMs}ms)`, data ? { data } : undefined);
  }
  agent(module: string, event: string, data?: any) {
    this.write('AGENT', module, event, data);
  }
}

export const logger = new Logger();
