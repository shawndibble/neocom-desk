/**
 * The Goal Plan with the best factory host.
 *
 * `planGoals` picks a host without prices, by scarcity: the colony whose
 * extraction the plan needs least. That rule misses the classic setup — a
 * planet that yields its own P2's inputs and runs P0 → P2 with no customs on
 * the P1 — because yielding the inputs is exactly what makes a colony look
 * "needed". With a handful of colonies (6, up to 18 across alts) the honest
 * answer is cheap: solve the whole plan once per eligible host and keep the
 * best.
 *
 * ## "Best" is the goals first, ISK second
 *
 * The pilot asked for products, so a host that makes them beats one that
 * nets more by making nothing — a host whose factories do not fit leaves every
 * colony on its Baseline, which can out-earn a thin-margin chain. Candidates
 * are ranked by (`compareCandidates`):
 *
 * 1. goal attainment — Σ over goals of min(1, achieved / requested), each
 *    goal weighted equally;
 * 2. fewer shortfalls;
 * 3. higher `netPerHour` (only when every candidate is priced);
 * 4. the smaller Baseline the host forfeits;
 * 5. the lower planet id.
 *
 * Its own module so neither of `goalPlan` and `planEconomics` has to import
 * the other: the solver stays price-free and the ledger stays plan-agnostic.
 * When any candidate cannot be priced (`needs-price`), net drops out of the
 * ranking and the chosen plan keeps that refusal.
 *
 * Pure: everything is a parameter.
 */

import type { PiData } from '@/sde/types';
import { baselineTotal, type BaselineTotal } from './baseline';
import { hostCandidates, planGoals, type PlanGoalsInput } from './goalPlan';
import type { GoalPlan } from './goalTypes';
import { planEconomics, type PlanEconomics } from './planEconomics';

export interface BestPlan {
  plan: GoalPlan;
  economics: PlanEconomics;
  baseline: BaselineTotal;
}

/** What a candidate host is ranked on. `net` is null when it cannot be priced. */
export interface CandidateScore {
  attainment: number;
  shortfalls: number;
  net: number | null;
  forfeit: number;
  planetId: number;
}

/** Below this, two attainments or nets are the same. */
const EPSILON = 1e-9;

/** Sorts the better candidate first; see the module header for the order. */
export function compareCandidates(a: CandidateScore, b: CandidateScore): number {
  if (Math.abs(a.attainment - b.attainment) > EPSILON) return b.attainment - a.attainment;
  if (a.shortfalls !== b.shortfalls) return a.shortfalls - b.shortfalls;
  if (a.net !== null && b.net !== null && Math.abs(a.net - b.net) > EPSILON) return b.net - a.net;
  if (a.forfeit !== b.forfeit) return a.forfeit - b.forfeit;
  return a.planetId - b.planetId;
}

function attainment(plan: GoalPlan): number {
  return plan.achieved.reduce((sum, a) => sum + Math.min(1, a.fraction), 0);
}

export function planBest(input: PlanGoalsInput, pi: PiData): BestPlan {
  const baseline = baselineTotal(input.colonies, pi, input.policy, input.books);
  const cost = (plan: GoalPlan): BestPlan => ({
    plan,
    economics: planEconomics(plan, input.colonies, baseline, input.books),
    baseline,
  });

  const candidates = hostCandidates(input, pi);
  if (candidates.length <= 1) {
    const only = cost(planGoals(input, pi));
    if (only.plan.factoryHost && candidates.length === 1) {
      only.plan.factoryHost = { planetId: only.plan.factoryHost.planetId, reason: 'only-eligible' };
    }
    return only;
  }

  const forfeit = (planetId: number) => {
    const own = baseline.perColony.get(planetId);
    return own?.status === 'ok' ? own.iskPerHour : 0;
  };
  const tried = candidates.map((hostPlanetId) => {
    const result = cost(planGoals({ ...input, hostPlanetId }, pi));
    const score: CandidateScore = {
      attainment: attainment(result.plan),
      shortfalls: result.plan.shortfalls.length,
      net: result.economics.status === 'costed' ? result.economics.netPerHour : null,
      forfeit: forfeit(hostPlanetId),
      planetId: hostPlanetId,
    };
    return { result, score };
  });
  // Net only ranks when every candidate has one: a partial comparison is not one.
  const priced = tried.every((t) => t.score.net !== null);
  const rank = (s: CandidateScore): CandidateScore => (priced ? s : { ...s, net: null });
  const chosen = [...tried].sort((a, b) => compareCandidates(rank(a.score), rank(b.score)))[0]
    .result;
  // A goal that reaches zero leaves no host, whichever was tried.
  if (chosen.plan.factoryHost) {
    chosen.plan.factoryHost = { planetId: chosen.plan.factoryHost.planetId, reason: 'best-net' };
  }
  return chosen;
}
