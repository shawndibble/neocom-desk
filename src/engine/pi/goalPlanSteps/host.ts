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
  baselines: ReadonlyMap<number, ColonyBaseline>;
  hostPlanetId?: number;
}

function baselineIsk(result: ColonyBaseline | undefined): number {
  return result?.status === 'ok' ? result.iskPerHour : 0;
}

export function eligibleHosts(
  madeHigh: readonly number[],
  colonies: readonly PlannerColony[],
  pi: PiData
): PlannerColony[] {
  const schematics = madeHigh.map((id) => schematicOf(id, pi));
  return colonies.filter((c) => schematics.every((s) => s.planetTypes.includes(c.planetType)));
}

export function madeHighOf(goals: readonly Goal[], pi: PiData): number[] {
  const made = new Set<number>();
  for (const g of goals) {
    for (const node of madeNodes(g, pi)) if (node.tier >= 2) made.add(node.typeId);
  }
  return [...made].sort(byId);
}

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
  factories: PinCounts;
  shortfalls: Shortfall[];
  dead: Goal[];
}

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
  factories: PinCounts;
  highAchieved: Goal[];
  madeHighRates: Map<number, number>;
}

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
