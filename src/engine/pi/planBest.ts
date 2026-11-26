import type { PiData } from '@/sde/types';
import { baselineTotal, type BaselineTotal } from './baseline';
import { hostCandidates, planGoals, type PlanGoalsInput } from './goalPlan';
import type { GoalPlan } from './goalTypes';
import { planDiff } from './planDiff';
import { planEconomics, type PlanEconomics } from './planEconomics';

export interface BestPlan {
  plan: GoalPlan;
  economics: PlanEconomics;
  baseline: BaselineTotal;
}

export interface CandidateScore {
  attainment: number;
  shortfalls: number;
  net: number | null;
  changes: number;
  haul: number;
  unknownLegs: number;
  forfeit: number;
  planetId: number;
}

const EPSILON = 1e-9;

export const NET_TOLERANCE = 0.05;
export const NET_TOLERANCE_FLOOR = 100;

export function pickBest(
  candidates: readonly CandidateScore[],
  baselinePerHour: number
): CandidateScore {
  if (candidates.length === 0) throw new Error('pickBest needs at least one candidate');
  const bestAttainment = Math.max(...candidates.map((c) => c.attainment));
  const reaching = candidates.filter((c) => c.attainment >= bestAttainment - EPSILON);
  const fewest = Math.min(...reaching.map((c) => c.shortfalls));
  let pool = reaching.filter((c) => c.shortfalls === fewest);
  const priced = pool.every((c) => c.net !== null);
  if (priced) {
    const bestNet = Math.max(...pool.map((c) => c.net!));
    const tolerance = Math.max(
      NET_TOLERANCE * Math.max(Math.abs(bestNet), Math.abs(baselinePerHour)),
      NET_TOLERANCE_FLOOR
    );
    pool = pool.filter((c) => c.net! >= bestNet - tolerance);
  }
  const hauling = (a: CandidateScore, b: CandidateScore) =>
    a.unknownLegs - b.unknownLegs || (a.unknownLegs === 0 ? a.haul - b.haul : 0);
  return [...pool].sort(
    (a, b) =>
      a.changes - b.changes ||
      hauling(a, b) ||
      (priced ? b.net! - a.net! : 0) ||
      a.forfeit - b.forfeit ||
      a.planetId - b.planetId
  )[0];
}

function attainment(plan: GoalPlan): number {
  return plan.achieved.reduce((sum, a) => sum + Math.min(1, a.fraction), 0);
}

export function planBest(input: PlanGoalsInput, pi: PiData): BestPlan {
  const baseline = baselineTotal(input.colonies, pi, input.policy, input.books, input.jumps);
  const cost = (plan: GoalPlan): BestPlan => ({
    plan,
    economics: planEconomics(plan, input.colonies, baseline, input.books, input.salesCapPerDay),
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
      changes: planDiff(result.plan, input.colonies).filter(
        (c) => c.verb !== 'keep' && !(c.verb === 'idle' && c.from.length === 0)
      ).length,
      haul: result.plan.haulEffort.m3JumpsPerHour,
      unknownLegs: result.plan.haulEffort.unknownLegs,
      forfeit: forfeit(hostPlanetId),
      planetId: hostPlanetId,
    };
    return { result, score };
  });
  const priced = tried.every((t) => t.score.net !== null);
  const winner = pickBest(
    tried.map((t) => (priced ? t.score : { ...t.score, net: null })),
    baseline.iskPerHour
  );
  const chosen = tried.find((t) => t.score.planetId === winner.planetId)!.result;
  if (chosen.plan.factoryHost) {
    chosen.plan.factoryHost = { planetId: chosen.plan.factoryHost.planetId, reason: 'best-net' };
  }
  return chosen;
}
