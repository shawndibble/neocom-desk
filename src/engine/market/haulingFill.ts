/**
 * Fill the free space (issue #3878): what items from other categories would
 * add to a Trip Plan whose own lines stay as they are.
 *
 * The current plan is pinned first — every line it ships keeps its quantity
 * (through `planTrip` overrides), an unticked line stays out — and the extra
 * candidates share only the space and ISK that is left. The result is what
 * adding each extra would load, so the rail can show m³, spend and profit
 * that adding it would actually bring.
 *
 * Every current line is pinned, a line at 0 included: left unpinned it would
 * be sized again beside the extras and the current plan could change.
 *
 * Pure: no fetch/DOM/Dexie.
 */
import type { CargoHold } from './cargoHolds';
import type { AppraisalNetFees } from './appraisal';
import {
  planTrip,
  type TripCandidate,
  type TripLine,
  type TripOverride,
  type TripPlan,
} from './haulingPlan';

export interface PlanFillInput {
  /** The candidates the table already plans (the scanned category, plus any extras already added). */
  current: readonly TripCandidate[];
  /** The user's edits to `current`, as `planTrip` takes them. */
  overrides: ReadonlyMap<number, TripOverride>;
  /** Candidates from other categories; any whose `typeId` is already in `current` is ignored. */
  extras: readonly TripCandidate[];
  holds: readonly CargoHold[] | null;
  budgetIsk: number | null;
  fees: AppraisalNetFees;
}

export interface PlanFill {
  /** One line per extra that would ship (quantity > 0), best profit per m³ first. */
  lines: TripLine[];
  /** What all of `lines` together add. */
  added: { volumeM3: number; cost: number; profit: number };
  /** The current plan as the user's own overrides make it, and the plan with every fill line added (current lines pinned). */
  before: TripPlan;
  after: TripPlan;
}

export function planFill(input: PlanFillInput): PlanFill {
  const { current, overrides, holds, budgetIsk, fees } = input;
  const before = planTrip({ candidates: current, overrides, holds, budgetIsk, fees });

  // Each line ships what it ships now; an unticked one stays out.
  const pinned = new Map<number, TripOverride>(
    before.lines.map((line) => [
      line.typeId,
      line.selected ? { quantity: line.quantity } : { selected: false },
    ])
  );

  // planTrip keys lines by typeId: an extra already planned, or listed twice, would duplicate a line.
  const seen = new Set(current.map((c) => c.typeId));
  const extras: TripCandidate[] = [];
  for (const extra of input.extras) {
    if (seen.has(extra.typeId)) continue;
    seen.add(extra.typeId);
    extras.push(extra);
  }

  const after = planTrip({
    candidates: [...current, ...extras],
    overrides: pinned,
    holds,
    budgetIsk,
    fees,
  });

  const extraIds = new Set(extras.map((c) => c.typeId));
  const lines = after.lines
    .filter((line) => extraIds.has(line.typeId) && line.quantity > 0)
    .sort((a, b) => profitPerM3(b) - profitPerM3(a) || a.typeId - b.typeId);
  const added = lines.reduce(
    (sum, l) => ({
      volumeM3: sum.volumeM3 + l.volumeM3,
      cost: sum.cost + l.cost,
      profit: sum.profit + l.profit,
    }),
    { volumeM3: 0, cost: 0, profit: 0 }
  );
  return { lines, added, before, after };
}

/** A line of no volume takes no room, so it comes first. */
const profitPerM3 = (line: TripLine) =>
  line.volumeM3 > 0 ? line.profit / line.volumeM3 : Number.POSITIVE_INFINITY;
