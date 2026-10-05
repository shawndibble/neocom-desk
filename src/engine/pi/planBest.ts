/**
 * The Goal Plan with the factory host that nets the most.
 *
 * `planGoals` picks a host without prices, by scarcity: the colony whose
 * extraction the plan needs least. That rule misses the classic setup — a
 * planet that yields its own P2's inputs and runs P0 → P2 with no customs on
 * the P1 — because yielding the inputs is exactly what makes a colony look
 * "needed". With a handful of colonies (6, up to 18 across alts) the honest
 * answer is cheap: solve the whole two-pass plan once per eligible host, cost
 * each with `planEconomics`, and keep the best `netPerHour`. Ties go to fewer
 * shortfalls, then the smaller Baseline the host forfeits, then the lower
 * planet id.
 *
 * Its own module so neither of `goalPlan` and `planEconomics` has to import
 * the other: the solver stays price-free and the ledger stays plan-agnostic.
 *
 * When the plans cannot be priced (`needs-price`), nets cannot be compared,
 * so this returns `planGoals`'s own scarcity pick with that refusal intact.
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
  let best: { result: BestPlan; net: number; hostId: number } | null = null;
  for (const hostPlanetId of candidates) {
    const result = cost(planGoals({ ...input, hostPlanetId }, pi));
    if (result.economics.status !== 'costed') return cost(planGoals(input, pi));
    const net = result.economics.netPerHour;
    const better =
      best === null ||
      net > best.net ||
      (net === best.net &&
        (result.plan.shortfalls.length - best.result.plan.shortfalls.length ||
          forfeit(hostPlanetId) - forfeit(best.hostId) ||
          hostPlanetId - best.hostId) < 0);
    if (better) best = { result, net, hostId: hostPlanetId };
  }
  const chosen = best!.result;
  // A goal that reaches zero leaves no host in the final pass, whichever was tried.
  if (chosen.plan.factoryHost) {
    chosen.plan.factoryHost = { planetId: chosen.plan.factoryHost.planetId, reason: 'best-net' };
  }
  return chosen;
}
