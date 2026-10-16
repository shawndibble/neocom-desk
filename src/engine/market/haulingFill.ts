/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub (#3878); the slice that implements this file removes it */
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
 * Pure: no fetch/DOM/Dexie.
 *
 * CONTRACT STUB — implemented in slice S1 (TDD). Signatures are fixed; the
 * other slices build against them.
 */
import type { CargoHold } from './cargoHolds';
import type { AppraisalNetFees } from './appraisal';
import type { TripCandidate, TripLine, TripOverride, TripPlan } from './haulingPlan';

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
  /** The current plan as it stands (pinned), and the plan with every fill line added. */
  before: TripPlan;
  after: TripPlan;
}

export function planFill(_input: PlanFillInput): PlanFill {
  throw new Error('planFill: not implemented (issue #3878, slice S1)');
}
