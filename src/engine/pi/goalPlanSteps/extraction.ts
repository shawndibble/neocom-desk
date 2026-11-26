import type { PiData } from '@/sde/types';
import { piTier } from '../chain';
import { colonyExtraction, type ExtractionWant } from '../colonyCapacity';
import type { Goal, PlannerColony, PlannerPolicy, RateSource } from '../goalTypes';
import type { PinCounts } from '../types';
import { EPSILON, expandInto, madeNodes, perHour, schematicOf } from './shared';

export interface P1Row {
  p1: number;
  p0: number;
  units: number;
  p1PerP0: number;
  eligible: PlannerColony[];
}

export type Wants = Map<number, ExtractionWant[]>;

export interface ExtractionProblem {
  pi: PiData;
  policy: PlannerPolicy;
  colonies: readonly PlannerColony[];
  demand: ReadonlyMap<number, number>;
  p1GoalNeed: ReadonlyMap<number, number>;
  plannedHigh: readonly Goal[];
  rows: readonly P1Row[];
  rowByP0: ReadonlyMap<number, P1Row>;
  host: PlannerColony | null;
  hostFactories: PinCounts;
  buyP1: boolean;
}

export function extractionProblem(args: {
  planned: readonly Goal[];
  colonies: readonly PlannerColony[];
  policy: PlannerPolicy;
  pi: PiData;
  host: PlannerColony | null;
  hostFactories: PinCounts;
}): ExtractionProblem {
  const { planned, policy, pi } = args;
  const tierOf = (id: number) => piTier(id, pi);
  const colonies = [...args.colonies].sort((a, b) => a.planetId - b.planetId);
  const demand = new Map<number, number>();
  expandInto(demand, planned, pi);
  const p1GoalNeed = new Map<number, number>();
  for (const g of planned) if (tierOf(g.typeId) === 1) p1GoalNeed.set(g.typeId, perHour(g));
  const rows = [...demand]
    .filter(([id]) => tierOf(id) === 1)
    .map(([p1, units]) => {
      const schematic = schematicOf(p1, pi);
      const input = schematic.inputs[0];
      const eligible = colonies.filter((c) => c.ratePerEcu.has(input.typeID));
      return {
        p1,
        p0: input.typeID,
        units,
        p1PerP0: schematic.quantity / input.quantity,
        eligible,
      };
    })
    .sort((a, b) => a.eligible.length - b.eligible.length || a.p0 - b.p0);
  return {
    pi,
    policy,
    colonies,
    demand,
    p1GoalNeed,
    plannedHigh: planned.filter((g) => tierOf(g.typeId) >= 2),
    rows,
    rowByP0: new Map(rows.map((r) => [r.p0, r])),
    host: args.host,
    hostFactories: args.hostFactories,
    buyP1: policy.buyTiers.includes(1),
  };
}

export function slotP1(
  problem: ExtractionProblem,
  c: PlannerColony,
  p0: number,
  ecus: number
): number {
  return (
    c.ratePerEcu.get(p0)!.unitsPerHour *
    (1 + problem.policy.extraEcuFactor * (ecus - 1)) *
    problem.rowByP0.get(p0)!.p1PerP0
  );
}

function ecusOn(state: Wants, c: PlannerColony): number {
  return (state.get(c.planetId) ?? []).reduce((s, w) => s + w.ecus, 0);
}

function fixedOn(problem: ExtractionProblem, c: PlannerColony): PinCounts {
  return c === problem.host ? problem.hostFactories : {};
}

function feedsHost(problem: ExtractionProblem, p1: number): boolean {
  return (problem.demand.get(p1) ?? 0) - (problem.p1GoalNeed.get(p1) ?? 0) > EPSILON;
}

const RATE_SOURCE_RANK: Readonly<Record<RateSource, number>> = {
  measured: 0,
  'own-mean': 1,
  assumed: 2,
};

const MAX_ROUNDS = 8;

export function fill(
  problem: ExtractionProblem,
  state: Wants,
  row: P1Row,
  remaining: number
): number {
  const { policy, pi, host } = problem;
  const pending = new Set(problem.rows.map((r) => r.p0).filter((p0) => p0 !== row.p0));
  const contention = (c: PlannerColony) => [...pending].filter((p0) => c.ratePerEcu.has(p0)).length;
  const hostFirst = (c: PlannerColony) => (c === host && feedsHost(problem, row.p1) ? 0 : 1);
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
    const had = existing ? slotP1(problem, c, row.p0, existing.ecus) : 0;
    let best: { want: ExtractionWant[]; gain: number } | null = null;
    const first = (existing?.ecus ?? 0) + 1;
    for (
      let ecus = first;
      ecus <= policy.maxEcusPerColony - ecusOn(state, c) + (existing?.ecus ?? 0);
      ecus++
    ) {
      const want = [...others, { p0TypeId: row.p0, ecus }];
      const result = colonyExtraction(c, want, pi, policy, fixedOn(problem, c));
      if (result.status !== 'fits') break;
      const gain = slotP1(problem, c, row.p0, ecus) - had;
      best = { want, gain };
      if (gain >= remaining - added - EPSILON) break;
    }
    if (!best) continue;
    state.set(c.planetId, best.want);
    added += best.gain;
  }
  return added;
}

export function extractedFrom(problem: ExtractionProblem, state: Wants): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of problem.colonies) {
    for (const w of state.get(c.planetId) ?? []) {
      const p1 = problem.rowByP0.get(w.p0TypeId)!.p1;
      out.set(p1, (out.get(p1) ?? 0) + slotP1(problem, c, w.p0TypeId, w.ecus));
    }
  }
  return out;
}

export interface Evaluation {
  extracted: Map<number, number>;
  supplied: (p1: number) => number;
  highFraction: Map<number, number>;
  hostUse: Map<number, number>;
  p1GoalReach: Map<number, number>;
  consumption: Map<number, number>;
  binding: Set<number>;
  score: number;
}

export function evaluate(problem: ExtractionProblem, state: Wants): Evaluation {
  const { demand, buyP1, pi, p1GoalNeed } = problem;
  const extracted = extractedFrom(problem, state);
  const supplied = (p1: number) =>
    buyP1 ? Math.max(extracted.get(p1) ?? 0, demand.get(p1) ?? 0) : (extracted.get(p1) ?? 0);
  const supplyFraction = (p1: number) => {
    const need = demand.get(p1) ?? 0;
    return need <= EPSILON ? 1 : Math.min(1, supplied(p1) / need);
  };
  const highFraction = new Map<number, number>();
  const binding = new Set<number>();
  for (const g of problem.plannedHigh) {
    const p1s = madeNodes(g, pi)
      .filter((n) => n.tier === 1)
      .map((n) => n.typeId);
    const fraction = Math.min(1, ...p1s.map(supplyFraction));
    highFraction.set(g.typeId, fraction);
    if (fraction < 1 - EPSILON) {
      p1s.filter((p1) => supplyFraction(p1) <= fraction + EPSILON).forEach((p1) => binding.add(p1));
    }
  }
  const hostUse = new Map<number, number>();
  expandInto(
    hostUse,
    problem.plannedHigh
      .map((g) => ({ ...g, unitsPerDay: g.unitsPerDay * highFraction.get(g.typeId)! }))
      .filter((g) => g.unitsPerDay > EPSILON),
    pi
  );
  const p1GoalReach = new Map<number, number>();
  for (const [p1, need] of p1GoalNeed) {
    const reach = Math.max(0, Math.min(need, supplied(p1) - (hostUse.get(p1) ?? 0)));
    p1GoalReach.set(p1, reach);
    if (reach < need - EPSILON) binding.add(p1);
  }
  const consumption = new Map<number, number>();
  for (const row of problem.rows) {
    consumption.set(row.p1, (hostUse.get(row.p1) ?? 0) + (p1GoalReach.get(row.p1) ?? 0));
  }
  const score =
    [...highFraction.values()].reduce((s, f) => s + f, 0) +
    [...p1GoalReach].reduce((s, [p1, reach]) => s + reach / p1GoalNeed.get(p1)!, 0);
  return { extracted, supplied, highFraction, hostUse, p1GoalReach, consumption, binding, score };
}

export function hostFirstOrder(
  colonies: readonly PlannerColony[],
  host: PlannerColony | null
): PlannerColony[] {
  return [...colonies].sort((a, b) => Number(b === host) - Number(a === host));
}

export function release(
  problem: ExtractionProblem,
  state: Wants,
  consumption: ReadonlyMap<number, number>
): void {
  const needed = new Map(consumption);
  for (const c of hostFirstOrder(problem.colonies, problem.host)) {
    const current = state.get(c.planetId);
    if (!current) continue;
    const kept: ExtractionWant[] = [];
    for (const w of [...current].sort((a, b) => a.p0TypeId - b.p0TypeId)) {
      const p1 = problem.rowByP0.get(w.p0TypeId)!.p1;
      const need = needed.get(p1) ?? 0;
      if (need <= EPSILON) continue;
      let ecus = w.ecus;
      for (let k = 1; k <= w.ecus; k++) {
        if (slotP1(problem, c, w.p0TypeId, k) >= need - EPSILON) {
          ecus = k;
          break;
        }
      }
      kept.push({ p0TypeId: w.p0TypeId, ecus });
      needed.set(p1, need - slotP1(problem, c, w.p0TypeId, ecus));
    }
    if (kept.length > 0) state.set(c.planetId, kept);
    else state.delete(c.planetId);
  }
}

export function copyWants(state: Wants): Wants {
  return new Map([...state].map(([k, v]) => [k, [...v]]));
}

export function solveExtraction(problem: ExtractionProblem): Evaluation & { wants: Wants } {
  let wants: Wants = new Map();
  for (const row of problem.rows) fill(problem, wants, row, row.units);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const before = evaluate(problem, wants);
    release(problem, wants, before.consumption);
    if (problem.buyP1) break;
    const trial = copyWants(wants);
    const after = evaluate(problem, trial);
    let added = 0;
    for (const row of problem.rows) {
      if (!after.binding.has(row.p1)) continue;
      added += fill(
        problem,
        trial,
        row,
        row.units - (extractedFrom(problem, trial).get(row.p1) ?? 0)
      );
    }
    if (added <= EPSILON || evaluate(problem, trial).score <= before.score + EPSILON) break;
    wants = trial;
  }
  const final = evaluate(problem, wants);
  release(problem, wants, final.consumption);
  return { ...evaluate(problem, wants), wants };
}
