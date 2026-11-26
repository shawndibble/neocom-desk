import type { PiData } from '@/sde/types';
import { colonyBaseline } from './baseline';
import { piTier } from './chain';
import type {
  Goal,
  GoalPlan,
  PlannerColony,
  PlannerPolicy,
  JumpsFn,
  PriceBooks,
} from './goalTypes';
import { haulEffortOf } from './haulEffort';
import { buysHigherTiers, withShortPurchases, withTypeGapPurchases } from './goalPlanSteps/buying';
import { assignColonies } from './goalPlanSteps/assignments';
import { achievedOf, demandLines } from './goalPlanSteps/demand';
import { extractionProblem, solveExtraction } from './goalPlanSteps/extraction';
import { buysOf, haulingOf, planFlows, surplusOf } from './goalPlanSteps/flows';
import { eligibleHosts, madeHighOf, placeHost, settleHost } from './goalPlanSteps/host';
import { byId } from './goalPlanSteps/shared';
import { compareShortfalls, findGaps } from './goalPlanSteps/shortfalls';
import { normaliseGoals, triageGoals } from './goalPlanSteps/triage';

export { rawOf, schematicOf } from './goalPlanSteps/shared';

export interface PlanGoalsInput {
  goals: readonly Goal[];
  colonies: readonly PlannerColony[];
  policy: PlannerPolicy;
  books: PriceBooks;
  hostPlanetId?: number;
  salesCapPerDay?: ReadonlyMap<number, number>;
  jumps?: JumpsFn;
}

export function hostCandidates(input: PlanGoalsInput, pi: PiData): number[] {
  const goals = withTypeGapPurchases(
    normaliseGoals(input.goals, pi),
    input.colonies,
    input.policy,
    pi
  );
  const { live } = triageGoals(goals, input.colonies, input.policy, pi);
  const madeHigh = madeHighOf(live, pi);
  if (madeHigh.length === 0) return [];
  return eligibleHosts(madeHigh, input.colonies, pi)
    .map((c) => c.planetId)
    .sort(byId);
}

const MAX_BUY_ROUNDS = 4;

export function planGoals(input: PlanGoalsInput, pi: PiData): GoalPlan {
  const { colonies, policy } = input;
  let goals = withTypeGapPurchases(normaliseGoals(input.goals, pi), colonies, policy, pi);
  let { plan, shortShare } = solve(input, goals, pi);
  if (!buysHigherTiers(policy)) return plan;
  for (let round = 0; round < MAX_BUY_ROUNDS && shortShare.size > 0; round++) {
    const bought = withShortPurchases(goals, shortShare, policy, pi);
    if (!bought) break;
    goals = bought;
    ({ plan, shortShare } = solve(input, goals, pi));
  }
  return plan;
}

interface Solved {
  plan: GoalPlan;
  shortShare: Map<number, number>;
}

function solve(input: PlanGoalsInput, goals: readonly Goal[], pi: PiData): Solved {
  const { colonies, policy, books } = input;
  const baselines = new Map(
    colonies.map((c) => [c.planetId, colonyBaseline(c, pi, policy, books)] as const)
  );

  const triage = triageGoals(goals, colonies, policy, pi);

  const placed = placeHost(goals, triage, {
    colonies,
    pi,
    baselines,
    hostPlanetId: input.hostPlanetId,
  });
  const dead = new Set<Goal>([...triage.blocked, ...placed.dead]);
  const boughtOutright = new Set(
    [...dead].filter((g) => policy.buyTiers.includes(piTier(g.typeId, pi)))
  );

  const problem = extractionProblem({
    planned: goals.filter((g) => !dead.has(g)),
    colonies,
    policy,
    pi,
    host: placed.host,
    hostFactories: placed.factories,
  });
  const solved = solveExtraction(problem);
  const { wants, extracted, hostUse, highFraction, p1GoalReach, consumption } = solved;

  const gaps = findGaps(problem, wants, extracted);

  const settled = settleHost(problem.plannedHigh, highFraction, placed.host, placed.reason, pi);
  const { host } = settled;

  const { assignments, spare } = assignColonies({
    colonies: problem.colonies,
    wants,
    host,
    hostFactories: settled.factories,
    baselines,
    policy,
    books,
    pi,
  });

  const flows = planFlows({
    problem,
    wants,
    host,
    hostUse,
    bought: gaps.bought,
    highAchieved: settled.highAchieved,
    boughtOutright,
    spare,
    assignments,
    jumps: input.jumps,
    pi,
  });

  const shortfalls = [...triage.typeGaps, ...placed.shortfalls, ...gaps.shortfalls];
  shortfalls.sort(compareShortfalls);
  const shortShare = new Map<number, number>();
  for (const p1 of solved.binding) {
    const need = problem.demand.get(p1) ?? 0;
    if (need > 0) shortShare.set(p1, 1 - Math.min(1, (extracted.get(p1) ?? 0) / need));
  }
  const plan: GoalPlan = {
    goals: [...goals],
    achieved: achievedOf({ goals, dead, boughtOutright, highFraction, p1GoalReach, pi }),
    demand: demandLines({
      problem,
      extracted,
      consumption,
      budgetGapP1: gaps.budgetGapP1,
      bought: gaps.bought,
      madeHighRates: settled.madeHighRates,
      triage,
      dead,
      boughtOutright,
      pi,
    }),
    assignments,
    factoryHost:
      host && settled.reason ? { planetId: host.planetId, reason: settled.reason } : null,
    shortfalls,
    buys: buysOf(flows, pi),
    surplusP1: surplusOf(extracted, hostUse, p1GoalReach),
    flows,
    haulEffort: haulEffortOf(flows, pi, input.jumps),
    hauling: haulingOf(flows, pi),
  };
  return { plan, shortShare };
}
