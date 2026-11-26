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
  current: readonly TripCandidate[];
  overrides: ReadonlyMap<number, TripOverride>;
  extras: readonly TripCandidate[];
  holds: readonly CargoHold[] | null;
  budgetIsk: number | null;
  fees: AppraisalNetFees;
  before?: TripPlan;
}

export interface PlanFill {
  lines: TripLine[];
  added: { volumeM3: number; cost: number; profit: number };
  before: TripPlan;
  after: TripPlan;
}

export function planFill(input: PlanFillInput): PlanFill {
  const { current, overrides, holds, budgetIsk, fees } = input;
  const before =
    input.before ?? planTrip({ candidates: current, overrides, holds, budgetIsk, fees });

  const pinned = new Map<number, TripOverride>(
    before.lines.map((line) => [
      line.typeId,
      line.selected ? { quantity: line.quantity } : { selected: false },
    ])
  );

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

const profitPerM3 = (line: TripLine) =>
  line.volumeM3 > 0 ? line.profit / line.volumeM3 : Number.POSITIVE_INFINITY;
