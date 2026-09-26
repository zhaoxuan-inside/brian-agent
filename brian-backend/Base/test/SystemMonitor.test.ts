import { describe, it, expect } from 'vitest';
import { SystemMonitorAccess } from '../ToolProvider';
import {
  SystemMonitorContext,
  SoCpuUsageInput, SoCpuUsageOutput,
  SoMemoryUsageInput, SoMemoryUsageOutput,
  SoDiskUsageInput, SoDiskUsageOutput,
  SoResourceInput, SoResourceOutput,
} from '../ToolProvider';
import type { Input } from '../shared/base/Input';
import type { Output } from '../shared/base/Output';

describe('SystemMonitorAccess', () => {
  const monitor = new SystemMonitorAccess('/');

  async function call<I extends Input, O extends Output>(
    method: string,
    IC: new () => I,
    OC: new () => O,
    fields: Partial<I> = {},
  ): Promise<O> {
    const input = Object.assign(new IC(), fields);
    const output = new OC();
    const ok = await (monitor as unknown as Record<string, (i: I, o: O, c: SystemMonitorContext) => Promise<boolean>>)[method](
      input, output, new SystemMonitorContext(),
    );
    expect(ok).toBe(true);
    return output;
  }

  it('should collect cpu/memory/disk as valid percentages', async () => {
    const out = await call('soResource', SoResourceInput, SoResourceOutput);
    const metrics = out.metrics;
    expect(metrics).toHaveProperty('cpu');
    expect(metrics).toHaveProperty('memory');
    expect(metrics).toHaveProperty('disk');
    for (const key of ['cpu', 'memory', 'disk'] as const) {
      const value = metrics[key];
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('should return valid memory percentage', async () => {
    const out = await call('soMemoryUsage', SoMemoryUsageInput, SoMemoryUsageOutput);
    expect(out.percent).toBeGreaterThanOrEqual(0);
    expect(out.percent).toBeLessThanOrEqual(100);
  });

  it('should return valid cpu percentage across multiple samples', async () => {
    for (let i = 0; i < 3; i++) {
      const out = await call('soCpuUsage', SoCpuUsageInput, SoCpuUsageOutput);
      expect(out.percent).toBeGreaterThanOrEqual(0);
      expect(out.percent).toBeLessThanOrEqual(100);
    }
  });

  it('should tolerate missing disk path', async () => {
    const out = await call('soDiskUsage', SoDiskUsageInput, SoDiskUsageOutput, { path: '/definitely/not/exist/path' });
    expect(out.percent).toBe(0);
  });
});
