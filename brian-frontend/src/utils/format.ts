function pad(x: number): string {
  return String(x).padStart(2, '0')
}

export function formatTime(ts: number | undefined | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDate(ts: number | undefined | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}

export function formatTokens(n?: number): string {
  if (!n) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

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

export function formatDateTime(ts: number | undefined | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${formatDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 时间线步骤时间戳：HH:mm:ss.SSS */
export function formatClock(ts: number | undefined | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

/** 时间线步骤耗时：毫秒级直显（如 100ms），秒级以上交给 formatDuration */
export function formatStepDuration(ms?: number): string {
  if (ms === undefined || ms === null) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return formatDuration(ms)
}
