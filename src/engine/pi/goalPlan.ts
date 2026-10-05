/**
 * The goal planner's solver: goals in, a **Goal Plan** out — what each colony
 * extracts or hosts, what is bought at the hub, and what cannot be covered.
 *
 * ## Greedy, and says so
 *
 * The scope decision fixes this as a greedy pass, not an optimiser. It is not
 * optimal; what makes it checkable is that every gap it leaves is named as a
 * `Shortfall` and every colony's role is a visible change against today. One
 * pass (`solve`), in order:
 *
 * 1. **Demand.** Each goal is expanded with `expandChain` at
 *    `unitsPerDay / 24`, the per-type rates are summed across goals, and the
 *    factory counts re-ceiled on the sums — two goals each wanting half a
 *    Water factory share one.
 *
 * 2. **Factory host.** Needed only when a P2+ is made. It must be a colony
 *    whose planet type carries every made schematic's factory, which for a P4
 *    means Barren or Temperate (the High-Tech Production Plant exists nowhere
 *    else). Among the eligible, the host is the one whose extraction the plan
 *    needs least: score each by Σ, over the demanded P0s it could yield, of
 *    1 / (colonies able to yield that P0), and take the lowest — then the
 *    smaller Baseline forfeited, then the larger Powergrid, then CPU, then the
 *    lower planet id. That is the price-free default; `planBest` instead
 *    solves once per eligible host (`hostPlanetId`) and keeps the best net. Its P2+ factories are fitted first (`fitPlannedPins`);
 *    an overrun is a `host-over-budget` shortfall, and a host that cannot be
 *    built makes nothing. With no eligible colony, P2+ goals are not expanded
 *    at all — each is one `'short'` (or, if its tier is buyable, `'bought'`)
 *    line — and only P1 goals are planned.
 *
 * 3. **Extraction.** Each demanded P1 is made from its P0 on the spot. The
 *    host is an ordinary extractor too, fitted against what its factories
 *    leave (`colonyExtraction`'s `fixed` pins) — so P0 → P2 on one planet, the
 *    classic setup, is expressible and its P1 never crosses a customs office.
 *    P0s are taken scarcest first (fewest eligible colonies, then typeId), and
 *    each fills colonies in the order: the host first when the P1 feeds it,
 *    then fewest ECUs already planned, then fewest *other* still-unassigned
 *    demanded P0s the colony could yield (leave contested colonies for later),
 *    then the higher per-ECU rate, then the lower planet id. On each colony it
 *    adds the fewest ECUs that cover what is left, else the most that fit
 *    beside what the colony already runs — so a colony's second slot takes a
 *    different P0 before anything is called a budget gap. Whole ECUs
 *    overshoot; the overshoot is `surplusP1`, sold.
 *
 * 4. **Gaps.** P1 left uncovered is bought at the hub when the pilot allows
 *    buying P1. Otherwise it is a `Shortfall`, in P0 units: a **type gap**
 *    when no enabled colony's planet type yields that P0 at all (the fix is a
 *    planet of a listed type), else a **budget gap** (the fix is re-targeting
 *    or buying). Buying stops at P1 in milestone 1 — a short P1 under a pilot
 *    who allows buying P2 but not P1 is still a shortfall, because working
 *    out how many P2s a short P1 strands is its own pass.
 *
 * 5. **Spare capacity sells.** A colony the plan uses but does not fill takes
 *    one more slot on its best-selling P1 if one fits; a colony the plan does
 *    not need at all keeps its **Baseline** (role `'baseline'`). Either way
 *    nothing the plan leaves alone is credited at zero, so a plan is never
 *    penalised for colonies it simply does not touch. Only a colony with no
 *    priced Baseline is `'idle'`.
 *
 * ## Two passes: release what nothing consumes
 *
 * A goal whose inputs are short runs at the fraction its scarcest P1 is
 * supplied at (`achieved`, a shared short P1 rationed proportionally). The
 * first pass's extraction was sized for the full goals, so some of it feeds
 * production that never happens. `planGoals` therefore solves again at the
 * achieved rates: extraction nothing consumes is released, and those colonies
 * fall back to their Baseline. A goal that reaches zero retargets nothing. The
 * shortfalls and the demand lines are the first pass's — they describe what
 * the goals as asked for lack; everything else is the second pass's.
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
  PriceBooks,
  Shortfall,
} from './goalTypes';
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
}

const HOURS_PER_DAY = 24;
const HOURS_PER_WEEK = 168;
/** Below this a remaining rate is float dust, not demand. */
const EPSILON = 1e-9;

function byId(a: number, b: number): number {
  return a - b;
}

function volumeOf(typeId: number, pi: PiData): number {
  const schematic = pi.schematics[String(typeId)];
  if (schematic) return schematic.volume;
  const raw = pi.raw.find((r) => r.typeID === typeId);
  if (!raw) throw new Error(`${typeId} is not a planetary commodity`);
  return raw.volume;
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

/**
 * Planet ids that could host these goals' factories, sorted — empty when no
 * P2+ is made or no colony can carry it. What `planBest` iterates.
 */
export function hostCandidates(input: PlanGoalsInput, pi: PiData): number[] {
  const madeHigh = madeHighOf(normaliseGoals(input.goals, pi), pi);
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

interface Solved {
  achieved: GoalPlan['achieved'];
  demand: DemandLine[];
  assignments: ColonyAssignment[];
  factoryHost: GoalPlan['factoryHost'];
  shortfalls: Shortfall[];
  flows: Flow[];
  surplusP1: GoalPlan['surplusP1'];
}

function solve(goals: readonly Goal[], ctx: SolveContext): Solved {
  const { policy, pi } = ctx;
  const tierOf = (id: number) => piTier(id, pi);
  const sortedColonies = [...ctx.colonies].sort((a, b) => a.planetId - b.planetId);

  // --- 1. Demand -----------------------------------------------------------
  const expandInto = (into: Map<number, number>, list: readonly Goal[]) => {
    for (const g of list) {
      const chain = expandChain(g.typeId, pi, { unitsPerHour: g.unitsPerDay / HOURS_PER_DAY });
      for (const node of chain.nodes) {
        into.set(node.typeId, (into.get(node.typeId) ?? 0) + node.unitsPerHour);
      }
    }
  };
  const fullDemand = new Map<number, number>();
  expandInto(fullDemand, goals);

  // --- 2. Factory host -----------------------------------------------------
  const madeHigh = [...fullDemand.keys()].filter((id) => tierOf(id) >= 2).sort(byId);
  const demandedP0 = [...fullDemand.keys()].filter((id) => tierOf(id) === 0).sort(byId);
  const shortfalls: Shortfall[] = [];
  let host: PlannerColony | null = null;
  let factoryHost: GoalPlan['factoryHost'] = null;
  const unhostedGoals: Goal[] = [];
  if (madeHigh.length > 0) {
    const choice = chooseHost(madeHigh, demandedP0, ctx);
    if (choice.host) {
      host = choice.host;
      factoryHost = { planetId: choice.host.planetId, reason: choice.reason };
    } else {
      shortfalls.push({ kind: 'no-factory-host', facility: choice.facility });
      unhostedGoals.push(...goals.filter((g) => tierOf(g.typeId) >= 2));
    }
  }
  const plannedGoals = goals.filter((g) => !unhostedGoals.includes(g));
  const demand = new Map<number, number>();
  expandInto(demand, plannedGoals);

  const hostFactories: Partial<Record<PiFactoryKind, number>> = {};
  for (const [id, units] of demand) {
    if (tierOf(id) < 2) continue;
    const facility = pi.schematics[String(id)].facility;
    hostFactories[facility] = (hostFactories[facility] ?? 0) + factoriesFor(id, units, pi)!;
  }
  const hostFit = host ? fitPlannedPins(host, hostFactories, 0, pi) : null;
  const hostBuilds = hostFit?.fits ?? false;
  if (host && hostFit && !hostFit.fits) {
    shortfalls.push({
      kind: 'host-over-budget',
      planetId: host.planetId,
      limitedBy: hostFit.limitedBy,
    });
  }
  const fixedOn = (c: PlannerColony): PinCounts => (c === host ? hostFactories : {});

  // P1 wanted as a goal of its own, as against fed to the host.
  const p1GoalNeed = new Map<number, number>();
  for (const g of plannedGoals) {
    if (tierOf(g.typeId) === 1) p1GoalNeed.set(g.typeId, g.unitsPerDay / HOURS_PER_DAY);
  }
  const p1Demand = [...demand].filter(([id]) => tierOf(id) === 1);
  const feedsHost = (p1: number) => (demand.get(p1) ?? 0) - (p1GoalNeed.get(p1) ?? 0) > EPSILON;

  // --- 3. Extraction -------------------------------------------------------
  // A host whose factories already overrun has nothing left to extract with.
  const extractors = sortedColonies.filter((c) => c !== host || hostBuilds);
  const p1Rows = p1Demand
    .map(([p1, units]) => {
      const schematic = pi.schematics[String(p1)];
      const input = schematic.inputs[0];
      const eligible = extractors.filter((c) => c.ratePerEcu.has(input.typeID));
      const p1PerP0 = schematic.quantity / input.quantity;
      return { p1, p0: input.typeID, units, p1PerP0, eligible };
    })
    .sort((a, b) => a.eligible.length - b.eligible.length || a.p0 - b.p0);

  const wants = new Map<number, ExtractionWant[]>();
  const fitted = new Map<number, FittedExtraction>();
  const extracted = new Map<number, number>(); // p1 → units/h planned
  const unmet = new Map<number, number>(); // p1 → units/h uncovered
  const pending = new Set(p1Rows.map((r) => r.p0));
  const ecusOn = (c: PlannerColony) =>
    (wants.get(c.planetId) ?? []).reduce((s, w) => s + w.ecus, 0);

  for (const row of p1Rows) {
    pending.delete(row.p0);
    const contention = (c: PlannerColony) =>
      [...pending].filter((p0) => c.ratePerEcu.has(p0)).length;
    const hostFirst = (c: PlannerColony) => (c === host && feedsHost(row.p1) ? 0 : 1);
    const order = [...row.eligible].sort(
      (a, b) =>
        hostFirst(a) - hostFirst(b) ||
        ecusOn(a) - ecusOn(b) ||
        contention(a) - contention(b) ||
        b.ratePerEcu.get(row.p0)!.unitsPerHour - a.ratePerEcu.get(row.p0)!.unitsPerHour ||
        a.planetId - b.planetId
    );
    let remaining = row.units;
    for (const c of order) {
      if (remaining <= EPSILON) break;
      const current = wants.get(c.planetId) ?? [];
      if (current.length >= policy.maxP0TypesPerColony) continue;
      let best: { want: ExtractionWant[]; result: FittedExtraction; p1: number } | null = null;
      for (let ecus = 1; ecus <= policy.maxEcusPerColony - ecusOn(c); ecus++) {
        const want = [...current, { p0TypeId: row.p0, ecus }];
        const result = colonyExtraction(c, want, pi, policy, fixedOn(c));
        if (result.status !== 'fits') break;
        const p1 = result.slots.find((s) => s.p0TypeId === row.p0)!.p1PerHour;
        best = { want, result, p1 };
        if (p1 >= remaining - EPSILON) break;
      }
      if (!best) continue;
      wants.set(c.planetId, best.want);
      fitted.set(c.planetId, best.result);
      extracted.set(row.p1, (extracted.get(row.p1) ?? 0) + best.p1);
      remaining -= best.p1;
    }
    if (remaining > EPSILON) unmet.set(row.p1, remaining);
  }

  // --- 4. Gaps -------------------------------------------------------------
  const buyP1 = policy.buyTiers.includes(1);
  const bought = new Map<number, number>();
  for (const row of p1Rows) {
    const short = unmet.get(row.p1);
    if (short === undefined) continue;
    if (buyP1) {
      bought.set(row.p1, short);
      continue;
    }
    const p0Units = short / row.p1PerP0;
    if (!ctx.colonies.some((c) => c.ratePerEcu.has(row.p0))) {
      const raw = pi.raw.find((r) => r.typeID === row.p0)!;
      shortfalls.push({
        kind: 'type-gap',
        p0TypeId: row.p0,
        p1TypeId: row.p1,
        unitsPerHour: p0Units,
        fixPlanetTypes: [...raw.planetTypes],
      });
    } else {
      shortfalls.push({
        kind: 'budget-gap',
        p0TypeId: row.p0,
        p1TypeId: row.p1,
        unitsPerHour: p0Units,
      });
    }
  }
  const p1Short = new Set(buyP1 ? [] : unmet.keys());

  // --- 5. Spare capacity and assignments -----------------------------------
  const spare = new Map<number, ExtractionSlot>();
  const assignments: ColonyAssignment[] = sortedColonies.map((c): ColonyAssignment => {
    const isHost = c === host && hostFit !== null;
    let fit = fitted.get(c.planetId) ?? null;
    if (fit || (isHost && hostBuilds)) {
      const current = wants.get(c.planetId) ?? [];
      const extra = spareSlot(c, current, fixedOn(c), ctx);
      if (extra) {
        const added = extra.slots.find((s) => !current.some((w) => w.p0TypeId === s.p0TypeId))!;
        spare.set(c.planetId, added);
        fit = extra;
      }
    }
    if (isHost) {
      const pinFit = fit ?? hostFit!;
      return {
        planetId: c.planetId,
        role: 'factory',
        slots: fit?.slots ?? [],
        factories: hostFactories,
        pins: pinFit.pins,
        used: pinFit.used,
        budget: pinFit.budget,
        limitedBy: hostFit!.limitedBy,
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
  const shortP0 = new Set(p1Rows.filter((r) => p1Short.has(r.p1)).map((r) => r.p0));
  const boughtP0 = new Set(p1Rows.filter((r) => bought.has(r.p1)).map((r) => r.p0));
  const isShort = (id: number, seen: ReadonlySet<number> = new Set()): boolean => {
    const tier = tierOf(id);
    if (tier === 0) return shortP0.has(id);
    if (tier === 1) return p1Short.has(id);
    if (!hostBuilds) return true;
    if (seen.has(id)) return false;
    const next = new Set(seen).add(id);
    return pi.schematics[String(id)].inputs.some((input) => isShort(input.typeID, next));
  };
  const lines: DemandLine[] = [...demand].map(([typeId, unitsPerHour]) => {
    const tier = tierOf(typeId);
    let source: DemandSource;
    if (isShort(typeId)) source = 'short';
    else if (tier === 0) source = boughtP0.has(typeId) ? 'bought' : 'extracted';
    else if (tier === 1 && bought.has(typeId)) source = 'bought';
    else source = 'made';
    return {
      typeId,
      tier,
      unitsPerHour,
      factories: factoriesFor(typeId, unitsPerHour, pi),
      source,
    };
  });
  for (const g of unhostedGoals) {
    const tier = tierOf(g.typeId);
    const unitsPerHour = g.unitsPerDay / HOURS_PER_DAY;
    lines.push({
      typeId: g.typeId,
      tier,
      unitsPerHour,
      factories: factoriesFor(g.typeId, unitsPerHour, pi),
      source: policy.buyTiers.includes(tier) ? 'bought' : 'short',
    });
  }
  lines.sort((a, b) => b.tier - a.tier || a.typeId - b.typeId);

  // --- Achieved rates ------------------------------------------------------
  const supplied = (p1: number) => (extracted.get(p1) ?? 0) + (bought.get(p1) ?? 0);
  const supplyFraction = (p1: number) => {
    const need = demand.get(p1) ?? 0;
    return need <= EPSILON ? 1 : Math.min(1, supplied(p1) / need);
  };
  const highGoals = host ? plannedGoals.filter((g) => tierOf(g.typeId) >= 2) : [];
  const highAchieved = highGoals.map((g) => {
    const chain = expandChain(g.typeId, pi, { unitsPerHour: g.unitsPerDay / HOURS_PER_DAY });
    // A host that cannot carry its factories makes nothing at all.
    const fraction = hostBuilds
      ? Math.min(1, ...chain.nodes.filter((n) => n.tier === 1).map((n) => supplyFraction(n.typeId)))
      : 0;
    return { typeId: g.typeId, unitsPerDay: g.unitsPerDay * fraction, fraction };
  });
  const hostUse = new Map<number, number>();
  expandInto(
    hostUse,
    highAchieved.filter((a) => a.unitsPerDay > 0)
  );

  const achieved: GoalPlan['achieved'] = goals.map((g) => {
    const target = g.unitsPerDay / HOURS_PER_DAY;
    const high = highAchieved.find((a) => a.typeId === g.typeId);
    if (high) {
      return { typeId: g.typeId, unitsPerHour: target * high.fraction, fraction: high.fraction };
    }
    if (unhostedGoals.includes(g)) {
      const fraction = policy.buyTiers.includes(tierOf(g.typeId)) ? 1 : 0;
      return { typeId: g.typeId, unitsPerHour: target * fraction, fraction };
    }
    // A P1 goal takes what is left of its type once the host is fed.
    const left = supplied(g.typeId) - (hostUse.get(g.typeId) ?? 0);
    const unitsPerHour = Math.max(0, Math.min(target, left));
    return { typeId: g.typeId, unitsPerHour, fraction: unitsPerHour / target };
  });

  // --- Flows ---------------------------------------------------------------
  const flows: Flow[] = [];
  const push = (from: FlowEnd, to: FlowEnd, typeId: number, unitsPerHour: number) => {
    if (unitsPerHour > EPSILON) {
      flows.push({ from, to, typeId, tier: tierOf(typeId), unitsPerHour });
    }
  };
  const hostLeft = new Map([...hostUse].filter(([id]) => tierOf(id) === 1));
  // The host feeds itself before anyone ships it anything. Spare slots are
  // not in `fitted`'s planned share: they go straight to the hub below.
  const feedOrder = [...sortedColonies].sort((a, b) => Number(b === host) - Number(a === host));
  for (const c of feedOrder) {
    const fit = fitted.get(c.planetId);
    if (!fit) continue;
    for (const slot of fit.slots) {
      const toHost = Math.min(slot.p1PerHour, hostLeft.get(slot.p1TypeId) ?? 0);
      if (host) push(c.planetId, host.planetId, slot.p1TypeId, toHost);
      hostLeft.set(slot.p1TypeId, (hostLeft.get(slot.p1TypeId) ?? 0) - toHost);
      push(c.planetId, 'hub', slot.p1TypeId, slot.p1PerHour - toHost);
    }
  }
  for (const [p1, units] of [...bought].sort(([a], [b]) => a - b)) {
    const toHost = Math.min(units, Math.max(0, hostLeft.get(p1) ?? 0));
    if (host) push('hub', host.planetId, p1, toHost);
    push('hub', 'hub', p1, units - toHost);
  }
  for (const a of highAchieved) {
    if (host) push(host.planetId, 'hub', a.typeId, a.unitsPerDay / HOURS_PER_DAY);
  }
  for (const g of unhostedGoals) {
    if (policy.buyTiers.includes(tierOf(g.typeId))) {
      push('hub', 'hub', g.typeId, g.unitsPerDay / HOURS_PER_DAY);
    }
  }
  // What the plan leaves alone sells: spare slots and whole Baseline colonies.
  for (const [planetId, slot] of spare) push(planetId, 'hub', slot.p1TypeId, slot.p1PerHour);
  for (const a of assignments) {
    if (a.role !== 'baseline') continue;
    for (const slot of a.slots) push(a.planetId, 'hub', slot.p1TypeId, slot.p1PerHour);
  }

  const surplusP1: GoalPlan['surplusP1'] = [];
  for (const [p1, units] of [...extracted].sort(([a], [b]) => a - b)) {
    const surplus = units - (hostUse.get(p1) ?? 0) - (p1GoalNeed.get(p1) ?? 0);
    if (surplus > EPSILON) surplusP1.push({ typeId: p1, unitsPerHour: surplus });
  }

  shortfalls.sort(compareShortfalls);
  return { achieved, demand: lines, assignments, factoryHost, shortfalls, flows, surplusP1 };
}

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

  const first = solve(goals, ctx);
  const allMet = first.achieved.every((a) => a.fraction >= 1 - EPSILON);
  // Second pass at the achieved rates: what no achieved production consumes is released.
  const final = allMet
    ? first
    : solve(
        first.achieved
          .filter((a) => a.unitsPerHour > EPSILON)
          .map((a) => ({ typeId: a.typeId, unitsPerDay: a.unitsPerHour * HOURS_PER_DAY })),
        ctx
      );
  const achieved: GoalPlan['achieved'] = goals.map((g) => {
    const target = g.unitsPerDay / HOURS_PER_DAY;
    const reached = final.achieved.find((a) => a.typeId === g.typeId)?.unitsPerHour ?? 0;
    return { typeId: g.typeId, unitsPerHour: reached, fraction: reached / target };
  });

  const buysByType = new Map<number, number>();
  for (const f of final.flows) {
    if (f.from === 'hub') {
      buysByType.set(f.typeId, (buysByType.get(f.typeId) ?? 0) + f.unitsPerHour);
    }
  }
  const buys = [...buysByType]
    .sort(([a], [b]) => a - b)
    .map(([typeId, unitsPerHour]) => ({ typeId, tier: piTier(typeId, pi), unitsPerHour }));

  // Hub-to-hub (bought and kept) and host-to-itself legs move nothing between places.
  let m3PerWeek = 0;
  const perColony = new Map<number, number>();
  for (const f of final.flows) {
    if (f.from === f.to) continue;
    const m3 = f.unitsPerHour * volumeOf(f.typeId, pi) * HOURS_PER_WEEK;
    m3PerWeek += m3;
    for (const end of [f.from, f.to]) {
      if (end !== 'hub') perColony.set(end, (perColony.get(end) ?? 0) + m3);
    }
  }

  return {
    goals,
    achieved,
    demand: first.demand,
    assignments: final.assignments,
    factoryHost: final.factoryHost,
    shortfalls: first.shortfalls,
    buys,
    surplusP1: final.surplusP1,
    flows: final.flows,
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
