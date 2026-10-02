/**
 * 统一选举引擎（R8 · chg-058，模板方法）
 * 六组件复用同一选举流程：①复用判定 → ②并行信号提取（组件钩子内部 Promise.all）
 * → ③分级候选集阶梯游走（唯一合法候选直采）→ ④阶梯耗尽终端动作（创建新的/默认）。
 * 组件只实现 ComponentElectionAdapter；Trace 逐级登记供思考弹窗展示。
 */
import type { FunnelCandidateItem } from '../match/ComponentFunnelTrace';
import type { ComponentElectionAdapter, ElectionCandidate, ElectionTierExpr } from './ElectionTypes';
import { REUSE_TIER, SINGLE_TIER } from './ElectionTypes';
import { pickFromTier } from './ElectionScoring';

function toTraceItems<T>(picked: ElectionCandidate<T>[]): FunnelCandidateItem[] {
  return picked.map((c) => ({ id: c.id, name: c.label, score: Math.round(c.vectorScore) }));
}

/**
 * 组件选举模板方法（orchestration）：
 * 1. 复用判定命中 → 直接采纳；2. 唯一合法候选 → 直采；
 * 3. 逐级游走阶梯（空集进入下一级，multiSelect 整集采纳否则综合得分择优）；
 * 4. 阶梯耗尽 → 组件终端动作（创建新的组件 / 使用默认）。
 */
export async function runComponentElection<T>(
  adapter: ComponentElectionAdapter<T>,
  input: unknown,
  output: unknown,
): Promise<boolean> {
  const reuse = await adapter.findReusable(input);
  if (reuse) {
    adapter.funnel?.addDirect(reuse.label, toTraceItems(reuse.items));
    if (reuse.items.length === 0) return adapter.exhaust(input, output);
    return adapter.select(input, output, reuse.items, REUSE_TIER);
  }

  const signals = await adapter.extractSignals(input);
  if (signals.candidates.length === 0) {
    adapter.funnel?.addDirect('合法候选集为空', []);
    return adapter.exhaust(input, output);
  }
  if (signals.candidates.length === 1 && adapter.directAdoptSingle) {
    adapter.funnel?.addDirect(SINGLE_TIER.label, toTraceItems(signals.candidates));
    return adapter.select(input, output, signals.candidates, SINGLE_TIER);
  }

  for (const tier of adapter.tiers()) {
    const picked = pickFromTier(signals, tier, adapter.multiSelect);
    adapter.funnel?.addDirect(`${tier.label}(${picked.length})`, toTraceItems(picked));
    if (picked.length > 0) return adapter.select(input, output, picked, tier);
  }
  return adapter.exhaust(input, output);
}

/** 阶梯命中摘要（供 output.detail / 日志使用） */
export function tierDetail(adapterComponent: string, tier: ElectionTierExpr): string {
  return `election_${adapterComponent}_${tier.id}`;
}
