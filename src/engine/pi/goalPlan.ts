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
 *    carry both P0 and P1 units. Buying stops at P1 in milestone 1.
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
 */

import type { PiData, PiFactoryKind } from '@/sde/types';
import { bidOf, colonyBaseline, p1NetPerUnit, type ColonyBaseline } from './baseline';
import { expandChain, isP0, piTier } from './chain';
import {
  colonyExtraction,
  fitPlannedPins,
  type ExtractionWant,
  type FittedExtraction,
} from './colonyCapacity';
import type {
  ColonyAssignment,
  DemandLine,
  DemandSource,
  ExtractionSlot,
  Flow,
  FlowEnd,
  Goal,
  FactoryHostReason,
  GoalPlan,
  PlannerColony,
  PlannerPolicy,
  JumpsFn,
  PriceBooks,
  RateSource,
  Shortfall,
} from './goalTypes';
import { haulEffortOf, legJumps, volumeOf } from './haulEffort';
import { singleFactoryRate } from './pinBudget';
import type { PinCounts } from './types';

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

const HOURS_PER_DAY = 24;
const HOURS_PER_WEEK = 168;
/** Below this a remaining rate is float dust, not demand. */
const EPSILON = 1e-9;

function byId(a: number, b: number): number {
  return a - b;
}

function factoriesFor(typeId: number, unitsPerHour: number, pi: PiData): number | null {
  const rate = singleFactoryRate(typeId, pi);
  return rate === null ? null : Math.ceil(unitsPerHour / rate - EPSILON);
}

function baselineIsk(result: ColonyBaseline | undefined): number {
  return result?.status === 'ok' ? result.iskPerHour : 0;
}

/** Goals merged by type, zero-rate goals dropped, P0 goals refused. */
function normaliseGoals(goals: readonly Goal[], pi: PiData): Goal[] {
  const merged = new Map<number, number>();
  for (const g of goals) {
    if (!Number.isFinite(g.unitsPerDay) || g.unitsPerDay < 0) {
      throw new Error(`a goal needs a finite, non-negative rate, got ${g.unitsPerDay}`);
    }
    if (g.unitsPerDay === 0) continue;
    if (isP0(g.typeId, pi)) {
      // Every extraction slot refines on the spot; raw P0 is never a product.
      throw new Error(`goal ${g.typeId} is a P0; the planner plans P1 and above`);
    }
    merged.set(g.typeId, (merged.get(g.typeId) ?? 0) + g.unitsPerDay);
  }
  return [...merged]
    .sort(([a], [b]) => a - b)
    .map(([typeId, unitsPerDay]) => ({ typeId, unitsPerDay }));
}

interface SolveContext {
  colonies: readonly PlannerColony[];
  policy: PlannerPolicy;
  books: PriceBooks;
  baselines: ReadonlyMap<number, ColonyBaseline>;
  pi: PiData;
  hostPlanetId: number | undefined;
}

/** Colonies whose planet type carries every factory `madeHigh` needs. */
function eligibleHosts(
  madeHigh: readonly number[],
  colonies: readonly PlannerColony[],
  pi: PiData
): PlannerColony[] {
  const schematics = madeHigh.map((id) => pi.schematics[String(id)]);
  return colonies.filter((c) => schematics.every((s) => s.planetTypes.includes(c.planetType)));
}

function madeHighOf(goals: readonly Goal[], pi: PiData): number[] {
  const made = new Set<number>();
  for (const g of goals) {
    const chain = expandChain(g.typeId, pi, { unitsPerHour: g.unitsPerDay / HOURS_PER_DAY });
    for (const node of chain.nodes) if (node.tier >= 2) made.add(node.typeId);
  }
  return [...made].sort(byId);
}

interface GoalTriage {
  /** Goals nothing rules out up front. */
  live: Goal[];
  /** Goals a type gap blocks: they make nothing, so nothing is extracted for them. */
  blocked: Goal[];
  /** Per blocked goal, the P0s whose type gaps block it, ascending. */
  blockedBy: Map<Goal, number[]>;
  typeGaps: Shortfall[];
}

/**
 * Which goals can be planned at all. A P1 whose P0 no enabled colony's planet
 * type yields, and that the pilot will not buy, blocks every goal whose chain
 * needs it — a **type gap**. Those goals are dropped before anything is
 * assigned: nothing extracts for a product that cannot be finished, and no
 * budget gap is reported for its other inputs (fix the type gap first; they
 * reappear in the plan once it is fixed).
 */
function triageGoals(
  goals: readonly Goal[],
  colonies: readonly PlannerColony[],
  policy: PlannerPolicy,
  pi: PiData
): GoalTriage {
  const buyP1 = policy.buyTiers.includes(1);
  const yieldable = (p0: number) => colonies.some((c) => c.ratePerEcu.has(p0));
  const gapUnits = new Map<number, number>(); // p1 → P1 units/h the blocked goals wanted
  const live: Goal[] = [];
  const blocked: Goal[] = [];
  const blockedBy = new Map<Goal, number[]>();
  for (const g of goals) {
    const chain = expandChain(g.typeId, pi, { unitsPerHour: g.unitsPerDay / HOURS_PER_DAY });
    const gaps = buyP1
      ? []
      : chain.nodes.filter(
          (n) => n.tier === 1 && !yieldable(pi.schematics[String(n.typeId)].inputs[0].typeID)
        );
    if (gaps.length === 0) {
      live.push(g);
      continue;
    }
    blocked.push(g);
    blockedBy.set(
      g,
      [...new Set(gaps.map((n) => pi.schematics[String(n.typeId)].inputs[0].typeID))].sort(
        (a, b) => a - b
      )
    );
    for (const n of gaps) gapUnits.set(n.typeId, (gapUnits.get(n.typeId) ?? 0) + n.unitsPerHour);
  }
  const typeGaps: Shortfall[] = [...gapUnits]
    .sort(([a], [b]) => a - b)
    .map(([p1TypeId, p1UnitsPerHour]) => {
      const schematic = pi.schematics[String(p1TypeId)];
      const input = schematic.inputs[0];
      const raw = pi.raw.find((r) => r.typeID === input.typeID)!;
      return {
        kind: 'type-gap',
        p0TypeId: input.typeID,
        p1TypeId,
        unitsPerHour: (p1UnitsPerHour * input.quantity) / schematic.quantity,
        p1UnitsPerHour,
        fixPlanetTypes: [...raw.planetTypes],
      };
    });
  return { live, blocked, blockedBy, typeGaps };
}

/**
 * Planet ids that could host these goals' factories, sorted — empty when no
 * P2+ is made or no colony can carry it. Goals a type gap blocks are left
 * out, as `planGoals` leaves them out. What `planBest` iterates.
 */
export function hostCandidates(input: PlanGoalsInput, pi: PiData): number[] {
  const goals = normaliseGoals(input.goals, pi);
  const { live } = triageGoals(goals, input.colonies, input.policy, pi);
  const madeHigh = madeHighOf(live, pi);
  if (madeHigh.length === 0) return [];
  return eligibleHosts(madeHigh, input.colonies, pi)
    .map((c) => c.planetId)
    .sort(byId);
}

/**
 * The host for `madeHigh` (every P2+ type the plan makes), or null with the
 * factory kind that has nowhere to go.
 */
function chooseHost(
  madeHigh: readonly number[],
  demandedP0: readonly number[],
  ctx: SolveContext
): { host: PlannerColony; reason: FactoryHostReason } | { host: null; facility: PiFactoryKind } {
  const { colonies, pi } = ctx;
  const schematics = madeHigh.map((id) => pi.schematics[String(id)]);
  const eligible = eligibleHosts(madeHigh, colonies, pi);
  if (ctx.hostPlanetId !== undefined) {
    const forced = eligible.find((c) => c.planetId === ctx.hostPlanetId);
    if (!forced) {
      throw new Error(`planet ${ctx.hostPlanetId} cannot host these goals' factories`);
    }
    return { host: forced, reason: 'forced' };
  }
  if (eligible.length === 0) {
    // Name the factory no colony can carry; the P4's High-Tech plant in practice.
    const stranded =
      schematics.find((s) => !colonies.some((c) => s.planetTypes.includes(c.planetType))) ??
      [...schematics].sort((a, b) => a.planetTypes.length - b.planetTypes.length)[0];
    return { host: null, facility: stranded.facility };
  }
  const yielders = (p0: number) => colonies.filter((c) => c.ratePerEcu.has(p0)).length;
  const score = (c: PlannerColony) =>
    demandedP0.filter((p0) => c.ratePerEcu.has(p0)).reduce((sum, p0) => sum + 1 / yielders(p0), 0);
  const forfeit = (c: PlannerColony) => baselineIsk(ctx.baselines.get(c.planetId));
  const ranked = [...eligible].sort(
    (a, b) =>
      score(a) - score(b) ||
      forfeit(a) - forfeit(b) ||
      b.budget.powergrid - a.budget.powergrid ||
      b.budget.cpu - a.budget.cpu ||
      a.planetId - b.planetId
  );
  return {
    host: ranked[0],
    reason: eligible.length === 1 ? 'only-eligible' : 'least-needed-extraction',
  };
}

/**
 * The best-selling extra slot `colony` can add beside `current` (and its
 * `fixed` factories), or null when none fits or none is priced. A P0 already
 * in `current` is not offered again: its ECU count was the solver's call.
 */
function spareSlot(
  colony: PlannerColony,
  current: readonly ExtractionWant[],
  fixed: PinCounts,
  ctx: SolveContext
): FittedExtraction | null {
  const { policy, books, pi } = ctx;
  if (current.length >= policy.maxP0TypesPerColony) return null;
  const ecusLeft = policy.maxEcusPerColony - current.reduce((s, w) => s + w.ecus, 0);
  let best: { fit: FittedExtraction; isk: number } | null = null;
  for (const p0 of [...colony.ratePerEcu.keys()].sort(byId)) {
    if (current.some((w) => w.p0TypeId === p0)) continue;
    for (let ecus = ecusLeft; ecus >= 1; ecus--) {
      const fit = colonyExtraction(colony, [...current, { p0TypeId: p0, ecus }], pi, policy, fixed);
      if (fit.status !== 'fits') continue;
      const slot = fit.slots.find((s) => s.p0TypeId === p0)!;
      const bid = bidOf(books, slot.p1TypeId);
      if (bid === undefined) break;
      const isk = slot.p1PerHour * p1NetPerUnit(bid, colony, books);
      if (isk > EPSILON && (best === null || isk > best.isk)) best = { fit, isk };
      break;
    }
  }
  return best?.fit ?? null;
}

/** Strongest rate source first. */
const RATE_SOURCE_RANK: Readonly<Record<RateSource, number>> = {
  measured: 0,
  'own-mean': 1,
  assumed: 2,
};

/** Most release/refill rounds; it converges in two or three on real colonies. */
const MAX_ROUNDS = 8;

export function planGoals(input: PlanGoalsInput, pi: PiData): GoalPlan {
  const { colonies, policy, books } = input;
  const goals = normaliseGoals(input.goals, pi);
  const baselines = new Map(
    colonies.map((c) => [c.planetId, colonyBaseline(c, pi, policy, books)] as const)
  );
  const ctx: SolveContext = {
    colonies,
    policy,
    books,
    baselines,
    pi,
    hostPlanetId: input.hostPlanetId,
  };
  const tierOf = (id: number) => piTier(id, pi);
  const perHour = (g: Goal) => g.unitsPerDay / HOURS_PER_DAY;
  const sortedColonies = [...colonies].sort((a, b) => a.planetId - b.planetId);
  const buyP1 = policy.buyTiers.includes(1);
  const expandInto = (into: Map<number, number>, list: readonly Goal[]) => {
    for (const g of list) {
      const chain = expandChain(g.typeId, pi, { unitsPerHour: perHour(g) });
      for (const node of chain.nodes) {
        into.set(node.typeId, (into.get(node.typeId) ?? 0) + node.unitsPerHour);
      }
    }
  };

  // --- 1. Type gaps --------------------------------------------------------
  const triage = triageGoals(goals, colonies, policy, pi);
  const shortfalls: Shortfall[] = [...triage.typeGaps];
  const dead = new Set<Goal>(triage.blocked);

  // --- 2. Factory host -----------------------------------------------------
  let host: PlannerColony | null = null;
  let hostReason: FactoryHostReason | null = null;
  const liveHigh = triage.live.filter((g) => tierOf(g.typeId) >= 2);
  // A missing host is its own fix, whatever else blocks a goal: check every
  // P2+ goal, not only the ones a type gap leaves standing.
  const allHigh = goals.filter((g) => tierOf(g.typeId) >= 2);
  if (allHigh.length > 0 && liveHigh.length < allHigh.length) {
    const madeAll = madeHighOf(allHigh, pi);
    if (eligibleHosts(madeAll, colonies, pi).length === 0) {
      const probe = chooseHost(madeAll, [], { ...ctx, hostPlanetId: undefined });
      if (!probe.host) shortfalls.push({ kind: 'no-factory-host', facility: probe.facility });
    }
  }
  const factoriesOf = (rates: ReadonlyMap<number, number>) => {
    const out: Partial<Record<PiFactoryKind, number>> = {};
    for (const [id, units] of rates) {
      if (tierOf(id) < 2 || units <= EPSILON) continue;
      const facility = pi.schematics[String(id)].facility;
      out[facility] = (out[facility] ?? 0) + factoriesFor(id, units, pi)!;
    }
    return out;
  };
  let hostFactories: PinCounts = {};
  if (liveHigh.length > 0) {
    const liveDemand = new Map<number, number>();
    expandInto(liveDemand, triage.live);
    const demandedP0 = [...liveDemand.keys()].filter((id) => tierOf(id) === 0).sort(byId);
    const choice = chooseHost(madeHighOf(liveHigh, pi), demandedP0, ctx);
    if (choice.host) {
      const highDemand = new Map<number, number>();
      expandInto(highDemand, liveHigh);
      const factories = factoriesOf(highDemand);
      const fit = fitPlannedPins(choice.host, factories, 0, pi);
      if (fit.fits) {
        host = choice.host;
        hostReason = choice.reason;
        hostFactories = factories;
      } else {
        // A host that cannot carry its factories makes nothing at all.
        shortfalls.push({
          kind: 'host-over-budget',
          planetId: choice.host.planetId,
          limitedBy: fit.limitedBy,
        });
        liveHigh.forEach((g) => dead.add(g));
      }
    } else {
      if (!shortfalls.some((sf) => sf.kind === 'no-factory-host')) {
        shortfalls.push({ kind: 'no-factory-host', facility: choice.facility });
      }
      liveHigh.forEach((g) => dead.add(g));
    }
  }
  // A goal that cannot be made is bought outright when its own tier is buyable.
  const boughtOutright = new Set(
    [...dead].filter((g) => policy.buyTiers.includes(tierOf(g.typeId)))
  );
  const planned = goals.filter((g) => !dead.has(g));
  const plannedHigh = planned.filter((g) => tierOf(g.typeId) >= 2);
  const demand = new Map<number, number>();
  expandInto(demand, planned);
  const fixedOn = (c: PlannerColony): PinCounts => (c === host ? hostFactories : {});

  const p1GoalNeed = new Map<number, number>();
  for (const g of planned) if (tierOf(g.typeId) === 1) p1GoalNeed.set(g.typeId, perHour(g));
  const feedsHost = (p1: number) => (demand.get(p1) ?? 0) - (p1GoalNeed.get(p1) ?? 0) > EPSILON;

  // --- 3. Extraction -------------------------------------------------------
  const p1Rows = [...demand]
    .filter(([id]) => tierOf(id) === 1)
    .map(([p1, units]) => {
      const schematic = pi.schematics[String(p1)];
      const input = schematic.inputs[0];
      const eligible = sortedColonies.filter((c) => c.ratePerEcu.has(input.typeID));
      return {
        p1,
        p0: input.typeID,
        units,
        p1PerP0: schematic.quantity / input.quantity,
        eligible,
      };
    })
    .sort((a, b) => a.eligible.length - b.eligible.length || a.p0 - b.p0);
  const rowByP0 = new Map(p1Rows.map((r) => [r.p0, r]));

  type Wants = Map<number, ExtractionWant[]>;
  let wants: Wants = new Map();
  const ecusOn = (state: Wants, c: PlannerColony) =>
    (state.get(c.planetId) ?? []).reduce((s, w) => s + w.ecus, 0);
  const slotP1 = (c: PlannerColony, p0: number, ecus: number) =>
    c.ratePerEcu.get(p0)!.unitsPerHour *
    (1 + policy.extraEcuFactor * (ecus - 1)) *
    rowByP0.get(p0)!.p1PerP0;

  /**
   * Greedy: add `row`'s P0 to colonies in the documented order until
   * `remaining` P1/h is covered or nothing more fits. Mutates `state`;
   * returns the P1/h added.
   */
  const fill = (state: Wants, row: (typeof p1Rows)[number], remaining: number): number => {
    const pending = new Set(p1Rows.map((r) => r.p0).filter((p0) => p0 !== row.p0));
    const contention = (c: PlannerColony) =>
      [...pending].filter((p0) => c.ratePerEcu.has(p0)).length;
    const hostFirst = (c: PlannerColony) => (c === host && feedsHost(row.p1) ? 0 : 1);
    // Leave a working colony where it is: one that runs this P0 today keeps
    // it before anyone else starts it, and a measured rate beats an estimate.
    const runsToday = (c: PlannerColony) =>
      (c.current.ecusByP0?.get(row.p0) ?? 0) > 0 || c.current.p0TypeIds.includes(row.p0) ? 0 : 1;
    const estimated = (c: PlannerColony) => RATE_SOURCE_RANK[c.ratePerEcu.get(row.p0)!.source];
    const order = [...row.eligible].sort(
      (a, b) =>
        hostFirst(a) - hostFirst(b) ||
        runsToday(a) - runsToday(b) ||
        ecusOn(state, a) - ecusOn(state, b) ||
        estimated(a) - estimated(b) ||
        contention(a) - contention(b) ||
        b.ratePerEcu.get(row.p0)!.unitsPerHour - a.ratePerEcu.get(row.p0)!.unitsPerHour ||
        a.planetId - b.planetId
    );
    let added = 0;
    for (const c of order) {
      if (remaining - added <= EPSILON) break;
      const current = state.get(c.planetId) ?? [];
      const existing = current.find((w) => w.p0TypeId === row.p0);
      if (!existing && current.length >= policy.maxP0TypesPerColony) continue;
      const others = current.filter((w) => w.p0TypeId !== row.p0);
      const had = existing ? slotP1(c, row.p0, existing.ecus) : 0;
      let best: { want: ExtractionWant[]; gain: number } | null = null;
      const first = (existing?.ecus ?? 0) + 1;
      for (
        let ecus = first;
        ecus <= policy.maxEcusPerColony - ecusOn(state, c) + (existing?.ecus ?? 0);
        ecus++
      ) {
        const want = [...others, { p0TypeId: row.p0, ecus }];
        const result = colonyExtraction(c, want, pi, policy, fixedOn(c));
        if (result.status !== 'fits') break;
        const gain = slotP1(c, row.p0, ecus) - had;
        best = { want, gain };
        if (gain >= remaining - added - EPSILON) break;
      }
      if (!best) continue;
      state.set(c.planetId, best.want);
      added += best.gain;
    }
    return added;
  };

  const extractedFrom = (state: Wants) => {
    const out = new Map<number, number>();
    for (const c of sortedColonies) {
      for (const w of state.get(c.planetId) ?? []) {
        const p1 = rowByP0.get(w.p0TypeId)!.p1;
        out.set(p1, (out.get(p1) ?? 0) + slotP1(c, w.p0TypeId, w.ecus));
      }
    }
    return out;
  };

  /**
   * What the goals reach on `state`'s extraction: each P2+ goal at its
   * scarcest P1's supply fraction (a shared short P1 rationed proportionally),
   * the host consuming exactly what those rates need, and each P1 goal taking
   * what is left of its type.
   */
  const evaluate = (state: Wants) => {
    const extracted = extractedFrom(state);
    const supplied = (p1: number) =>
      buyP1 ? Math.max(extracted.get(p1) ?? 0, demand.get(p1) ?? 0) : (extracted.get(p1) ?? 0);
    const supplyFraction = (p1: number) => {
      const need = demand.get(p1) ?? 0;
      return need <= EPSILON ? 1 : Math.min(1, supplied(p1) / need);
    };
    const highFraction = new Map<number, number>();
    const binding = new Set<number>();
    for (const g of plannedHigh) {
      const p1s = expandChain(g.typeId, pi, { unitsPerHour: perHour(g) })
        .nodes.filter((n) => n.tier === 1)
        .map((n) => n.typeId);
      const fraction = Math.min(1, ...p1s.map(supplyFraction));
      highFraction.set(g.typeId, fraction);
      if (fraction < 1 - EPSILON) {
        p1s
          .filter((p1) => supplyFraction(p1) <= fraction + EPSILON)
          .forEach((p1) => binding.add(p1));
      }
    }
    const hostUse = new Map<number, number>();
    expandInto(
      hostUse,
      plannedHigh
        .map((g) => ({
          typeId: g.typeId,
          unitsPerDay: g.unitsPerDay * highFraction.get(g.typeId)!,
        }))
        .filter((g) => g.unitsPerDay > EPSILON)
    );
    const p1GoalReach = new Map<number, number>();
    for (const [p1, need] of p1GoalNeed) {
      const reach = Math.max(0, Math.min(need, supplied(p1) - (hostUse.get(p1) ?? 0)));
      p1GoalReach.set(p1, reach);
      if (reach < need - EPSILON) binding.add(p1);
    }
    const consumption = new Map<number, number>();
    for (const row of p1Rows) {
      consumption.set(row.p1, (hostUse.get(row.p1) ?? 0) + (p1GoalReach.get(row.p1) ?? 0));
    }
    const score =
      [...highFraction.values()].reduce((s, f) => s + f, 0) +
      [...p1GoalReach].reduce((s, [p1, reach]) => s + reach / p1GoalNeed.get(p1)!, 0);
    return { extracted, supplied, highFraction, hostUse, p1GoalReach, consumption, binding, score };
  };

  /** Drop or shrink every slot beyond what `consumption` needs; the host's own slots are kept first. */
  const release = (state: Wants, consumption: ReadonlyMap<number, number>) => {
    const needed = new Map(consumption);
    const feedOrder = [...sortedColonies].sort((a, b) => Number(b === host) - Number(a === host));
    for (const c of feedOrder) {
      const current = state.get(c.planetId);
      if (!current) continue;
      const kept: ExtractionWant[] = [];
      for (const w of [...current].sort((a, b) => a.p0TypeId - b.p0TypeId)) {
        const p1 = rowByP0.get(w.p0TypeId)!.p1;
        const need = needed.get(p1) ?? 0;
        if (need <= EPSILON) continue;
        let ecus = w.ecus;
        for (let k = 1; k <= w.ecus; k++) {
          if (slotP1(c, w.p0TypeId, k) >= need - EPSILON) {
            ecus = k;
            break;
          }
        }
        kept.push({ p0TypeId: w.p0TypeId, ecus });
        needed.set(p1, need - slotP1(c, w.p0TypeId, ecus));
      }
      if (kept.length > 0) state.set(c.planetId, kept);
      else state.delete(c.planetId);
    }
  };
  const copy = (state: Wants): Wants => new Map([...state].map(([k, v]) => [k, [...v]]));

  for (const row of p1Rows) fill(wants, row, row.units);
  // Release extraction nothing consumes, then try to raise whatever binds;
  // keep a round only if some goal actually got further.
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const before = evaluate(wants);
    release(wants, before.consumption);
    if (buyP1) break;
    const trial = copy(wants);
    const after = evaluate(trial);
    let added = 0;
    for (const row of p1Rows) {
      if (!after.binding.has(row.p1)) continue;
      added += fill(trial, row, row.units - (extractedFrom(trial).get(row.p1) ?? 0));
    }
    if (added <= EPSILON || evaluate(trial).score <= before.score + EPSILON) break;
    wants = trial;
  }
  const final = evaluate(wants);
  release(wants, final.consumption);
  const { extracted, hostUse, highFraction, p1GoalReach, consumption } = evaluate(wants);

  // --- 4. Gaps -------------------------------------------------------------
  // A P1 is a budget gap only if no colony can take more of it. One that is
  // merely rationed by a scarcer input (colonies with room exist) is not.
  const bought = new Map<number, number>();
  const budgetGapP1 = new Set<number>();
  for (const row of p1Rows) {
    const unmet = row.units - (extracted.get(row.p1) ?? 0);
    if (unmet <= EPSILON) continue;
    if (buyP1) {
      bought.set(row.p1, unmet);
      continue;
    }
    if (fill(copy(wants), row, unmet) > EPSILON) continue;
    budgetGapP1.add(row.p1);
    shortfalls.push({
      kind: 'budget-gap',
      p0TypeId: row.p0,
      p1TypeId: row.p1,
      unitsPerHour: unmet / row.p1PerP0,
      p1UnitsPerHour: unmet,
      // Every colony that yields it and is not already at the ECU cap on it:
      // freeing room on one of these (dropping its other P0) closes the gap.
      retargetCandidates: sortedColonies
        .filter(
          (c) =>
            c.ratePerEcu.has(row.p0) &&
            (wants.get(c.planetId)?.find((w) => w.p0TypeId === row.p0)?.ecus ?? 0) <
              policy.maxEcusPerColony
        )
        .map((c) => c.planetId),
    });
  }

  // --- 5. Host, at what it actually makes ------------------------------------
  const highAchieved = plannedHigh.map((g) => ({
    typeId: g.typeId,
    unitsPerDay: g.unitsPerDay * (highFraction.get(g.typeId) ?? 0),
  }));
  const madeHighRates = new Map<number, number>();
  expandInto(
    madeHighRates,
    highAchieved.filter((a) => a.unitsPerDay > EPSILON)
  );
  if (host && ![...madeHighRates.values()].some((u) => u > EPSILON)) {
    // Nothing gets made: no host, and its colony is an ordinary one again.
    host = null;
    hostReason = null;
  }
  hostFactories = host ? factoriesOf(madeHighRates) : {};

  // --- 6. Spare capacity and assignments -----------------------------------
  const fitted = new Map<number, FittedExtraction>();
  for (const c of sortedColonies) {
    const want = wants.get(c.planetId);
    if (!want) continue;
    const fit = colonyExtraction(c, want, pi, policy, fixedOn(c));
    if (fit.status === 'fits') fitted.set(c.planetId, fit);
  }
  const spare = new Map<number, ExtractionSlot>();
  const assignments: ColonyAssignment[] = sortedColonies.map((c): ColonyAssignment => {
    const isHost = c === host;
    let fit = fitted.get(c.planetId) ?? null;
    if (fit || isHost) {
      const current = wants.get(c.planetId) ?? [];
      const extra = spareSlot(c, current, fixedOn(c), ctx);
      if (extra) {
        const added = extra.slots.find((s) => !current.some((w) => w.p0TypeId === s.p0TypeId))!;
        spare.set(c.planetId, added);
        fit = extra;
      }
    }
    if (isHost) {
      const pinFit = fit ?? fitPlannedPins(c, hostFactories, 0, pi);
      return {
        planetId: c.planetId,
        role: 'factory',
        slots: fit?.slots ?? [],
        factories: hostFactories,
        pins: pinFit.pins,
        used: pinFit.used,
        budget: pinFit.budget,
        limitedBy: [],
        ...(fit?.runningToday ? { runningToday: true as const } : {}),
      };
    }
    if (fit) {
      return {
        planetId: c.planetId,
        role: 'extract',
        slots: fit.slots,
        factories: {},
        pins: fit.pins,
        used: fit.used,
        budget: fit.budget,
        limitedBy: [],
        ...(fit.runningToday ? { runningToday: true as const } : {}),
      };
    }
    const own = ctx.baselines.get(c.planetId);
    if (own?.status === 'ok' && own.slots.length > 0) {
      // The Baseline was picked from fitting options, so this refit fits.
      const keep = colonyExtraction(
        c,
        own.slots.map((s) => ({ p0TypeId: s.p0TypeId, ecus: s.ecus })),
        pi,
        policy
      ) as FittedExtraction;
      return {
        planetId: c.planetId,
        role: 'baseline',
        slots: own.slots,
        factories: {},
        pins: keep.pins,
        used: keep.used,
        budget: keep.budget,
        limitedBy: [],
        ...(keep.runningToday ? { runningToday: true as const } : {}),
      };
    }
    return {
      planetId: c.planetId,
      role: 'idle',
      slots: [],
      factories: {},
      pins: {},
      used: { cpu: 0, powergrid: 0 },
      budget: c.budget,
      limitedBy: [],
    };
  });

  // --- Demand lines --------------------------------------------------------
  // The goals as asked, each line saying how much of it the final plan makes.
  const p1Of = (p0: number) => rowByP0.get(p0)!.p1;
  // Made means extracted *and used*: overshoot from a whole ECU is surplus, not made.
  const p1Made = (p1: number) => Math.min(extracted.get(p1) ?? 0, consumption.get(p1) ?? 0);
  const lines: DemandLine[] = [...demand].map(([typeId, unitsPerHour]) => {
    const tier = tierOf(typeId);
    let made: number;
    let source: DemandSource;
    if (tier === 0) {
      const p1 = p1Of(typeId);
      made = (p1Made(p1) / (demand.get(p1) ?? 1)) * unitsPerHour;
      source = budgetGapP1.has(p1)
        ? 'short'
        : (extracted.get(p1) ?? 0) <= EPSILON && bought.has(p1)
          ? 'not-extracted'
          : 'extracted';
    } else if (tier === 1) {
      made = p1Made(typeId);
      source = budgetGapP1.has(typeId) ? 'short' : bought.has(typeId) ? 'bought' : 'made';
    } else {
      made = madeHighRates.get(typeId) ?? 0;
      source = made >= unitsPerHour - EPSILON ? 'made' : 'short';
    }
    return {
      typeId,
      tier,
      unitsPerHour,
      factories: factoriesFor(typeId, unitsPerHour, pi),
      source,
      madeFraction: unitsPerHour <= EPSILON ? 1 : Math.min(1, made / unitsPerHour),
    };
  });
  // A goal a type gap blocks keeps its whole chain in the demand, so the plan
  // still answers "what would it need" — every line 'blocked', made by
  // nothing, consuming and pricing nothing. A type both a live goal and a
  // blocked one need gets two lines: (typeId, source) is unique, typeId alone
  // is not.
  // Each line names the type-gap P0s blocking the goals it serves, so a
  // caller can say which planet type each blocked goal is waiting on.
  const blockedDemand = new Map<number, number>();
  const blockedByType = new Map<number, Set<number>>();
  for (const g of triage.blocked) {
    if (boughtOutright.has(g)) continue;
    const own = new Map<number, number>();
    expandInto(own, [g]);
    for (const [typeId, units] of own) {
      blockedDemand.set(typeId, (blockedDemand.get(typeId) ?? 0) + units);
      const by = blockedByType.get(typeId) ?? new Set<number>();
      triage.blockedBy.get(g)!.forEach((p0) => by.add(p0));
      blockedByType.set(typeId, by);
    }
  }
  for (const [typeId, unitsPerHour] of blockedDemand) {
    lines.push({
      typeId,
      tier: tierOf(typeId),
      unitsPerHour,
      factories: factoriesFor(typeId, unitsPerHour, pi),
      source: 'blocked',
      madeFraction: 0,
      blockedBy: [...blockedByType.get(typeId)!].sort((a, b) => a - b),
    });
  }
  for (const g of dead) {
    if (triage.blocked.includes(g) && !boughtOutright.has(g)) continue;
    const tier = tierOf(g.typeId);
    const unitsPerHour = perHour(g);
    lines.push({
      typeId: g.typeId,
      tier,
      unitsPerHour,
      factories: factoriesFor(g.typeId, unitsPerHour, pi),
      source: boughtOutright.has(g) ? 'bought' : 'short',
      madeFraction: 0,
    });
  }
  const blockedLast = (l: DemandLine) => (l.source === 'blocked' ? 1 : 0);
  lines.sort((a, b) => b.tier - a.tier || a.typeId - b.typeId || blockedLast(a) - blockedLast(b));

  // --- Achieved ------------------------------------------------------------
  const achieved: GoalPlan['achieved'] = goals.map((g) => {
    const target = perHour(g);
    const unitsPerHour = boughtOutright.has(g)
      ? target
      : dead.has(g)
        ? 0
        : tierOf(g.typeId) >= 2
          ? target * (highFraction.get(g.typeId) ?? 0)
          : (p1GoalReach.get(g.typeId) ?? 0);
    return { typeId: g.typeId, unitsPerHour, fraction: unitsPerHour / target };
  });

  // --- Flows ---------------------------------------------------------------
  const flows: Flow[] = [];
  const push = (from: FlowEnd, to: FlowEnd, typeId: number, unitsPerHour: number) => {
    if (unitsPerHour <= EPSILON) return;
    const leg: Flow = { from, to, typeId, tier: tierOf(typeId), unitsPerHour };
    if (input.jumps) leg.jumps = legJumps(from, to, input.jumps);
    flows.push(leg);
  };
  const hostLeft = new Map([...hostUse].filter(([id]) => tierOf(id) === 1));
  // The host feeds itself before anyone ships it anything. Spare slots are
  // not the plan's own extraction: they go straight to the hub below.
  const feedOrder = [...sortedColonies].sort((a, b) => Number(b === host) - Number(a === host));
  for (const c of feedOrder) {
    for (const w of wants.get(c.planetId) ?? []) {
      const p1 = p1Of(w.p0TypeId);
      const units = slotP1(c, w.p0TypeId, w.ecus);
      const toHost = host ? Math.min(units, hostLeft.get(p1) ?? 0) : 0;
      if (host) push(c.planetId, host.planetId, p1, toHost);
      hostLeft.set(p1, (hostLeft.get(p1) ?? 0) - toHost);
      push(c.planetId, 'hub', p1, units - toHost);
    }
  }
  for (const [p1, units] of [...bought].sort(([a], [b]) => a - b)) {
    const toHost = Math.min(units, Math.max(0, hostLeft.get(p1) ?? 0));
    if (host) push('hub', host.planetId, p1, toHost);
    push('hub', 'hub', p1, units - toHost);
  }
  if (host)
    for (const a of highAchieved)
      push(host.planetId, 'hub', a.typeId, a.unitsPerDay / HOURS_PER_DAY);
  for (const g of boughtOutright) push('hub', 'hub', g.typeId, perHour(g));
  // What the plan leaves alone sells: spare slots and whole Baseline colonies.
  for (const [planetId, slot] of spare) push(planetId, 'hub', slot.p1TypeId, slot.p1PerHour);
  for (const a of assignments) {
    if (a.role !== 'baseline') continue;
    for (const slot of a.slots) push(a.planetId, 'hub', slot.p1TypeId, slot.p1PerHour);
  }

  const surplusP1: GoalPlan['surplusP1'] = [];
  for (const [p1, units] of [...extracted].sort(([a], [b]) => a - b)) {
    const surplus = units - (hostUse.get(p1) ?? 0) - (p1GoalReach.get(p1) ?? 0);
    if (surplus > EPSILON) surplusP1.push({ typeId: p1, unitsPerHour: surplus });
  }

  const buysByType = new Map<number, number>();
  for (const f of flows) {
    if (f.from === 'hub')
      buysByType.set(f.typeId, (buysByType.get(f.typeId) ?? 0) + f.unitsPerHour);
  }
  const buys = [...buysByType]
    .sort(([a], [b]) => a - b)
    .map(([typeId, unitsPerHour]) => ({ typeId, tier: tierOf(typeId), unitsPerHour }));

  // Hub-to-hub (bought and kept) and host-to-itself legs move nothing between places.
  let m3PerWeek = 0;
  const perColony = new Map<number, number>();
  for (const f of flows) {
    if (f.from === f.to) continue;
    const m3 = f.unitsPerHour * volumeOf(f.typeId, pi) * HOURS_PER_WEEK;
    m3PerWeek += m3;
    for (const end of [f.from, f.to]) {
      if (end !== 'hub') perColony.set(end, (perColony.get(end) ?? 0) + m3);
    }
  }

  shortfalls.sort(compareShortfalls);
  return {
    goals,
    achieved,
    demand: lines,
    assignments,
    factoryHost: host && hostReason ? { planetId: host.planetId, reason: hostReason } : null,
    shortfalls,
    buys,
    surplusP1,
    flows,
    haulEffort: haulEffortOf(flows, pi, input.jumps),
    hauling: { m3PerWeek, perColony },
  };
}

const SHORTFALL_ORDER: Readonly<Record<Shortfall['kind'], number>> = {
  'no-factory-host': 0,
  'host-over-budget': 1,
  'type-gap': 2,
  'budget-gap': 3,
};

function compareShortfalls(a: Shortfall, b: Shortfall): number {
  const kind = SHORTFALL_ORDER[a.kind] - SHORTFALL_ORDER[b.kind];
  if (kind !== 0) return kind;
  const id = (s: Shortfall) => ('p0TypeId' in s ? s.p0TypeId : 0);
  return id(a) - id(b);
}
