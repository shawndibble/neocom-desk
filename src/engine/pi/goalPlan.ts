/**
 * The goal planner's solver: goals in, a **Goal Plan** out — what each colony
 * extracts or hosts, what is bought at the hub, and what cannot be covered.
 *
 * ## Greedy, and says so
 *
 * The scope decision fixes this as a greedy pass, not an optimiser. It is not
 * optimal; what makes it checkable is that every gap it leaves is named as a
 * `Shortfall` and every colony's role is a visible change against today. The
 * passes, in order:
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
 *    larger Powergrid, then CPU, then the lower planet id. **The host extracts
 *    nothing in milestone 1**: fitting extraction beside a factory floor on
 *    one Command Center is a second packing problem this pass does not solve.
 *    With no eligible colony, P2+ goals are not expanded at all — each is one
 *    `'short'` (or, if its tier is buyable, `'bought'`) line — and only P1
 *    goals are planned.
 *
 * 3. **Extraction.** Each demanded P1 is made from its P0 on an extractor
 *    colony (every colony but the host). P0s are taken scarcest first (fewest
 *    eligible colonies, then typeId), and each fills colonies in the order:
 *    fewest ECUs already planned, then fewest *other* still-unassigned
 *    demanded P0s the colony could yield (leave contested colonies for later),
 *    then the higher per-ECU rate, then the lower planet id. On each colony it
 *    adds the fewest ECUs that cover what is left, else the most that fit
 *    beside what the colony already runs — so a colony's second slot takes a
 *    different P0 before anything is called a budget gap. Whole ECUs overshoot;
 *    the overshoot is `surplusP1`, sold.
 *
 * 4. **Gaps.** P1 left uncovered is bought at the hub when the pilot allows
 *    buying P1. Otherwise it is a `Shortfall`, in P0 units: a **type gap**
 *    when no enabled colony's planet type yields that P0 at all (the fix is a
 *    planet of a listed type), else a **budget gap** (the fix is re-targeting
 *    or buying). Buying stops at P1 in milestone 1 — "buy at the lowest
 *    allowed tier" taken literally only when that tier is 1; a short P1 under
 *    a pilot who allows buying P2 but not P1 is still a shortfall, because
 *    working out how many P2s a short P1 strands is its own pass.
 *
 * 5. **Host fit.** The host's P2+ factories are fitted through
 *    `colonyCapacity.fitPlannedPins`, the same model extraction uses. An
 *    overrun is a `host-over-budget` shortfall, not a silent shrink.
 *
 * 6. Every other colony is **idle**.
 *
 * ## Flows are the ledger
 *
 * The plan carries every leg goods move on as a `Flow`, so `planEconomics`
 * prices legs rather than re-deriving routing, and hauling is read off the
 * same list. Extracted P1 goes to the host first (it is what the host is
 * for), then to the hub as a P1 goal or surplus; colonies fill the host in
 * planet-id order. Bought P1 lands on the host for the part the host still
 * lacks, and the rest is a P1 goal bought outright (`'hub'` → `'hub'`).
 * Hauling is m3 a week (`units/h × volume × 168`) over every leg once.
 *
 * Pure: `PiData`, colonies, policy and goals are parameters. `books` is part
 * of the input contract for the caller's convenience, but the assignment is
 * deliberately price-free — prices are `planEconomics`'s job, so the same
 * plan is costed against whatever book the pilot switches to.
 */

import type { PiData, PiFactoryKind } from '@/sde/types';
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
  Flow,
  FlowEnd,
  Goal,
  GoalPlan,
  PlannerColony,
  PlannerPolicy,
  PriceBooks,
  Shortfall,
} from './goalTypes';
import { singleFactoryRate } from './pinBudget';

export interface PlanGoalsInput {
  goals: readonly Goal[];
  colonies: readonly PlannerColony[];
  policy: PlannerPolicy;
  /** Not read by the solver; see the module header. */
  books?: PriceBooks;
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

/**
 * The host for `madeHigh` (every P2+ type the plan makes), or null with the
 * factory kind that has nowhere to go.
 */
function chooseHost(
  madeHigh: readonly number[],
  demandedP0: readonly number[],
  colonies: readonly PlannerColony[],
  pi: PiData
):
  | { host: PlannerColony; reason: 'only-eligible' | 'least-needed-extraction' }
  | { host: null; facility: PiFactoryKind } {
  const schematics = madeHigh.map((id) => pi.schematics[String(id)]);
  const eligible = colonies.filter((c) =>
    schematics.every((s) => s.planetTypes.includes(c.planetType))
  );
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
  const ranked = [...eligible].sort(
    (a, b) =>
      score(a) - score(b) ||
      b.budget.powergrid - a.budget.powergrid ||
      b.budget.cpu - a.budget.cpu ||
      a.planetId - b.planetId
  );
  return {
    host: ranked[0],
    reason: eligible.length === 1 ? 'only-eligible' : 'least-needed-extraction',
  };
}

export function planGoals(input: PlanGoalsInput, pi: PiData): GoalPlan {
  const { colonies, policy } = input;
  const goals = normaliseGoals(input.goals, pi);
  const tierOf = (id: number) => piTier(id, pi);
  const sortedColonies = [...colonies].sort((a, b) => a.planetId - b.planetId);

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
    const choice = chooseHost(madeHigh, demandedP0, sortedColonies, pi);
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

  // Where each P1 is wanted: by the host's factories, or as a goal of its own.
  const p1GoalNeed = new Map<number, number>();
  for (const g of plannedGoals) {
    if (tierOf(g.typeId) === 1) p1GoalNeed.set(g.typeId, g.unitsPerDay / HOURS_PER_DAY);
  }
  const p1Demand = [...demand].filter(([id]) => tierOf(id) === 1);
  const p1HostNeed = new Map<number, number>(
    p1Demand
      .map(([id, units]) => [id, units - (p1GoalNeed.get(id) ?? 0)] as [number, number])
      .filter(([, units]) => units > EPSILON)
  );

  // --- 3. Extraction -------------------------------------------------------
  const extractors = sortedColonies.filter((c) => c !== host);
  const p0Of = (p1: number) => pi.schematics[String(p1)].inputs[0];
  const p1Rows = p1Demand
    .map(([p1, units]) => {
      const input = p0Of(p1);
      const p1PerP0 = pi.schematics[String(p1)].quantity / input.quantity;
      const eligible = extractors.filter((c) => c.ratePerEcu.has(input.typeID));
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
    const order = [...row.eligible].sort(
      (a, b) =>
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
        const result = colonyExtraction(c, want, pi, policy);
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
    if (!colonies.some((c) => c.ratePerEcu.has(row.p0))) {
      const raw = pi.raw.find((r) => r.typeID === row.p0)!;
      shortfalls.push({
        kind: 'type-gap',
        p0TypeId: row.p0,
        unitsPerHour: p0Units,
        fixPlanetTypes: [...raw.planetTypes],
      });
    } else {
      shortfalls.push({ kind: 'budget-gap', p0TypeId: row.p0, unitsPerHour: p0Units });
    }
  }
  const p1Short = new Set(buyP1 ? [] : unmet.keys());

  // --- 5. Host fit ---------------------------------------------------------
  const hostFactories: Partial<Record<PiFactoryKind, number>> = {};
  for (const [id, units] of demand) {
    if (tierOf(id) < 2) continue;
    const facility = pi.schematics[String(id)].facility;
    hostFactories[facility] = (hostFactories[facility] ?? 0) + factoriesFor(id, units, pi)!;
  }
  const hostFit = host ? fitPlannedPins(host, hostFactories, 0, pi) : null;
  if (host && hostFit && !hostFit.fits) {
    shortfalls.push({
      kind: 'host-over-budget',
      planetId: host.planetId,
      limitedBy: hostFit.limitedBy,
    });
  }

  // --- 6. Assignments ------------------------------------------------------
  const assignments: ColonyAssignment[] = sortedColonies.map((c) => {
    if (c === host && hostFit) {
      return {
        planetId: c.planetId,
        role: 'factory',
        slots: [],
        factories: hostFactories,
        pins: hostFit.pins,
        used: hostFit.used,
        budget: hostFit.budget,
        limitedBy: hostFit.limitedBy,
      };
    }
    const fit = fitted.get(c.planetId);
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

  // --- Flows ---------------------------------------------------------------
  const flows: Flow[] = [];
  const push = (from: FlowEnd, to: FlowEnd, typeId: number, unitsPerHour: number) => {
    if (unitsPerHour > EPSILON)
      flows.push({ from, to, typeId, tier: tierOf(typeId), unitsPerHour });
  };
  const hostLeft = new Map(p1HostNeed);
  const surplusP1: GoalPlan['surplusP1'] = [];
  for (const c of sortedColonies) {
    const fit = fitted.get(c.planetId);
    if (!fit) continue;
    for (const slot of fit.slots) {
      const toHost = Math.min(slot.p1PerHour, hostLeft.get(slot.p1TypeId) ?? 0);
      if (host) push(c.planetId, host.planetId, slot.p1TypeId, toHost);
      hostLeft.set(slot.p1TypeId, (hostLeft.get(slot.p1TypeId) ?? 0) - toHost);
      push(c.planetId, 'hub', slot.p1TypeId, slot.p1PerHour - toHost);
    }
  }
  for (const [p1, units] of extracted) {
    const surplus = units - (demand.get(p1) ?? 0);
    if (surplus > EPSILON) surplusP1.push({ typeId: p1, unitsPerHour: surplus });
  }
  surplusP1.sort((a, b) => a.typeId - b.typeId);
  for (const [p1, units] of [...bought].sort(([a], [b]) => a - b)) {
    const toHost = Math.min(units, Math.max(0, hostLeft.get(p1) ?? 0));
    if (host) push('hub', host.planetId, p1, toHost);
    push('hub', 'hub', p1, units - toHost);
  }
  if (host) {
    for (const g of plannedGoals) {
      if (tierOf(g.typeId) >= 2)
        push(host.planetId, 'hub', g.typeId, g.unitsPerDay / HOURS_PER_DAY);
    }
  }
  for (const g of unhostedGoals) {
    if (policy.buyTiers.includes(tierOf(g.typeId))) {
      push('hub', 'hub', g.typeId, g.unitsPerDay / HOURS_PER_DAY);
    }
  }

  const buysByType = new Map<number, number>();
  for (const f of flows) {
    if (f.from === 'hub')
      buysByType.set(f.typeId, (buysByType.get(f.typeId) ?? 0) + f.unitsPerHour);
  }
  const buys = [...buysByType]
    .sort(([a], [b]) => a - b)
    .map(([typeId, unitsPerHour]) => ({ typeId, tier: tierOf(typeId), unitsPerHour }));

  // --- Hauling -------------------------------------------------------------
  let m3PerWeek = 0;
  const perColony = new Map<number, number>();
  for (const f of flows) {
    if (f.from === 'hub' && f.to === 'hub') continue;
    const m3 = f.unitsPerHour * volumeOf(f.typeId, pi) * HOURS_PER_WEEK;
    m3PerWeek += m3;
    for (const end of [f.from, f.to]) {
      if (end !== 'hub') perColony.set(end, (perColony.get(end) ?? 0) + m3);
    }
  }

  shortfalls.sort(compareShortfalls);
  return {
    goals,
    demand: lines,
    assignments,
    factoryHost,
    shortfalls,
    buys,
    surplusP1,
    flows,
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
