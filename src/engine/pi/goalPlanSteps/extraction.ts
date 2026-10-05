/**
 * Steps 4 and 5 of `planGoals`: greedy extraction (`fill`), then release and
 * refill until no goal gets further (`solveExtraction`). The fill order and
 * the release/refill rule are in the module header of `../goalPlan.ts`.
 *
 * Every function takes the `ExtractionProblem` it works on explicitly. Its
 * `host` is the one the factories were placed on in step 3 (`placeHost`) — not
 * the settled host (`settleHost`), which may differ.
 */
import type { PiData } from '@/sde/types';
import { expandChain, piTier } from '../chain';
import { colonyExtraction, type ExtractionWant } from '../colonyCapacity';
import type { Goal, PlannerColony, PlannerPolicy, RateSource } from '../goalTypes';
import type { PinCounts } from '../types';
import { EPSILON, expandInto, perHour, schematicOf } from './shared';

/** One demanded P1 and the colonies that could extract its P0. */
export interface P1Row {
  p1: number;
  p0: number;
  /** P1 units/h the planned goals need. */
  units: number;
  p1PerP0: number;
  /** Colonies that yield `p0`, by planet id. */
  eligible: PlannerColony[];
}

/** Planned extraction, per planet id. */
export type Wants = Map<number, ExtractionWant[]>;

export interface ExtractionProblem {
  pi: PiData;
  policy: PlannerPolicy;
  /** Every colony, by planet id. */
  colonies: readonly PlannerColony[];
  /** Every chain node of the planned goals, per hour. */
  demand: ReadonlyMap<number, number>;
  /** Per P1 goal, its target units/h. */
  p1GoalNeed: ReadonlyMap<number, number>;
  plannedHigh: readonly Goal[];
  /** Demanded P1s, scarcest P0 first (fewest eligible colonies, then typeId). */
  rows: readonly P1Row[];
  rowByP0: ReadonlyMap<number, P1Row>;
  /** The placed host (step 3) and the factories it carries, or null and `{}`. */
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

/** P1/h `ecus` ECUs on `p0` make on `c`. */
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

/** True when the host's factories consume some of `p1` (beyond a P1 goal of it). */
function feedsHost(problem: ExtractionProblem, p1: number): boolean {
  return (problem.demand.get(p1) ?? 0) - (problem.p1GoalNeed.get(p1) ?? 0) > EPSILON;
}

/** Strongest rate source first. */
const RATE_SOURCE_RANK: Readonly<Record<RateSource, number>> = {
  measured: 0,
  'own-mean': 1,
  assumed: 2,
};

/** Most release/refill rounds; it converges in two or three on real colonies. */
const MAX_ROUNDS = 8;

/**
 * Greedy: add `row`'s P0 to colonies in the documented order until
 * `remaining` P1/h is covered or nothing more fits. Mutates `state`;
 * returns the P1/h added.
 */
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

/** P1/h extracted per P1 type on `state`. */
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
  /** Per planned P2+ goal, the fraction of its target reached. */
  highFraction: Map<number, number>;
  /** P1/P2+ units/h the host consumes at those fractions. */
  hostUse: Map<number, number>;
  /** Per P1 goal, the units/h it reaches. */
  p1GoalReach: Map<number, number>;
  /** Per demanded P1, units/h actually consumed. */
  consumption: Map<number, number>;
  /** P1s that hold some goal back. */
  binding: Set<number>;
  /** Sum of every goal's reached fraction; what a refill round must raise. */
  score: number;
}

/**
 * What the goals reach on `state`'s extraction: each P2+ goal at its
 * scarcest P1's supply fraction (a shared short P1 rationed proportionally),
 * the host consuming exactly what those rates need, and each P1 goal taking
 * what is left of its type.
 */
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
    const p1s = expandChain(g.typeId, pi, { unitsPerHour: perHour(g) })
      .nodes.filter((n) => n.tier === 1)
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
      .map((g) => ({
        typeId: g.typeId,
        unitsPerDay: g.unitsPerDay * highFraction.get(g.typeId)!,
      }))
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

/** Colonies with `host` first, then by planet id: the host feeds itself before anyone ships it anything. */
export function hostFirstOrder(
  colonies: readonly PlannerColony[],
  host: PlannerColony | null
): PlannerColony[] {
  return [...colonies].sort((a, b) => Number(b === host) - Number(a === host));
}

/** Drop or shrink every slot beyond what `consumption` needs; the host's own slots are kept first. */
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

/**
 * Fill every row, then release extraction nothing consumes and try to raise
 * whatever binds — keeping a round only if some goal actually got further.
 * Returns the final extraction and what the goals reach on it.
 */
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
