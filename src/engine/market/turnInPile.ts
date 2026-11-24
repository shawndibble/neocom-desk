/**
 * A pile of items worth turning in, grouped by where they are handed in: one
 * group per **Item Trader** (each empire's War HQ), with what each line and
 * group pays (issue #6705, `TurnInBreakdown`).
 *
 * Every line is priced by `turnInReward`, so it counts only what the objective
 * and the Character's cap still take. A line that would pay nothing more is
 * left out, and so is a group left empty. Never a price: keep these totals
 * out of Net Worth and Appraisal totals (scope decision 20261123-164921).
 *
 * Pure: no fetch/DOM/Dexie (CLAUDE.md).
 */
import { turnInReward, type TurnInOffer, type TurnInReward } from './turnIn';

/** One item of the pile and the offer its type has. */
export interface TurnInPileItem<O extends TurnInOffer> {
  name: string;
  /** The quantity asked about; `reward.quantity` is what counts. */
  quantity: number;
  offer: O;
  /** What the Character has already put into the objective (for its cap); 0 when unknown. */
  contributed?: number;
}

export interface TurnInPileLine<O extends TurnInOffer> extends TurnInPileItem<O> {
  reward: TurnInReward;
}

/** The lines one Item Trader takes. */
export interface TurnInTraderGroup<O extends TurnInOffer> {
  key: string;
  traderTypeId: number;
  traderName: string;
  systemId: number | null;
  /** Biggest payout first. */
  lines: TurnInPileLine<O>[];
  subtotal: number;
}

export interface TurnInPile<O extends TurnInOffer> {
  /** Biggest subtotal first. */
  groups: TurnInTraderGroup<O>[];
  total: number;
}

export function groupTurnInPile<O extends TurnInOffer>(
  items: readonly TurnInPileItem<O>[]
): TurnInPile<O> {
  const byKey = new Map<string, TurnInTraderGroup<O>>();
  for (const item of items) {
    const reward = turnInReward(item.offer, item.quantity, item.contributed ?? 0);
    if (reward.quantity === 0 || reward.total <= 0) continue;
    const { traderTypeId, traderName, systemId } = item.offer;
    const key = `${traderTypeId}:${systemId ?? ''}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, traderTypeId, traderName, systemId, lines: [], subtotal: 0 };
      byKey.set(key, group);
    }
    group.lines.push({ ...item, reward });
    group.subtotal += reward.total;
  }
  const groups = [...byKey.values()].sort((a, b) => b.subtotal - a.subtotal);
  for (const group of groups) group.lines.sort((a, b) => b.reward.total - a.reward.total);
  return { groups, total: groups.reduce((sum, group) => sum + group.subtotal, 0) };
}
