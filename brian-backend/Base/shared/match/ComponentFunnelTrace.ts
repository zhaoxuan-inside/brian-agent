import { BusinessEvent } from '../base/BusinessEvent';
import type { Report } from '../base/Report';

export type FunnelComponentKind = 'agent' | 'llm' | 'prompt' | 'soul' | 'skill' | 'mcp';

export type FunnelMechanismKind = 'bm25' | 'vector' | 'llm' | 'direct';

export interface FunnelCandidateItem {
  id: string;
  name: string;
  score: number;
  reason?: string;
}

export interface FunnelMechanismDetail {
  mechanism: FunnelMechanismKind;
  label: string;
  adopted: boolean;
  candidates: FunnelCandidateItem[];
  prompt?: string;
  output?: string;
}

export interface ComponentFunnelEventPayload {
  component: FunnelComponentKind;
  agent_id: string;
  detail: string;
  mechanisms: FunnelMechanismDetail[];
}

const FUNNEL_TEXT_MAX_CHARS = 6000;

export const FUNNEL_MECHANISM_LABELS: Record<FunnelMechanismKind, string> = {
  bm25: 'BM25 检索',
  vector: '向量匹配',
  llm: '大模型判定',
  direct: '直接事实命中',
};

/** 裁剪超长文本(LLM 评估 prompt/output),保护 stream_event 负载 */
export function clipFunnelText(text: string | undefined): string | undefined {
  const raw = String(text ?? '').trim();
  if (!raw) return undefined;
  return raw.length > FUNNEL_TEXT_MAX_CHARS ? `${raw.slice(0, FUNNEL_TEXT_MAX_CHARS)}…(已截断)` : raw;
}

/** 漏斗候选拒因标注:负向范例硬阻断时生成带证据数值的可读拒因,供观测 UI 与 Trace 展示 */
export function funnelNegativeReason(entry: { rejected?: boolean; negativeSim?: number; negativeHit?: number }): string | undefined {
  if (!entry.rejected) return undefined;
  if (typeof entry.negativeSim === 'number') return `负面范例硬阻断(相似度 ${entry.negativeSim.toFixed(2)})`;
  if (typeof entry.negativeHit === 'number') return `负面范例命中(词项覆盖 ${(entry.negativeHit * 100).toFixed(0)}%)`;
  return '负面范例硬阻断';
}

export interface ComponentFunnelTrace {
  readonly component: FunnelComponentKind;
  readonly agent_id: string;
  readonly mechanisms: FunnelMechanismDetail[];
  addMechanism(detail: FunnelMechanismDetail): void;
  addDirect(label: string, candidates: FunnelCandidateItem[]): void;
  markAdopted(mechanism: FunnelMechanismKind): void;
}

/** 创建组件漏斗明细采集器:匹配过程逐机制登记,终态一次性上报 */
export function createComponentFunnelTrace(component: FunnelComponentKind, agentId: string): ComponentFunnelTrace {
  const mechanisms: FunnelMechanismDetail[] = [];
  return {
    component,
    agent_id: agentId,
    mechanisms,
    addMechanism(detail) {
      mechanisms.push(detail);
    },
    addDirect(label, candidates) {
      mechanisms.push({ mechanism: 'direct', label, adopted: true, candidates });
    },
    markAdopted(mechanism) {
      const last = [...mechanisms].reverse().find((m) => m.mechanism === mechanism);
      if (last) last.adopted = true;
    },
  };
}

/** 匹配终态上报组件漏斗明细事件(report 缺省时静默跳过) */
export function pushComponentFunnel(report: Report | undefined, trace: ComponentFunnelTrace, detail: string): void {
  if (!report) return;
  const payload: ComponentFunnelEventPayload = {
    component: trace.component,
    agent_id: trace.agent_id,
    detail,
    mechanisms: trace.mechanisms,
  };
  report.emit(BusinessEvent.ComponentFunnel, payload);
}

export interface FunnelSelectedComponents {
  agent: string;
  llm: string;
  prompt: string;
  soul: string;
  skills: string[];
  mcps: string[];
}

const FUNNEL_COMPONENT_KEYS: FunnelComponentKind[] = ['agent', 'llm', 'prompt', 'soul', 'skill', 'mcp'];

const FUNNEL_MECHANISM_KINDS: FunnelMechanismKind[] = ['bm25', 'vector', 'llm', 'direct'];

/**
 * 组件选举明细聚合(纯计算):从 component.funnel 事件流按组件提取最近一次真实选举明细;
 * 无事件组件(命中既有 Agent 复用场景)从 selectedComponents 合成「绑定事实源」direct 条目。
 */
export function aggregateComponentFunnelMatches(
  streamEvents: Array<{ event_type: string; payload: Record<string, unknown> }>,
  selectedComponents: FunnelSelectedComponents,
): Record<FunnelComponentKind, FunnelMechanismDetail[]> {
  const latestByComponent = new Map<string, Record<string, unknown>>();
  for (const ev of streamEvents) {
    if (ev.event_type !== BusinessEvent.ComponentFunnel) continue;
    latestByComponent.set(String(ev.payload.component ?? ''), ev.payload);
  }
  const result = {} as Record<FunnelComponentKind, FunnelMechanismDetail[]>;
  for (const comp of FUNNEL_COMPONENT_KEYS) {
    const event = latestByComponent.get(comp);
    result[comp] = event ? soFunnelMechanisms(event) : [buildBoundMechanism(comp, selectedComponents)];
  }
  return result;
}

function soFunnelMechanisms(payload: Record<string, unknown>): FunnelMechanismDetail[] {
  const raw = Array.isArray(payload.mechanisms) ? payload.mechanisms : [];
  return raw
    .filter((m): m is Record<string, unknown> => m != null && typeof m === 'object')
    .map((m) => ({
      mechanism: FUNNEL_MECHANISM_KINDS.includes(String(m.mechanism) as FunnelMechanismKind)
        ? String(m.mechanism) as FunnelMechanismKind : 'direct',
      label: String(m.label ?? '选举'),
      adopted: m.adopted === true,
      candidates: soFunnelCandidates(m.candidates),
      prompt: typeof m.prompt === 'string' ? m.prompt : undefined,
      output: typeof m.output === 'string' ? m.output : undefined,
    }));
}

function soFunnelCandidates(raw: unknown): FunnelCandidateItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object')
    .map((c) => ({
      id: String(c.id ?? ''),
      name: String(c.name ?? c.id ?? ''),
      score: Number.isFinite(Number(c.score)) ? Number(c.score) : 0,
      reason: typeof c.reason === 'string' && c.reason ? c.reason : undefined,
    }))
    .filter((c) => c.id);
}

function buildBoundMechanism(comp: FunnelComponentKind, selected: FunnelSelectedComponents): FunnelMechanismDetail {
  const candidates: FunnelCandidateItem[] = comp === 'skill'
    ? selected.skills.map((s) => ({ id: s, name: s, score: 100 }))
    : comp === 'mcp'
      ? selected.mcps.map((m) => ({ id: m, name: m, score: 100 }))
      : [{ id: String(selected[comp] ?? ''), name: String(selected[comp] ?? ''), score: 100 }];
  return {
    mechanism: 'direct',
    label: '绑定事实源（命中既有 Agent，复用绑定组件）',
    adopted: true,
    candidates: candidates.filter((c) => c.id),
  };
}
