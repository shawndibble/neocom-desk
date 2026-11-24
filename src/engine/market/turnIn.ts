/**
 * **Turn-in Reward** maths (issue #6703): what an Active **Campaign
 * Objective** pays per item handed to its **Item Trader**, in ISK and in LP
 * counted at the paying corporation's **LP Value**.
 *
 * A Turn-in Reward is never a price. It pays only a Character that pressed
 * **Participate**, and only while the objective stays open, so nothing here
 * may feed Net Worth, an Appraisal Buy/Sell total or a contract value: it is a
 * "how to get rid of it" figure beside Sell now / List / Refine. Faction
 * tokens are in no figure (their recipes are in neither ESI nor the SDE).
 *
 * One item turned in is one unit of objective progress (CCP's own objectives
 * count units: ore is paid per unit, a report per report). LP is paid per full
 * block (`lpBlockSize` items); whether a remainder carries over is unverified,
 * so `turnInReward` pays none for it and says how many items fell outside.
 *
 * Pure: no fetch/DOM/Dexie (CLAUDE.md). Baked objectives come from
 * `militaryCampaigns.json`, live state from ESI, both handed in.
 */
import type { CampaignObjectiveEntry } from '@/sde/types';

/** ESI's live state for one objective; `progress` is the community total. */
export interface ObjectiveLive {
  state: 'Unspecified' | 'Active' | 'Completed' | 'Expired';
  progress: number;
}

/** ISK per LP for a corporation's LP, or null when nothing prices it. */
export type LpValueOf = (corporationId: number) => number | null;

/** One Active objective's offer for the item it takes. */
export interface TurnInOffer {
  objectiveId: string;
  campaignId: string;
  /** The item turned in. */
  typeId: number;
  iskPerItem: number;
  /** ISK is paid per `iskInterval` items (1 for every objective seen so far); 0 when it pays none. */
  iskPerInterval: number;
  iskInterval: number;
  /** LP per item averaged over a block; paid only in whole blocks. 0 when the objective pays none. */
  lpPerItem: number;
  /** LP paid for each full block. */
  lpPerBlock: number;
  /** Items in one LP block; null when the objective pays no LP. */
  lpBlockSize: number | null;
  /** The corporation paying the LP; null when there is none. */
  lpCorporationId: number | null;
  /** ISK per LP the LP is counted at; null when unpriced (or no LP). */
  lpValue: number | null;
  /** `lpPerItem` × LP Value; null when the LP is unpriced — never counted free. */
  lpIskPerItem: number | null;
  /** ISK per item plus the LP as ISK; ISK alone while the LP is unpriced. */
  totalPerItem: number;
  traderTypeId: number;
  traderName: string;
  systemId: number | null;
  progress: number;
  targetProgress: number;
  /** Community progress as a fraction of the target, 0..1 (shown as "% filled"). */
  filled: number;
  /** Progress the community can still add before the objective closes. */
  remaining: number;
  /** The most one Character may contribute; null when uncapped. */
  maxPerParticipant: number | null;
}

/** What `quantity` items turned in pay. */
export interface TurnInReward {
  /** Items counted: the asked quantity, cut to what the objective and the Character's cap still take. */
  quantity: number;
  isk: number;
  /** LP for the full blocks only. */
  lp: number;
  /** `lp` × LP Value; null when the LP is unpriced. */
  lpIsk: number | null;
  /** `isk` + `lpIsk` (ISK alone while the LP is unpriced). */
  total: number;
  /** Counted items short of a full LP block, which earn no LP. */
  outsideBlock: number;
}

function pricedLp(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The offer `objective` makes, or null when it makes none: not a turn-in, no
 * live state, not Active, or its community target already filled.
 */
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

/**
 * Every Active turn-in offer, keyed by the item it takes. Should two open
 * objectives take one item, the one paying more per item wins.
 */
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

/**
 * What turning in `quantity` items pays under `offer`. `contributed` is what
 * the Character has already put in (its per-Character cap counts it); 0 when
 * unknown.
 */
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
