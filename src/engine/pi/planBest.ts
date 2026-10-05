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
 * 3. among the candidates left whose net is within `NET_TOLERANCE` of the
 *    best, the lowest haul effort (m3 × jumps an hour; legs of unknown
 *    distance add nothing, so an unresolved route never penalises a host);
 * 4. higher `netPerHour` (only when every candidate is priced);
 * 5. the smaller Baseline the host forfeits;
 * 6. the lower planet id.
 *
 * "Within" is 5% of the larger of |best net| and |Baseline| — two plans that
 * close are the same plan to a pilot, and the one 28 jumps out costs real
 * hauling time the ISK figure never sees — with a floor of 100 ISK/h so two
 * near-zero nets are not called different over rounding. Without a `JumpsFn`
 * every haul effort is 0 and step 3 falls through to net.
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
  /** `HaulEffort.m3JumpsPerHour`. */
  haul: number;
  forfeit: number;
  planetId: number;
}

/** Below this, two attainments or nets are the same. */
const EPSILON = 1e-9;

/** Nets within this share of max(|best net|, |Baseline|) count as equal; see the header. */
export const NET_TOLERANCE = 0.05;
/** ISK/h: the least two nets must differ by to count as different. */
export const NET_TOLERANCE_FLOOR = 100;

/** The best candidate; see the module header for the order. */
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
  return [...pool].sort(
    (a, b) =>
      a.haul - b.haul ||
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
      haul: result.plan.haulEffort.m3JumpsPerHour,
      forfeit: forfeit(hostPlanetId),
      planetId: hostPlanetId,
    };
    return { result, score };
  });
  // Net only ranks when every candidate has one: a partial comparison is not one.
  const priced = tried.every((t) => t.score.net !== null);
  const winner = pickBest(
    tried.map((t) => (priced ? t.score : { ...t.score, net: null })),
    baseline.iskPerHour
  );
  const chosen = tried.find((t) => t.score.planetId === winner.planetId)!.result;
  // A goal that reaches zero leaves no host, whichever was tried.
  if (chosen.plan.factoryHost) {
    chosen.plan.factoryHost = { planetId: chosen.plan.factoryHost.planetId, reason: 'best-net' };
  }
  return chosen;
}
