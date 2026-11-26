import type { CampaignObjectiveEntry } from '@/sde/types';

export interface ObjectiveLive {
  state: 'Unspecified' | 'Active' | 'Completed' | 'Expired';
  progress: number;
}

export type LpValueOf = (corporationId: number) => number | null;

export interface TurnInOffer {
  objectiveId: string;
  campaignId: string;
  typeId: number;
  iskPerItem: number;
  iskPerInterval: number;
  iskInterval: number;
  lpPerItem: number;
  lpPerBlock: number;
  lpBlockSize: number | null;
  lpCorporationId: number | null;
  lpValue: number | null;
  lpIskPerItem: number | null;
  totalPerItem: number;
  traderTypeId: number;
  traderName: string;
  systemId: number | null;
  progress: number;
  targetProgress: number;
  filled: number;
  remaining: number;
  maxPerParticipant: number | null;
}

export interface TurnInReward {
  quantity: number;
  isk: number;
  lp: number;
  lpIsk: number | null;
  total: number;
  outsideBlock: number;
}

function pricedLp(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

export function turnInOffer(
  objective: CampaignObjectiveEntry,
  live: ObjectiveLive | undefined,
  lpValueOf: LpValueOf
): TurnInOffer | null {
  const turnIn = objective.turnIn;
  if (!turnIn || !live || live.state !== 'Active') return null;
  const target = objective.targetProgress;
  if (!(target > 0) || live.progress >= target) return null;

  const iskPerItem = objective.isk ? objective.isk.amount / objective.isk.interval : 0;
  const lp = objective.lp;
  const lpPerItem = lp ? lp.amount / lp.interval : 0;
  const lpValue = lp ? pricedLp(lpValueOf(lp.corporationId)) : null;
  const lpIskPerItem = lp ? (lpValue === null ? null : lpPerItem * lpValue) : 0;
  return {
    objectiveId: objective.id,
    campaignId: objective.campaignId,
    typeId: turnIn.typeId,
    iskPerItem,
    iskPerInterval: objective.isk?.amount ?? 0,
    iskInterval: objective.isk?.interval ?? 0,
    lpPerItem,
    lpPerBlock: lp?.amount ?? 0,
    lpBlockSize: lp?.interval ?? null,
    lpCorporationId: lp?.corporationId ?? null,
    lpValue,
    lpIskPerItem,
    totalPerItem: iskPerItem + (lpIskPerItem ?? 0),
    traderTypeId: turnIn.traderTypeId,
    traderName: turnIn.traderName,
    systemId: turnIn.systemId,
    progress: live.progress,
    targetProgress: target,
    filled: Math.max(0, live.progress) / target,
    remaining: target - Math.max(0, live.progress),
    maxPerParticipant: objective.maxPerParticipant ?? null,
  };
}

export function activeTurnInOffers(
  objectives: readonly CampaignObjectiveEntry[],
  liveById: ReadonlyMap<string, ObjectiveLive>,
  lpValueOf: LpValueOf
): Map<number, TurnInOffer> {
  const offers = new Map<number, TurnInOffer>();
  for (const objective of objectives) {
    const offer = turnInOffer(objective, liveById.get(objective.id), lpValueOf);
    if (!offer) continue;
    const held = offers.get(offer.typeId);
    if (!held || offer.totalPerItem > held.totalPerItem) offers.set(offer.typeId, offer);
  }
  return offers;
}

export function turnInReward(offer: TurnInOffer, quantity: number, contributed = 0): TurnInReward {
  const asked = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  const ownRoom =
    offer.maxPerParticipant === null
      ? Infinity
      : Math.max(0, offer.maxPerParticipant - Math.max(0, contributed));
  const counted = Math.min(asked, offer.remaining, ownRoom);
  const isk =
    offer.iskInterval === 0 ? 0 : Math.floor(counted / offer.iskInterval) * offer.iskPerInterval;
  const blocks = offer.lpBlockSize === null ? 0 : Math.floor(counted / offer.lpBlockSize);
  const lp = blocks * offer.lpPerBlock;
  const lpIsk = offer.lpBlockSize === null ? 0 : offer.lpValue === null ? null : lp * offer.lpValue;
  return {
    quantity: counted,
    isk,
    lp,
    lpIsk,
    total: isk + (lpIsk ?? 0),
    outsideBlock: offer.lpBlockSize === null ? 0 : counted - blocks * offer.lpBlockSize,
  };
}
