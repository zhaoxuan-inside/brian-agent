/**
 * @fileoverview TraceId 源头生成器（trace 治理 · 客户端侧唯一产生点）。
 *
 * traceId 只在请求源头产生一次：前端每次发起交互请求（HTTP / SSE）时生成，
 * 经 `X-Trace-Id` 请求头向下游全链路显式传播；后端只消费、不重复生成。
 */

/** 生成 UUID v4（非安全上下文 crypto.randomUUID 缺失时用 getRandomValues 兜底） */
export function newTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  // RFC 4122 v4 位标记
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

/** 请求头名：前端 → 后端的 traceId 唯一传播通道 */
export const TRACE_ID_HEADER = 'X-Trace-Id'
