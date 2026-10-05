/**
 * Units, tolerances and SDE lookups every goal-planner step shares. See
 * `../goalPlan.ts` for how the steps compose.
 */
import type { PiData, PiFactoryKind, PiRawResource, PiSchematic } from '@/sde/types';
import { expandChain, piTier } from '../chain';
import type { Goal } from '../goalTypes';
import { singleFactoryRate } from '../pinBudget';

export const HOURS_PER_DAY = 24;
export const HOURS_PER_WEEK = 168;
/** Below this a remaining rate is float dust, not demand. */
export const EPSILON = 1e-9;

export function byId(a: number, b: number): number {
  return a - b;
}

/**
 * SDE lookups the planner never expects to miss: every id it asks about came
 * out of the same `PiData`. A miss is broken data, so it throws naming the type
 * rather than letting `undefined` surface as a NaN somewhere downstream.
 */
export function sdeMiss(what: string, typeId: number): never {
  throw new Error(`pi.json has no ${what} for type ${typeId}`);
}

export function schematicOf(typeId: number, pi: PiData): PiSchematic {
  return pi.schematics[String(typeId)] ?? sdeMiss('planetary schematic', typeId);
}

export function rawOf(typeId: number, pi: PiData): PiRawResource {
  return pi.raw.find((r) => r.typeID === typeId) ?? sdeMiss('P0 resource', typeId);
}

export function factoriesFor(typeId: number, unitsPerHour: number, pi: PiData): number | null {
  const rate = singleFactoryRate(typeId, pi);
  return rate === null ? null : Math.ceil(unitsPerHour / rate - EPSILON);
}

export function perHour(g: Goal): number {
  return g.unitsPerDay / HOURS_PER_DAY;
}

/** Adds every chain node of `list` into `into`, summing rates per type. */
export function expandInto(into: Map<number, number>, list: readonly Goal[], pi: PiData): void {
  for (const g of list) {
    const chain = expandChain(g.typeId, pi, { unitsPerHour: perHour(g) });
    for (const node of chain.nodes) {
      into.set(node.typeId, (into.get(node.typeId) ?? 0) + node.unitsPerHour);
    }
  }
}

/** P2+ factory pins for these per-type rates, by factory kind. */
export function factoriesOf(
  rates: ReadonlyMap<number, number>,
  pi: PiData
): Partial<Record<PiFactoryKind, number>> {
  const out: Partial<Record<PiFactoryKind, number>> = {};
  for (const [id, units] of rates) {
    if (piTier(id, pi) < 2 || units <= EPSILON) continue;
    const facility = schematicOf(id, pi).facility;
    out[facility] =
      (out[facility] ?? 0) + (factoriesFor(id, units, pi) ?? sdeMiss('factory rate', id));
  }
  return out;
}
