

export function dateKeyToRange(dateKey: string): { start: number; end: number } {
  const [y, m, d] = dateKey.split('-').map(Number)
  const start = new Date(y, m, d).getTime()
  const end = new Date(y, m, d + 1).getTime()
  return { start, end }
}

export function compareDateKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return ay * 10000 + am * 100 + ad - (by * 10000 + bm * 100 + bd)
}

export function latestDateKey(cache: Record<string, number>): string | null {
  let latest: string | null = null
  for (const [key, count] of Object.entries(cache)) {
    if (count <= 0) continue
    if (!latest || compareDateKeys(key, latest) > 0) latest = key
  }
  return latest
}

export function hasDataInMonth(cache: Record<string, number>, year: number, month1based: number): boolean {
  const m = month1based - 1
  return Object.entries(cache).some(([key, count]) => {
    const [y, km] = key.split('-').map(Number)
    return count > 0 && y === year && km === m
  })
}

export function toLocalInputValue(ts: number): string {
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
