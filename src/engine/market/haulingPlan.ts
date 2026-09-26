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
 *   ladder past the break-even price only loses money,
 * - `space`: what fits in the remaining hold,
 * - `budget`: what the remaining ISK buys through the origin's ladder.
 *
 * Pure: no fetch/DOM/Dexie.
 */
import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import type { AppraisalNetFees } from './appraisal';
import { lotEconomics, walkLadder, type LadderLevel } from './haulingMarket';

export interface TripCandidate {
  typeId: number;
  name: string;
  /** m³ of one unit as hauled — packaged volume where the type has one. */
  unitVolumeM3: number;
  /** The origin's sell ladder: what buying units costs. */
  buyLadder: readonly LadderLevel[];
  /** Expected Sell Price at the destination. */
  expectedPrice: number;
  /** A week of expected sales, from `estimateSale`. */
  demandCapUnits: number;
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
}

export interface TripPlan {
  /** One line per candidate, in the order given (an unselected or zero line stays, with quantity 0). */
  lines: TripLine[];
  totals: { volumeM3: number; cost: number; profit: number; items: number };
  /** The limit that stopped the plan short, when one did: space and budget outrank a plain sales cap. */
  binding: 'space' | 'budget' | 'sales' | null;
}

export interface PlanTripInput {
  candidates: readonly TripCandidate[];
  /** Hold size in m³; null means the user has not said, so space never limits. */
  cargoM3: number | null;
  /** ISK to spend; null means no limit. */
  budgetIsk: number | null;
  fees: AppraisalNetFees;
  overrides: ReadonlyMap<number, TripOverride>;
}

/** Units of `ladder` that cost less than a unit is worth after fees — past this every further unit loses money. */
export function profitableDepth(candidate: TripCandidate, fees: AppraisalNetFees): number {
  const { accountingLevel, brokerRelationsLevel, standing } = fees;
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
  fees: AppraisalNetFees
): TripLine {
  const economics = lotEconomics({
    buyLadder: candidate.buyLadder,
    expectedPrice: candidate.expectedPrice,
    quantity,
    fees,
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
  };
}

export function planTrip(input: PlanTripInput): TripPlan {
  const { candidates, cargoM3, budgetIsk, fees, overrides } = input;
  const lines = new Map<number, TripLine>();

  let remainingM3 = cargoM3;
  let remainingBudget = budgetIsk;

  // 1. Unticked items ship nothing; typed quantities are kept and reserve their share first.
  const auto: TripCandidate[] = [];
  for (const candidate of candidates) {
    const override = overrides.get(candidate.typeId);
    if (override?.selected === false) {
      lines.set(candidate.typeId, lineFor(candidate, 0, false, 'none', fees));
    } else if (override?.quantity !== undefined) {
      const line = lineFor(
        candidate,
        Math.max(0, Math.floor(override.quantity)),
        true,
        'edited',
        fees
      );
      lines.set(candidate.typeId, line);
      if (remainingM3 !== null) remainingM3 -= line.volumeM3;
      if (remainingBudget !== null) remainingBudget -= line.cost;
    } else {
      auto.push(candidate);
    }
  }

  // 2. Rank what is left by profit per share of the scarcest resource, then fill in that order.
  const sized = auto.map((candidate) => {
    const salesCap = Math.max(0, Math.floor(candidate.demandCapUnits));
    const supplyCap = profitableDepth(candidate, fees);
    const cap = Math.min(salesCap, supplyCap);
    const atCap = lotEconomics({
      buyLadder: candidate.buyLadder,
      expectedPrice: candidate.expectedPrice,
      quantity: cap,
      fees,
    });
    let scarcity = 0;
    if (remainingM3 !== null && remainingM3 > 0) {
      scarcity = Math.max(scarcity, (atCap.filled * candidate.unitVolumeM3) / remainingM3);
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

    if (remainingM3 !== null && candidate.unitVolumeM3 > 0) {
      const bySpace = Math.max(0, Math.floor(remainingM3 / candidate.unitVolumeM3));
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

    const line = lineFor(candidate, quantity, true, limitedBy, fees);
    lines.set(candidate.typeId, line);
    if (remainingM3 !== null) remainingM3 -= line.volumeM3;
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
  };
}

/** The text EVE's Multibuy window reads: one `Name Qty` line per shipped item. */
export function multibuyText(lines: readonly { name: string; quantity: number }[]): string {
  return lines
    .filter((l) => l.quantity > 0)
    .map((l) => `${l.name} ${l.quantity}`)
    .join('\n');
}
