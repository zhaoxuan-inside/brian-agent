import fs from 'node:fs';
import path from 'node:path';

/**
 * dev-server 文件日志(独立模块,供 dev-server 与 server/ 下各模块共用)。
 * 从 dev-server.ts 平移而来,行为不变。
 */
const DATA_DIR = process.env.BRIAN_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const LOG_DIR = process.env.BRIAN_LOG_DIR || path.join(DATA_DIR, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function formatLogDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function writeFileLog(level: string, message: string, meta?: unknown): void {
  try {
    const ts = new Date().toISOString();
    let suffix = '';
    if (meta !== undefined && meta !== null) {
      suffix = ' ' + (typeof meta === 'string' ? meta : JSON.stringify(meta));
    }
    const file = path.join(LOG_DIR, `dev-server-${formatLogDate(new Date())}.log`);
    fs.appendFileSync(file, `[${ts}] [${level}] ${message}${suffix}\n`);
  } catch {  }
}

export const fileLogger = {
  debug: (message: string, meta?: unknown) => writeFileLog('DEBUG', message, meta),
  info: (message: string, meta?: unknown) => writeFileLog('INFO', message, meta),
  warn: (message: string, meta?: unknown) => writeFileLog('WARN', message, meta),
  error: (message: string, meta?: unknown) => writeFileLog('ERROR', message, meta),
};
