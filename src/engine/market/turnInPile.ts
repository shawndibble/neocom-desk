import { turnInReward, type TurnInOffer, type TurnInReward } from './turnIn';

export interface TurnInPileItem<O extends TurnInOffer> {
  name: string;
  quantity: number;
  offer: O;
  contributed?: number;
}

export interface TurnInPileLine<O extends TurnInOffer> extends TurnInPileItem<O> {
  reward: TurnInReward;
}

export interface TurnInTraderGroup<O extends TurnInOffer> {
  key: string;
  traderTypeId: number;
  traderName: string;
  systemId: number | null;
  lines: TurnInPileLine<O>[];
  subtotal: number;
}

export interface TurnInPile<O extends TurnInOffer> {
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
