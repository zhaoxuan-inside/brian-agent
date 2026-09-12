import { describe, it, expect } from 'vitest'
import { formatDuration } from '@/utils/format'

describe('formatDuration（秒级耗时展示）', () => {
  it('空值返回 —', () => {
    expect(formatDuration()).toBe('—')
    expect(formatDuration(0)).toBe('0.00s')
    expect(formatDuration(undefined)).toBe('—')
  })

  it('不足 1 秒保留 2 位小数（秒级单位）', () => {
    expect(formatDuration(500)).toBe('0.50s')
    expect(formatDuration(85)).toBe('0.09s')
    expect(formatDuration(950)).toBe('0.95s')
  })

  it('1 秒以上保留 1 位小数', () => {
    expect(formatDuration(1200)).toBe('1.2s')
    expect(formatDuration(30000)).toBe('30.0s')
    expect(formatDuration(34500)).toBe('34.5s')
  })

  it('超过 60 秒折分为分钟+秒', () => {
    expect(formatDuration(90_000)).toBe('1m30s')
    expect(formatDuration(120_000)).toBe('2min')
    expect(formatDuration(3_600_000)).toBe('60min')
  })
})