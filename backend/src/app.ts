import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { ModelConfigService } from './services/modelConfig';
import { vectorStore, graphStore } from './storage/database';
import { createConfigRoutes } from './routes/config';
import { createChatRoutes } from './routes/chat';
import { createLibraryRoutes } from './routes/library';
import { createMemoryRoutes } from './routes/memory';
import { createMCPRoutes } from './routes/mcp';
import { logger } from './services/logger';

export const modelConfigService = new ModelConfigService();

// Call history for sliding-window stats
interface CallRecord { tokens: number; latency: number; timestamp: number; }
const STATS_FILE = path.join(config.dataDir || './data', 'call-history.json');
const DAILY_STATS_FILE = path.join(config.dataDir || './data', 'daily-stats.json');
const YEARLY_STATS_DIR = path.join(config.dataDir || './data', 'yearly-stats');
const callHistory: CallRecord[] = [];
let totalTokens = 0;
let totalCalls = 0;
let avgLatency = 0;

// --- Persist call history across restarts ---
function loadCallHistory() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const raw = fs.readFileSync(STATS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      totalTokens = data.totalTokens || 0;
      totalCalls = data.totalCalls || 0;
      avgLatency = data.avgLatency || 0;
      const loaded = (data.callHistory || []) as CallRecord[];
      // Only keep last 32 days
      const cutoff = Date.now() - 32 * 24 * 3600 * 1000;
      for (const r of loaded) {
        if (r.timestamp >= cutoff) callHistory.push(r);
      }
      logger.info('Stats', `Loaded: ${totalTokens} tokens / ${totalCalls} calls / ${callHistory.length} records`);
    }
  } catch { /* ignore corrupt file */ }
}

// --- Daily stats for year-spanning matrix ---
interface DailyStat { tokens: number; calls: number; latencySum: number; latencyCount: number; }
function loadDailyStats(): Record<string, DailyStat> {
  try {
    if (fs.existsSync(DAILY_STATS_FILE)) {
      return JSON.parse(fs.readFileSync(DAILY_STATS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function saveDailyStats(daily: Record<string, DailyStat>) {
  try {
    const dir = path.dirname(DAILY_STATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DAILY_STATS_FILE, JSON.stringify(daily, null, 2), 'utf-8');
    const currentYear = new Date().getFullYear();
    const yearlyFile = path.join(YEARLY_STATS_DIR, `${currentYear}.json`);
    if (fs.existsSync(yearlyFile)) {
      fs.unlinkSync(yearlyFile);
    }
  } catch { /* ignore */ }
}

interface YearlyStat { date: string; tokens: number; calls: number; avgLatency: number; }
function loadYearlyStats(year: number): YearlyStat[] {
  try {
    const yearlyFile = path.join(YEARLY_STATS_DIR, `${year}.json`);
    if (fs.existsSync(yearlyFile)) {
      return JSON.parse(fs.readFileSync(yearlyFile, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
}

function saveYearlyStats(year: number, stats: YearlyStat[]) {
  try {
    if (!fs.existsSync(YEARLY_STATS_DIR)) fs.mkdirSync(YEARLY_STATS_DIR, { recursive: true });
    const yearlyFile = path.join(YEARLY_STATS_DIR, `${year}.json`);
    fs.writeFileSync(yearlyFile, JSON.stringify(stats, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

function buildYearlyStats(year: number): YearlyStat[] {
  const yearlyFile = path.join(YEARLY_STATS_DIR, `${year}.json`);
  if (fs.existsSync(yearlyFile)) {
    return loadYearlyStats(year);
  }
  const daily = loadDailyStats();
  const entries: YearlyStat[] = [];
  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const stat = daily[key] || { tokens: 0, calls: 0, latencySum: 0, latencyCount: 0 };
      entries.push({
        date: key,
        tokens: stat.tokens,
        calls: stat.calls,
        avgLatency: stat.latencyCount > 0 ? Math.round(stat.latencySum / stat.latencyCount) : 0,
      });
    }
  }
  saveYearlyStats(year, entries);
  return entries;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveCallHistory() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const dir = path.dirname(STATS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STATS_FILE, JSON.stringify({ totalTokens, totalCalls, avgLatency, callHistory }, null, 2), 'utf-8');
    } catch { /* ignore */ }
  }, 2000); // debounce 2s — batch rapid calls
}

export function recordModelCall(tokens: number, latency: number) {
  totalTokens += tokens;
  totalCalls += 1;
  avgLatency = Math.round(((avgLatency * (totalCalls - 1)) + latency) / totalCalls);
  callHistory.push({ tokens, latency, timestamp: Date.now() });
  // Prune: keep only last 32 days
  const cutoff = Date.now() - 32 * 24 * 3600 * 1000;
  while (callHistory.length > 0 && callHistory[0].timestamp < cutoff) {
    callHistory.shift();
  }
  // Update daily aggregate (local date)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const daily = loadDailyStats();
  if (!daily[today]) daily[today] = { tokens: 0, calls: 0, latencySum: 0, latencyCount: 0 };
  daily[today].tokens += tokens;
  daily[today].calls += 1;
  daily[today].latencySum += latency;
  daily[today].latencyCount += 1;
  saveDailyStats(daily);
  saveCallHistory();
}

function aggregateWindow(windowMs: number) {
  const cutoff = Date.now() - windowMs;
  const records = callHistory.filter(r => r.timestamp >= cutoff);

  const totalWindowTokens = records.reduce((s, r) => s + r.tokens, 0);
  const totalWindowCalls = records.length;
  const avgWindowLatency = totalWindowCalls > 0
    ? Math.round(records.reduce((s, r) => s + r.latency, 0) / totalWindowCalls)
    : 0;

  // Hourly granularity for 24h (today) window
  if (windowMs <= 24 * 3600 * 1000) {
    const hourlyBuckets: Record<string, { tokens: number; calls: number }> = {};
    for (let h = 0; h < 24; h++) {
      const key = `${String(h).padStart(2, '0')}:00`;
      hourlyBuckets[key] = { tokens: 0, calls: 0 };
    }
    for (const r of records) {
      const h = new Date(r.timestamp).getHours();
      const key = `${String(h).padStart(2, '0')}:00`;
      if (hourlyBuckets[key]) {
        hourlyBuckets[key].tokens += r.tokens;
        hourlyBuckets[key].calls += 1;
      }
    }
    const hourly = Object.entries(hourlyBuckets).map(([h, d]) => ({ hour: h, tokens: d.tokens, calls: d.calls }));
    return { totalTokens: totalWindowTokens, totalCalls: totalWindowCalls, avgLatency: avgWindowLatency, hourly, granularity: 'hourly' };
  }

  // Daily granularity for 7d / 31d
  const days = Math.ceil(windowMs / (24 * 3600 * 1000));
  const dailyBuckets: Record<string, { tokens: number; calls: number; latencySum: number; latencyCount: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    dailyBuckets[key] = { tokens: 0, calls: 0, latencySum: 0, latencyCount: 0 };
  }

  for (const r of records) {
    const d = new Date(r.timestamp);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (dailyBuckets[key]) {
      dailyBuckets[key].tokens += r.tokens;
      dailyBuckets[key].calls += 1;
      dailyBuckets[key].latencySum += r.latency;
      dailyBuckets[key].latencyCount += 1;
    }
  }

  const daily = Object.entries(dailyBuckets)
    .reverse()
    .map(([date, data]) => ({
      date,
      tokens: data.tokens,
      calls: data.calls,
      avgLatency: data.latencyCount > 0 ? Math.round(data.latencySum / data.latencyCount) : 0,
    }));

  return { totalTokens: totalWindowTokens, totalCalls: totalWindowCalls, avgLatency: avgWindowLatency, daily, granularity: 'daily' };
}

function buildTokenMatrix(year?: number): { entries: YearlyStat[]; year: number } {
  const y = year || new Date().getFullYear();
  const entries = buildYearlyStats(y);
  return { entries, year: y };
}

function getAvailableYears(): number[] {
  const daily = loadDailyStats();
  const years = new Set<number>();
  for (const date of Object.keys(daily)) {
    years.add(parseInt(date.slice(0, 4)));
  }
  years.add(new Date().getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}

function getSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return {
    cpu: Math.round(os.loadavg()[0] * 100) / 100,
    memory: {
      total: Math.round(totalMem / (1024 * 1024)),
      used: Math.round(usedMem / (1024 * 1024)),
      percentage: Math.round((usedMem / totalMem) * 100),
    },
    uptime: Math.floor(process.uptime()),
    processCount: 1,
  };
}

export function createApp(): express.Application {
  // Restore persisted call history from disk
  loadCallHistory();

  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req, _res, next) => {
    logger.request('HTTP', req.method, req.url, req.body && Object.keys(req.body).length ? { size: JSON.stringify(req.body).length } : undefined);
    const start = Date.now();
    const origEnd = _res.end.bind(_res);
    _res.end = function (...args: unknown[]) {
      logger.response('HTTP', req.method, req.url, _res.statusCode, Date.now() - start);
      return origEnd(...args as Parameters<typeof _res.end>);
    };
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Model config API
  app.use('/api/config', createConfigRoutes(modelConfigService));

  // Chat API
  app.use('/api/chat', createChatRoutes());

  // Library API
  app.use('/api/library', createLibraryRoutes());

  // Memory API
  app.use('/api/memory', createMemoryRoutes());

  // MCP API
  app.use('/api/mcp', createMCPRoutes());

  // Stats endpoint — supports ?window=today|7d|31d & ?tokenYear=YYYY & ?latencyYear=YYYY
  app.get('/api/stats', (req, res) => {
    const windowParam = req.query.window as string;
    const tokenYearParam = req.query.tokenYear ? parseInt(req.query.tokenYear as string) : undefined;
    const latencyYearParam = req.query.latencyYear ? parseInt(req.query.latencyYear as string) : undefined;
    let windowMs = 24 * 3600 * 1000; // default: today
    if (windowParam === '7d') windowMs = 7 * 24 * 3600 * 1000;
    else if (windowParam === '31d') windowMs = 31 * 24 * 3600 * 1000;

    // Pre-compute all three windows for donut charts
    const todayWindow = aggregateWindow(24 * 3600 * 1000);
    const weekWindow = aggregateWindow(7 * 24 * 3600 * 1000);
    const monthWindow = aggregateWindow(31 * 24 * 3600 * 1000);

    // Compute rate limit usage
    const cfg = modelConfigService.getConfig();
    const limits = cfg.rateLimits || { daily: 100000, weekly: 500000, monthly: 2000000 };
    const usedDaily = todayWindow.totalTokens;
    const usedWeekly = weekWindow.totalTokens;
    const usedMonthly = monthWindow.totalTokens;

    const requestedWindow = windowParam === '7d' ? weekWindow : windowParam === '31d' ? monthWindow : todayWindow;

    const tokenMatrixData = buildTokenMatrix(tokenYearParam);
    const latencyMatrixData = buildTokenMatrix(latencyYearParam);

    res.json({
      system: getSystemStats(),
      models: {
        totalTokens,
        totalCalls,
        avgLatency,
        activeSessions: 1,
        cacheHitRate: 0,
      },
      window: requestedWindow,
      tokenMatrix: tokenMatrixData.entries,
      tokenMatrixYear: tokenMatrixData.year,
      latencyMatrix: latencyMatrixData.entries,
      latencyMatrixYear: latencyMatrixData.year,
      availableYears: getAvailableYears(),
      windows: {
        today: { totalTokens: todayWindow.totalTokens, totalCalls: todayWindow.totalCalls, avgLatency: todayWindow.avgLatency },
        '7d': { totalTokens: weekWindow.totalTokens, totalCalls: weekWindow.totalCalls, avgLatency: weekWindow.avgLatency },
        '31d': { totalTokens: monthWindow.totalTokens, totalCalls: monthWindow.totalCalls, avgLatency: monthWindow.avgLatency },
      },
      rateLimits: {
        daily: limits.daily,
        weekly: limits.weekly,
        monthly: limits.monthly,
        usedDaily,
        usedWeekly,
        usedMonthly,
      },
      storage: {
        sqlite: true,
        vectorDb: vectorStore.isActive,
        graphDb: graphStore.isActive,
      },
    });
  });

  return app;
}
