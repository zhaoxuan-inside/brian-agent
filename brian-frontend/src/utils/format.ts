/**
 * @fileoverview 格式化公共工具：时间 / 文件大小 / Token 数。
 *
 * 收敛各视图与组件中重复定义的 formatTime / formatFileSize / formatTokens。
 */

/** 补零到两位 */
function pad(x: number): string {
  return String(x).padStart(2, '0')
}

/**
 * 时间戳 → `YYYY-MM-DD HH:mm`。
 *
 * @param ts 毫秒时间戳；0/undefined 返回空串
 */
export function formatTime(ts: number | undefined | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 时间戳 → `YYYY-MM-DD`。
 */
export function formatDate(ts: number | undefined | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 字节数 → 人类可读大小（B / KB / MB / GB）。
 */
export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}

/**
 * Token 数 → 缩写（1.2k / 3.4M），不足 1000 原样输出。
 */
export function formatTokens(n?: number): string {
  if (!n) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/**
 * 耗时（毫秒）→ 秒级展示（0.85s / 3.2s / 1m20s）。
 *
 * 统一为秒为单位：不足 1 秒保留 2 位小数，1 秒以上保留 1 位小数，超过 60 秒折分为分钟+秒。
 */
export function formatDuration(ms?: number): string {
  if (!ms && ms !== 0) return '—'
  const totalSec = ms / 1000
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60)
    const s = Math.round(totalSec % 60)
    return s > 0 ? `${m}m${s}s` : `${m}min`
  }
  if (totalSec >= 1) return `${totalSec.toFixed(1)}s`
  return `${totalSec.toFixed(2)}s`
}
