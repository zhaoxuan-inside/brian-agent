// 共享的取消注册表：exchangeId → AbortController
const cancelRegistry = new Map<string, AbortController>();

export function getCancelRegistry() { return cancelRegistry; }
