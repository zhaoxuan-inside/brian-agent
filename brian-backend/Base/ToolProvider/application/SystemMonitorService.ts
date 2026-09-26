import os from 'node:os';
import fs from 'node:fs';

import type { SystemResourceMetrics } from '../domain/SystemMonitorTypes';

interface CpuSample {
  
  usage: NodeJS.CpuUsage;
  
  time: bigint;
}

export class SystemMonitorService {
  
  private readonly diskPath: string;

  
  private lastCpuSample: CpuSample | null = null;

  

  constructor(diskPath = '/') {
    this.diskPath = diskPath;
  }

  

  getCpuUsagePercent(): number {
    const cpus = Math.max(1, os.cpus().length);
    const usage = process.cpuUsage();
    const now = process.hrtime.bigint();

    if (this.lastCpuSample) {
      const userDelta = usage.user - this.lastCpuSample.usage.user;
      const systemDelta = usage.system - this.lastCpuSample.usage.system;
      
      const elapsedUs = Number(now - this.lastCpuSample.time) / 1000;
      const totalUs = elapsedUs * cpus;
      this.lastCpuSample = { usage, time: now };
      if (totalUs <= 0) return 0;
      return this.clampPercent(((userDelta + systemDelta) / totalUs) * 100);
    }

    this.lastCpuSample = { usage, time: now };
    
    return this.clampPercent((os.loadavg()[0] / cpus) * 100);
  }

  
  getMemoryUsagePercent(): number {
    const total = os.totalmem();
    if (total <= 0) return 0;
    return this.clampPercent(((total - os.freemem()) / total) * 100);
  }

  

  getDiskUsagePercent(path?: string): number {
    try {
      const target = path ?? this.diskPath;
      const stat = fs.statfsSync(target);
      if (stat.blocks <= 0) return 0;
      const used = stat.blocks - stat.bfree;
      return this.clampPercent((used / stat.blocks) * 100);
    } catch {
      return 0;
    }
  }

  
  collect(path?: string): SystemResourceMetrics {
    return {
      cpu: this.getCpuUsagePercent(),
      memory: this.getMemoryUsagePercent(),
      disk: this.getDiskUsagePercent(path),
    };
  }

  
  private clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
  }
}
