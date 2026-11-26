import type { PiData } from '@/sde/types';
import type { GoalPlan, JumpsFn, PlannerColony, PlannerPolicy, PriceBooks } from './goalTypes';
import { planBest, type BestPlan } from './planBest';

export interface ChainEstimateInput {
  typeId: number;
  colonies: readonly PlannerColony[];
  policy: PlannerPolicy;
  books: PriceBooks;
  jumps?: JumpsFn;
  allowBuy?: boolean;
  salesCapPerDay?: ReadonlyMap<number, number>;
}

export type ChainEstimate =
  | {
      status: 'estimated';
      unitsPerDay: number;
      iskPerDay: number;
      m3PerWeek: number;
      best: BestPlan;
    }
  | { status: 'needs-price'; missing: number[] }
  | { status: 'no-plan' };

const START_UNITS_PER_DAY = 0.25;
const MAX_DOUBLINGS = 20;
const BISECT_STEPS = 6;

const FULL = 1 - 1e-9;

export function reachesInFull(plan: GoalPlan): boolean {
  return (
    plan.shortfalls.length === 0 &&
    plan.achieved.length > 0 &&
    plan.achieved.every((a) => a.fraction >= FULL)
  );
}

export function estimateChain(input: ChainEstimateInput, pi: PiData): ChainEstimate {
  const policy: PlannerPolicy = input.allowBuy ? input.policy : { ...input.policy, buyTiers: [] };
  const at = (unitsPerDay: number): BestPlan | null => {
    const best = planBest(
      {
        goals: [{ typeId: input.typeId, unitsPerDay }],
        colonies: input.colonies,
        policy,
        books: input.books,
        ...(input.jumps ? { jumps: input.jumps } : {}),
        ...(input.salesCapPerDay ? { salesCapPerDay: input.salesCapPerDay } : {}),
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
