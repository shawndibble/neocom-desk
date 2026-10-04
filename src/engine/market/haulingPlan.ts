/**
 * The Trip Plan: what to load into one hold, from one Trade Hub bound for
 * another, given the space a hauler has and the ISK they are willing to
 * spend.
 *
 * The plan is a *suggestion the user edits*: every item starts selected at a
 * suggested quantity; an override either unticks an item or pins a typed
 * quantity. Pinned items keep what was typed and reserve their space and ISK
 * first, and the rest are filled from what is left — so ticking, unticking and
 * typing all run through this one function and the totals can never disagree
 * with the list.
 *
 * Each suggested quantity is the smallest of four limits, and the plan names
 * the one that applied so a hauler can see why (`limitedBy`):
 * - `sales`: a week of expected sales (`demandCapUnits`),
 * - `supply`: the units that are profitable to buy at all — the origin's
 *   ladder past the break-even price only loses money. Sold straight into the
 *   destination's buy orders there is no sales horizon, and this is the depth
 *   both books keep a unit profitable to (`walkInstant`),
 * - `space`: what fits in the room left in the holds that accept the item,
 * - `budget`: what the remaining ISK buys through the origin's ladder.
 *
 * Cargo Space is a set of holds (`cargoHolds.ts`): each item goes into a
 * Specialised Hold that accepts it first, narrowest first, and spills into the
 * general hold once that is full. An item no Specialised Hold accepts only
 * uses the general hold.
 *
 * Pure: no fetch/DOM/Dexie.
 */
import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import type { AppraisalNetFees } from './appraisal';
import {
  HOLD_KINDS,
  holdAccepts,
  SPECIALISED_HOLD_KINDS,
  type CargoHold,
  type HoldKind,
} from './cargoHolds';
import { lotEconomics, walkInstant, walkLadder, type LadderLevel } from './haulingMarket';

export interface TripCandidate {
  typeId: number;
  name: string;
  /** m³ of one unit as hauled — packaged volume where the type has one. */
  unitVolumeM3: number;
  /** The origin's sell ladder: what buying units costs. */
  buyLadder: readonly LadderLevel[];
  /** Expected Sell Price at the destination (ignored when `destBuyLadder` is set). */
  expectedPrice: number;
  /**
   * A week of expected sales, from `estimateSale`; null when the lot is sold
   * straight into buy orders, where there is no sales horizon — only book depth.
   */
  demandCapUnits: number | null;
  /** The destination's buy ladder, dearest first: set when the lot is sold into it instead of listed. */
  destBuyLadder?: readonly LadderLevel[];
  /**
   * The fee rates this lot's sale pays, when they are not the plan's own: a
   * scan that picks each item's lane can sell at different hubs, and the
   * broker fee follows the standing toward each hub's owner.
   */
  fees?: AppraisalNetFees;
  /** The item's SDE group and category, which decide the holds it may go in; absent or null means the general hold only. */
  groupId?: number | null;
  categoryId?: number | null;
}

/** A user's change to one suggested line. `quantity` wins over the suggestion; `selected: false` removes the line. */
export interface TripOverride {
  selected?: boolean;
  quantity?: number;
}

export type QuantityLimit = 'sales' | 'supply' | 'space' | 'budget' | 'edited' | 'none';

export interface TripLine {
  typeId: number;
  name: string;
  quantity: number;
  volumeM3: number;
  cost: number;
  profit: number;
  selected: boolean;
  limitedBy: QuantityLimit;
  /** The holds the line is loaded into, in fill order; empty when space never limits or nothing ships. */
  placements: HoldPlacement[];
}

export interface HoldPlacement {
  kind: HoldKind;
  quantity: number;
  volumeM3: number;
}

export interface HoldUse {
  kind: HoldKind;
  capacityM3: number;
  usedM3: number;
}

export interface TripPlan {
  /** One line per candidate, in the order given (an unselected or zero line stays, with quantity 0). */
  lines: TripLine[];
  totals: { volumeM3: number; cost: number; profit: number; items: number };
  /** The limit that stopped the plan short, when one did: space and budget outrank a plain sales cap. */
  binding: 'space' | 'budget' | 'sales' | null;
  /** Each hold, general first, with what the plan put in it; empty when space never limits. A hold no candidate fits stays at 0. */
  holds: HoldUse[];
}

export interface PlanTripInput {
  candidates: readonly TripCandidate[];
  /** The Cargo Space's holds; null or empty means the user has not said, so space never limits. */
  holds: readonly CargoHold[] | null;
  /** ISK to spend; null means no limit. */
  budgetIsk: number | null;
  fees: AppraisalNetFees;
  overrides: ReadonlyMap<number, TripOverride>;
}

/** Units of `ladder` that cost less than a unit is worth after fees — past this every further unit loses money. */
export function profitableDepth(candidate: TripCandidate, planFees: AppraisalNetFees): number {
  const { accountingLevel, brokerRelationsLevel, standing } = candidate.fees ?? planFees;
  if (candidate.destBuyLadder !== undefined) {
    return walkInstant({
      originLadder: candidate.buyLadder,
      destBuyLadder: candidate.destBuyLadder,
      accountingLevel,
    }).units;
  }
  const feeRate =
    (salesTaxPct(accountingLevel) +
      brokerFeePct(brokerRelationsLevel, standing.factionStanding, standing.corpStanding)) /
    100;
  const breakEven = candidate.expectedPrice * (1 - feeRate);
  return candidate.buyLadder.reduce((sum, l) => (l.price <= breakEven ? sum + l.units : sum), 0);
}

/** The most units `budget` ISK buys through `ladder`, up to `max`. */
function affordableUnits(ladder: readonly LadderLevel[], budget: number, max: number): number {
  let lo = 0;
  let hi = max;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (walkLadder(ladder, mid).cost <= budget) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function lineFor(
  candidate: TripCandidate,
  quantity: number,
  selected: boolean,
  limitedBy: QuantityLimit,
  planFees: AppraisalNetFees
): TripLine {
  const economics = lotEconomics({
    buyLadder: candidate.buyLadder,
    expectedPrice: candidate.expectedPrice,
    quantity,
    fees: candidate.fees ?? planFees,
    destBuyLadder: candidate.destBuyLadder,
  });
  return {
    typeId: candidate.typeId,
    name: candidate.name,
    quantity: economics.filled,
    volumeM3: economics.filled * candidate.unitVolumeM3,
    cost: economics.cost,
    profit: economics.profit,
    selected,
    limitedBy,
    placements: [],
  };
}

const FILL_ORDER: readonly HoldKind[] = [...SPECIALISED_HOLD_KINDS, 'general'];

/** One hold per kind (two of a kind add up), general first then narrowest first; holds of no size are dropped. */
function holdUses(holds: readonly CargoHold[] | null): HoldUse[] {
  const byKind = new Map<HoldKind, number>();
  for (const { kind, capacityM3 } of holds ?? []) {
    if (capacityM3 > 0) byKind.set(kind, (byKind.get(kind) ?? 0) + capacityM3);
  }
  return HOLD_KINDS.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    capacityM3: byKind.get(kind)!,
    usedM3: 0,
  }));
}

/** The holds `candidate` may go in, in the order it fills them: Specialised Holds narrowest first, then the general hold. */
function eligibleHolds(holds: readonly HoldUse[], candidate: TripCandidate): HoldUse[] {
  const item = { groupId: candidate.groupId ?? null, categoryId: candidate.categoryId ?? null };
  return FILL_ORDER.flatMap((kind) => {
    const hold = holds.find((h) => h.kind === kind);
    return hold !== undefined && holdAccepts(kind, item) ? [hold] : [];
  });
}

const freeM3 = (hold: HoldUse) => Math.max(0, hold.capacityM3 - hold.usedM3);

/** Whole units of `unitVolumeM3` that fit in a hold's free room (a hair of slack so 3.8 / 0.38 is 10, not 9). */
const unitsIn = (hold: HoldUse, unitVolumeM3: number) =>
  Math.floor(freeM3(hold) / unitVolumeM3 + 1e-9);

/**
 * Loads `quantity` units into `eligible`, in order, and records the room they
 * take. A typed quantity can exceed every hold: what is left over-fills the
 * last hold it may use, so the overflow stays visible rather than vanishing.
 */
function load(eligible: readonly HoldUse[], quantity: number, unitVolumeM3: number) {
  const placements: HoldPlacement[] = [];
  let left = quantity;
  for (const [i, hold] of eligible.entries()) {
    if (left <= 0) break;
    const last = i === eligible.length - 1;
    const units = last || unitVolumeM3 <= 0 ? left : Math.min(left, unitsIn(hold, unitVolumeM3));
    if (units <= 0) continue;
    hold.usedM3 += units * unitVolumeM3;
    placements.push({ kind: hold.kind, quantity: units, volumeM3: units * unitVolumeM3 });
    left -= units;
  }
  return placements;
}

export function planTrip(input: PlanTripInput): TripPlan {
  const { candidates, budgetIsk, fees, overrides } = input;
  const lines = new Map<number, TripLine>();

  const holds = holdUses(input.holds);
  const spaceLimits = holds.length > 0;
  let remainingBudget = budgetIsk;

  const place = (candidate: TripCandidate, line: TripLine): TripLine =>
    spaceLimits && line.quantity > 0
      ? {
          ...line,
          placements: load(eligibleHolds(holds, candidate), line.quantity, candidate.unitVolumeM3),
        }
      : line;

  // 1. Unticked items ship nothing; typed quantities are kept and reserve their share first.
  const auto: TripCandidate[] = [];
  for (const candidate of candidates) {
    const override = overrides.get(candidate.typeId);
    if (override?.selected === false) {
      lines.set(candidate.typeId, lineFor(candidate, 0, false, 'none', fees));
    } else if (override?.quantity !== undefined) {
      const line = place(
        candidate,
        lineFor(candidate, Math.max(0, Math.floor(override.quantity)), true, 'edited', fees)
      );
      lines.set(candidate.typeId, line);
      if (remainingBudget !== null) remainingBudget -= line.cost;
    } else {
      auto.push(candidate);
    }
  }

  // 2. Rank what is left by profit per share of the scarcest resource, then fill in that order.
  const sized = auto.map((candidate) => {
    const supplyCap = profitableDepth(candidate, fees);
    const salesCap =
      candidate.demandCapUnits === null
        ? Infinity
        : Math.max(0, Math.floor(candidate.demandCapUnits));
    const cap = Math.min(salesCap, supplyCap);
    const atCap = lotEconomics({
      buyLadder: candidate.buyLadder,
      expectedPrice: candidate.expectedPrice,
      quantity: cap,
      fees: candidate.fees ?? fees,
      destBuyLadder: candidate.destBuyLadder,
    });
    // Judged against the room this item can actually use, not every hold's.
    const usableM3 = eligibleHolds(holds, candidate).reduce((sum, h) => sum + freeM3(h), 0);
    let scarcity = 0;
    if (spaceLimits && usableM3 > 0) {
      scarcity = Math.max(scarcity, (atCap.filled * candidate.unitVolumeM3) / usableM3);
    }
    if (remainingBudget !== null && remainingBudget > 0) {
      scarcity = Math.max(scarcity, atCap.cost / remainingBudget);
    }
    const score = scarcity > 0 ? atCap.profit / scarcity : atCap.profit;
    return {
      candidate,
      cap,
      capLimit: (supplyCap < salesCap ? 'supply' : 'sales') as QuantityLimit,
      score,
    };
  });
  sized.sort((a, b) => b.score - a.score);

  for (const { candidate, cap, capLimit } of sized) {
    let quantity = cap;
    let limitedBy: QuantityLimit = capLimit;

    if (spaceLimits && candidate.unitVolumeM3 > 0) {
      const bySpace = eligibleHolds(holds, candidate).reduce(
        (sum, h) => sum + unitsIn(h, candidate.unitVolumeM3),
        0
      );
      if (bySpace < quantity) {
        quantity = bySpace;
        limitedBy = 'space';
      }
    }
    if (remainingBudget !== null) {
      const byBudget = affordableUnits(candidate.buyLadder, Math.max(0, remainingBudget), quantity);
      if (byBudget < quantity) {
        quantity = byBudget;
        limitedBy = 'budget';
      }
    }

    const line = place(candidate, lineFor(candidate, quantity, true, limitedBy, fees));
    lines.set(candidate.typeId, line);
    if (remainingBudget !== null) remainingBudget -= line.cost;
  }

  const ordered = candidates.map((c) => lines.get(c.typeId)!);
  const shipped = ordered.filter((l) => l.quantity > 0);
  const autoLines = ordered.filter((l) => l.limitedBy !== 'edited' && l.limitedBy !== 'none');
  const binding = autoLines.some((l) => l.limitedBy === 'space')
    ? 'space'
    : autoLines.some((l) => l.limitedBy === 'budget')
      ? 'budget'
      : autoLines.some((l) => l.limitedBy === 'sales')
        ? 'sales'
        : null;

  return {
    lines: ordered,
    totals: {
      volumeM3: shipped.reduce((s, l) => s + l.volumeM3, 0),
      cost: shipped.reduce((s, l) => s + l.cost, 0),
      profit: shipped.reduce((s, l) => s + l.profit, 0),
      items: shipped.length,
    },
    binding,
    holds,
  };
}

/** The text EVE's Multibuy window reads: one `Name Qty` line per shipped item. */
export function multibuyText(lines: readonly { name: string; quantity: number }[]): string {
  return lines
    .filter((l) => l.quantity > 0)
    .map((l) => `${l.name} ${l.quantity}`)
    .join('\n');
}
