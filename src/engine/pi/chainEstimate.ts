/**
 * What a multi-planet chain earns: the most of one product a set of colonies
 * makes in full, and the Goal Plan's ISK at that rate.
 *
 * `planBest` answers "make N a day": it sizes the host's factories for the
 * whole goal, so a goal beyond what the colonies supply is not made partly but
 * fails on the host's budget. The capacity question — "what do these planets
 * make, and is it worth it" — is therefore a search over the goal rate: double
 * from a small rate while the plan reaches it in full, then bisect the last
 * step. The solver is greedy, so reaching a rate is not strictly monotone; the
 * search is capped and keeps the best rate it saw reached, never a guess.
 *
 * The figure is the plan's absolute `netPerHour` a day (sales after sales tax,
 * less customs and anything bought), never a Lift over a Baseline: the
 * colonies are hypothetical, so what they "would earn anyway" means nothing.
 * Nothing is bought: the policy's `buyTiers` is cleared, since a chain that
 * buys its inputs is a trade spread, not a planet chain.
 *
 * Pure: colonies, policy, prices and `PiData` are parameters.
 */
import type { PiData } from '@/sde/types';
import type { GoalPlan, JumpsFn, PlannerColony, PlannerPolicy, PriceBooks } from './goalTypes';
import { planBest, type BestPlan } from './planBest';

export interface ChainEstimateInput {
  typeId: number;
  colonies: readonly PlannerColony[];
  policy: PlannerPolicy;
  books: PriceBooks;
  /**
   * Jumps between real colonies, when the caller knows them: the planner then
   * prefers the nearer host and every leg carries its distance. Hypothetical
   * planets have none.
   */
  jumps?: JumpsFn;
}

export type ChainEstimate =
  | {
      status: 'estimated';
      /** The most units a day the colonies make in full. */
      unitsPerDay: number;
      /** The plan's net ISK a day at that rate. */
      iskPerDay: number;
      /** m³ a week moved over every leg, once. */
      m3PerWeek: number;
      best: BestPlan;
    }
  /** The plan reaches a rate, but a sale or purchase on it has no price: unknown, never zero. */
  | { status: 'needs-price'; missing: number[] }
  /** The colonies make none of it in full at any rate tried. */
  | { status: 'no-plan' };

/** The first rate tried, in units a day: below any chain worth naming. */
const START_UNITS_PER_DAY = 0.25;
/** Doublings before giving up on finding a ceiling (0.25 × 2^20 ≈ 260k a day). */
const MAX_DOUBLINGS = 20;
/** Bisection steps between the last reached rate and the first missed one. */
const BISECT_STEPS = 6;

const FULL = 1 - 1e-9;

/** Every goal reached in full with no gap named. */
export function reachesInFull(plan: GoalPlan): boolean {
  return (
    plan.shortfalls.length === 0 &&
    plan.achieved.length > 0 &&
    plan.achieved.every((a) => a.fraction >= FULL)
  );
}

export function estimateChain(input: ChainEstimateInput, pi: PiData): ChainEstimate {
  const policy: PlannerPolicy = { ...input.policy, buyTiers: [] };
  const at = (unitsPerDay: number): BestPlan | null => {
    const best = planBest(
      {
        goals: [{ typeId: input.typeId, unitsPerDay }],
        colonies: input.colonies,
        policy,
        books: input.books,
        ...(input.jumps ? { jumps: input.jumps } : {}),
      },
      pi
    );
    return reachesInFull(best.plan) ? best : null;
  };

  let reached: { rate: number; best: BestPlan } | null = null;
  let missed: number | null = null;
  for (let i = 0, rate = START_UNITS_PER_DAY; i <= MAX_DOUBLINGS; i += 1, rate *= 2) {
    const best = at(rate);
    if (!best) {
      missed = rate;
      break;
    }
    reached = { rate, best };
  }
  if (!reached) return { status: 'no-plan' };
  if (missed !== null) {
    let lo = reached.rate;
    let hi = missed;
    for (let i = 0; i < BISECT_STEPS; i += 1) {
      const mid = (lo + hi) / 2;
      const best = at(mid);
      if (best) {
        lo = mid;
        reached = { rate: mid, best };
      } else {
        hi = mid;
      }
    }
  }

  const { best } = reached;
  if (best.economics.status === 'needs-price') {
    return { status: 'needs-price', missing: best.economics.missing };
  }
  return {
    status: 'estimated',
    unitsPerDay: reached.rate,
    iskPerDay: best.economics.netPerHour * 24,
    m3PerWeek: best.plan.hauling.m3PerWeek,
    best,
  };
}
