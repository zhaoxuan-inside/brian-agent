import { describe, it, expect } from 'vitest';
import {
  checkCron,
  generateCron,
  parseCron,
  matchesCron,
  nextRunTime,
} from '../ToolProvider/CronUtils';

describe('CronUtils.checkCron', () => {
  it('校验 6 字段表达式', () => {
    expect(checkCron('0 0 2 * * *').valid).toBe(true);
    expect(checkCron('0 0 2 * * *').normalized).toBe('0 0 2 * * *');
  });

  it('5 字段表达式自动补秒字段', () => {
    const r = checkCron('0 2 * * *');
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe('0 0 2 * * *');
  });

  it('非法表达式返回错误', () => {
    expect(checkCron('').valid).toBe(false);
    expect(checkCron('a b c d e f').valid).toBe(false);
    expect(checkCron('60 0 2 * * *').valid).toBe(false);
    expect(checkCron('0 0 25 * * *').valid).toBe(false);
    expect(checkCron('0 0 2 * 13 *').valid).toBe(false);
  });

  it('支持列表/区间/步长', () => {
    expect(checkCron('0 1,15,30 2 * * *').valid).toBe(true);
    expect(checkCron('0 10-20 2 * * *').valid).toBe(true);
    expect(checkCron('*/5 * * * * *').valid).toBe(true);
  });
});

describe('CronUtils.generateCron / parseCron', () => {
  it('由字段生成表达式', () => {
    const expr = generateCron({ second: '0', minute: '0', hour: '2', day: '*', month: '*', week: '*' });
    expect(expr).toBe('0 0 2 * * *');
  });

  it('非法字段抛错', () => {
    expect(() => generateCron({ second: '99', minute: '0', hour: '2', day: '*', month: '*', week: '*' })).toThrow();
  });

  it('解析表达式为字段', () => {
    const fields = parseCron('0 30 14 1 6 1');
    expect(fields).toEqual({ second: '0', minute: '30', hour: '14', day: '1', month: '6', week: '1' });
  });
});

describe('CronUtils.matchesCron / nextRunTime', () => {
  it('matchesCron 匹配正确', () => {
    const d = new Date(2026, 0, 1, 2, 0, 0, 0);
    expect(matchesCron('0 0 2 * * *', d)).toBe(true);
    expect(matchesCron('0 0 3 * * *', d)).toBe(false);
  });

  it('nextRunTime 计算每日 2 点的下次时间', () => {
    const from = new Date(2026, 0, 1, 0, 0, 0, 0).getTime();
    const next = nextRunTime('0 0 2 * * *', from);
    expect(next).toBe(new Date(2026, 0, 1, 2, 0, 0, 0).getTime());
  });

  it('nextRunTime 跨天计算', () => {
    const from = new Date(2026, 0, 1, 3, 0, 0, 0).getTime();
    const next = nextRunTime('0 0 2 * * *', from);
    expect(next).toBe(new Date(2026, 0, 2, 2, 0, 0, 0).getTime());
  });
});
