/**
 * The goal planner's solver: goals in, a **Goal Plan** out — what each colony
 * extracts or hosts, what is bought at the hub, and what cannot be covered.
 *
 * ## Greedy, and says so
 *
 * The scope decision fixes this as a greedy solver, not an optimiser. It is
 * not optimal; what makes it checkable is that every gap it leaves is named
 * as a `Shortfall` and every colony's role is a visible change against today.
 * Every output — demand lines, flows, shortfalls, assignments — describes the
 * one final plan. In order:
 *
 * 1. **Type gaps first.** A P1 whose P0 no enabled colony's planet type
 *    yields (and that the pilot will not buy) blocks every goal that needs
 *    it. Those goals are dropped before anything is assigned and reported as
 *    `type-gap`s: nothing is extracted for a product that cannot be finished,
 *    and no budget gap is reported for a blocked goal's other inputs — they
 *    reappear once the type gap is fixed.
 *
 * 2. **Demand.** Each remaining goal is expanded with `expandChain` at
 *    `unitsPerDay / 24`, the per-type rates are summed across goals, and the
 *    factory counts re-ceiled on the sums — two goals each wanting half a
 *    Water factory share one.
 *
 * 3. **Factory host.** Needed only when a P2+ is made. It must be a colony
 *    whose planet type carries every made schematic's factory, which for a P4
 *    means Barren or Temperate (the High-Tech Production Plant exists nowhere
 *    else). Among the eligible, the host is the one whose extraction the plan
 *    needs least: score each by Σ, over the demanded P0s it could yield, of
 *    1 / (colonies able to yield that P0), and take the lowest — then the
 *    smaller Baseline forfeited, then the larger Powergrid, then CPU, then the
 *    lower planet id. That is the price-free default; `planBest` instead
 *    solves once per eligible host (`hostPlanetId`) and keeps the best plan.
 *    Its P2+ factories are fitted first (`fitPlannedPins`); an overrun is a
 *    `host-over-budget` shortfall, and a host that cannot be built makes
 *    nothing. With no eligible colony, P2+ goals are not planned at all —
 *    each is one `'short'` (or, if its tier is buyable, `'bought'`) line.
 *
 * 4. **Extraction.** Each demanded P1 is made from its P0 on the spot. The
 *    host is an ordinary extractor too, fitted against what its factories
 *    leave (`colonyExtraction`'s `fixed` pins) — so P0 → P2 on one planet, the
 *    classic setup, is expressible and its P1 never crosses a customs office.
 *    P0s are taken scarcest first (fewest eligible colonies, then typeId), and
 *    each fills colonies in the order: the host first when the P1 feeds it,
 *    then a colony that extracts that P0 today (a working colony is not
 *    churned for nothing), then fewest ECUs already planned, then a measured
 *    rate before an estimated one, then fewest *other* demanded P0s the colony
 *    could yield (leave contested colonies for later), then the higher per-ECU
 *    rate, then the lower planet id. On each colony it adds the fewest
 *    ECUs that cover what is left, else the most that fit beside what the
 *    colony already runs — so a colony's second slot takes a different P0
 *    before anything is called a budget gap. Whole ECUs overshoot; the
 *    overshoot is `surplusP1`, sold.
 *
 * 5. **Release and refill.** A goal whose inputs are short runs at the
 *    fraction its scarcest P1 is supplied at (`achieved`; a shared short P1
 *    is rationed proportionally), so some extraction feeds production that
 *    never happens. Each round releases every slot (or ECU) beyond what the
 *    achieved rates consume — those colonies fall back to their Baseline —
 *    then tries to add extraction for whatever P1 binds, on any colony with
 *    room, the released ones included. A round is kept only if some goal got
 *    further; it converges in a few. A goal that reaches zero retargets
 *    nothing.
 *
 * 6. **Gaps.** P1 still uncovered is bought at the hub when the pilot allows
 *    buying P1. Otherwise it is a **budget gap** only if no colony that
 *    yields it can take more — never while a colony able to yield it sits on
 *    its Baseline with room. A P1 merely rationed by a scarcer input is not a
 *    gap; its demand line says how much is made (`madeFraction`). Shortfalls
 *    carry both P0 and P1 units. P2 and P3 are bought too when the pilot allows
 *    them and not P1 (`goalPlanSteps/buying.ts`): a gap is bought at the lowest
 *    allowed tier above it and everything higher is still made. A type gap is
 *    bought in full before the solve; a P1 that stays short is bought in the
 *    share it falls short of its demand, and the plan is solved again on the
 *    reduced demand (a few rounds at most). Buying P1 or nothing never re-solves.
 *
 * 7. **Spare capacity sells.** A colony the plan uses but does not fill takes
 *    one more slot on its best-selling P1 if one fits; a colony the plan does
 *    not need at all keeps its **Baseline** (role `'baseline'`). Nothing the
 *    plan leaves alone is credited at zero. Only a colony with no Baseline
 *    worth selling is `'idle'`.
 *
 * ## Flows are the ledger
 *
 * The plan carries every leg goods move on as a `Flow`, so `planEconomics`
 * prices legs rather than re-deriving routing, and hauling is read off the
 * same list. Extracted P1 feeds the host first — the host's own slots before
 * anyone else's, as a host → host flow that pays no customs and is not
 * hauled — then goes to the hub as a P1 goal or surplus. Bought P1 lands on
 * the host for the part it still lacks, and the rest is a P1 goal bought
 * outright (`'hub'` → `'hub'`). Hauling is m3 a week (`units/h × volume ×
 * 168`) over every leg between two places, once.
 *
 * Pure: `PiData`, colonies, policy, goals and prices are parameters. Prices
 * are read only to pick each colony's Baseline and its spare slot; the
 * assignment for the goals themselves is price-free.
 *
 * ## Steps
 *
 * `planGoals` only composes the numbered steps above, each a function over
 * explicit inputs in `goalPlanSteps/`: `triage` (normalise, type gaps), `host`
 * (place, then settle), `extraction` (fill, release/refill), `shortfalls`
 * (budget gaps, report order), `assignments` (roles, spare slots), `demand`
 * (demand lines, achieved) and `flows` (the ledger, surplus, buys, hauling).
 * Steps with logic worth pinning on their own have their own tests;
 * `goalPlan.test.ts` covers the composition.
 */

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
  /** Read for each colony's Baseline and spare slot only; see the module header. */
  books: PriceBooks;
  /**
   * Host the factories here instead of choosing by scarcity. Must be a colony
   * that can carry every made schematic's factory, or this throws. `planBest`
   * uses it to try each candidate.
   */
  hostPlanetId?: number;
  /**
   * Jumps between colonies and to the hub. When given, every flow carries its
   * leg's `jumps` and `haulEffort` weighs m3 by distance; `planBest` uses it
   * to prefer the nearer of two hosts whose nets are close.
   */
  jumps?: JumpsFn;
}

/**
 * Planet ids that could host these goals' factories, sorted — empty when no
 * P2+ is made or no colony can carry it. Goals a type gap blocks are left
 * out, as `planGoals` leaves them out. What `planBest` iterates.
 */
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

/** Most times a budget gap is bought and the plan solved again. */
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

/** A solved plan, and per P1 that holds a goal back, the share of its demand the extraction left unmet. */
interface Solved {
  plan: GoalPlan;
  shortShare: Map<number, number>;
}

function solve(input: PlanGoalsInput, goals: readonly Goal[], pi: PiData): Solved {
  const { colonies, policy, books } = input;
  const baselines = new Map(
    colonies.map((c) => [c.planetId, colonyBaseline(c, pi, policy, books)] as const)
  );

  // 1. Type gaps.
  const triage = triageGoals(goals, colonies, policy, pi);

  // 3. Factory host, at the goals' full rates.
  const placed = placeHost(goals, triage, {
    colonies,
    pi,
    baselines,
    hostPlanetId: input.hostPlanetId,
  });
  const dead = new Set<Goal>([...triage.blocked, ...placed.dead]);
  // A goal that cannot be made is bought outright when its own tier is buyable.
  const boughtOutright = new Set(
    [...dead].filter((g) => policy.buyTiers.includes(piTier(g.typeId, pi)))
  );

  // 2, 4, 5. Demand, extraction, then release and refill.
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

  // 6. Gaps: bought, or budget gaps.
  const gaps = findGaps(problem, wants, extracted);

  // The host at what it actually makes, now step 5 has settled the rates.
  const settled = settleHost(problem.plannedHigh, highFraction, placed.host, placed.reason, pi);
  const { host } = settled;

  // 7. Spare capacity and assignments.
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
