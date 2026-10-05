/**
 * Step 3 of `planGoals` — where the P2+ factories go (`placeHost`) — and its
 * settle-up once release and refill (step 5) show what is actually made
 * (`settleHost`). Host ranking and step numbers are in the module header of
 * `../goalPlan.ts`.
 */
import type { PiData, PiFactoryKind } from '@/sde/types';
import type { ColonyBaseline } from '../baseline';
import { piTier } from '../chain';
import { fitPlannedPins } from '../colonyCapacity';
import type { FactoryHostReason, Goal, PlannerColony, Shortfall } from '../goalTypes';
import type { PinCounts } from '../types';
import type { GoalTriage } from './triage';
import { EPSILON, byId, expandInto, factoriesOf, madeNodes, schematicOf } from './shared';

export interface HostContext {
  colonies: readonly PlannerColony[];
  pi: PiData;
  /** Each colony's Baseline, read for the forfeit tie-break. */
  baselines: ReadonlyMap<number, ColonyBaseline>;
  /** Host here instead of choosing; see `PlanGoalsInput.hostPlanetId`. */
  hostPlanetId?: number;
}

function baselineIsk(result: ColonyBaseline | undefined): number {
  return result?.status === 'ok' ? result.iskPerHour : 0;
}

/** Colonies whose planet type carries every factory `madeHigh` needs. */
export function eligibleHosts(
  madeHigh: readonly number[],
  colonies: readonly PlannerColony[],
  pi: PiData
): PlannerColony[] {
  const schematics = madeHigh.map((id) => schematicOf(id, pi));
  return colonies.filter((c) => schematics.every((s) => s.planetTypes.includes(c.planetType)));
}

/** Every P2+ type these goals' chains make, ascending. */
export function madeHighOf(goals: readonly Goal[], pi: PiData): number[] {
  const made = new Set<number>();
  for (const g of goals) {
    for (const node of madeNodes(g, pi)) if (node.tier >= 2) made.add(node.typeId);
  }
  return [...made].sort(byId);
}

/**
 * The host for `madeHigh` (every P2+ type the plan makes), or null with the
 * factory kind that has nowhere to go.
 */
export function chooseHost(
  madeHigh: readonly number[],
  demandedP0: readonly number[],
  ctx: HostContext
): { host: PlannerColony; reason: FactoryHostReason } | { host: null; facility: PiFactoryKind } {
  const { colonies, pi } = ctx;
  const schematics = madeHigh.map((id) => schematicOf(id, pi));
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

export interface HostPlacement {
  host: PlannerColony | null;
  reason: FactoryHostReason | null;
  /** The P2+ factories fitted on `host`, at the goals' full rates. */
  factories: PinCounts;
  /** `no-factory-host` / `host-over-budget`, in the order found. */
  shortfalls: Shortfall[];
  /** Live P2+ goals that cannot be made: no host, or one that cannot be built. */
  dead: Goal[];
}

/**
 * Picks and fits the factory host for the goals `triage` leaves live. A
 * missing host is reported whatever else blocks a goal; a host whose
 * factories overrun it makes nothing.
 */
export function placeHost(
  goals: readonly Goal[],
  triage: GoalTriage,
  ctx: HostContext
): HostPlacement {
  const { colonies, pi } = ctx;
  const tierOf = (id: number) => piTier(id, pi);
  const shortfalls: Shortfall[] = [];
  const dead: Goal[] = [];
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
  if (liveHigh.length === 0) return { host: null, reason: null, factories: {}, shortfalls, dead };

  const liveDemand = new Map<number, number>();
  expandInto(liveDemand, triage.live, pi);
  const demandedP0 = [...liveDemand.keys()].filter((id) => tierOf(id) === 0).sort(byId);
  const choice = chooseHost(madeHighOf(liveHigh, pi), demandedP0, ctx);
  if (choice.host) {
    const highDemand = new Map<number, number>();
    expandInto(highDemand, liveHigh, pi);
    const factories = factoriesOf(highDemand, pi);
    const fit = fitPlannedPins(choice.host, factories, 0, pi);
    if (fit.fits) {
      return { host: choice.host, reason: choice.reason, factories, shortfalls, dead };
    }
    // A host that cannot carry its factories makes nothing at all.
    shortfalls.push({
      kind: 'host-over-budget',
      planetId: choice.host.planetId,
      limitedBy: fit.limitedBy,
    });
  } else if (!shortfalls.some((sf) => sf.kind === 'no-factory-host')) {
    shortfalls.push({ kind: 'no-factory-host', facility: choice.facility });
  }
  dead.push(...liveHigh);
  return { host: null, reason: null, factories: {}, shortfalls, dead };
}

export interface SettledHost {
  host: PlannerColony | null;
  reason: FactoryHostReason | null;
  /** The factories the achieved rates need; `{}` with no host. */
  factories: PinCounts;
  /** Each planned P2+ goal at the rate it actually reaches. */
  highAchieved: Goal[];
  /** Every chain node of `highAchieved`, per hour. */
  madeHighRates: Map<number, number>;
}

/**
 * After release and refill (step 5): the host at what it actually makes. Factories are
 * re-counted on the achieved rates, and a host that ends up making nothing is
 * an ordinary colony again.
 */
export function settleHost(
  plannedHigh: readonly Goal[],
  highFraction: ReadonlyMap<number, number>,
  host: PlannerColony | null,
  reason: FactoryHostReason | null,
  pi: PiData
): SettledHost {
  const highAchieved = plannedHigh.map((g) => ({
    ...g,
    unitsPerDay: g.unitsPerDay * (highFraction.get(g.typeId) ?? 0),
  }));
  const madeHighRates = new Map<number, number>();
  expandInto(
    madeHighRates,
    highAchieved.filter((a) => a.unitsPerDay > EPSILON),
    pi
  );
  if (host && ![...madeHighRates.values()].some((u) => u > EPSILON)) {
    // Nothing gets made: no host, and its colony is an ordinary one again.
    host = null;
    reason = null;
  }
  return {
    host,
    reason,
    factories: host ? factoriesOf(madeHighRates, pi) : {},
    highAchieved,
    madeHighRates,
  };
}
