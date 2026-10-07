/**
 * Units, tolerances and SDE lookups every goal-planner step shares. See
 * `../goalPlan.ts` for how the steps compose.
 */
import type { PiData, PiFactoryKind, PiRawResource, PiSchematic } from '@/sde/types';
import { piTier } from '../chain';
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

export interface ChainRates {
  /** Units/h of each chain type the plan makes, P0 included. */
  made: Map<number, number>;
  /** Units/h of each P2+ chain type bought at the hub, the goal's own type included. */
  bought: Map<number, number>;
}

/**
 * A goal's chain at its rate, split into what is made and what is bought
 * (`Goal.buyShare`). Nothing beneath a bought share is demanded: the P1 and P0
 * under a bought P2 are not extracted for it.
 */
export function chainRates(g: Goal, pi: PiData): ChainRates {
  const made = new Map<number, number>();
  const bought = new Map<number, number>();
  const walk = (typeId: number, need: number): void => {
    const share = g.buyShare?.get(typeId) ?? 0;
    const buy = need * share;
    const make = need - buy;
    if (buy > EPSILON) bought.set(typeId, (bought.get(typeId) ?? 0) + buy);
    if (make <= EPSILON) return;
    made.set(typeId, (made.get(typeId) ?? 0) + make);
    const schematic = pi.schematics[String(typeId)];
    if (!schematic) return;
    for (const input of schematic.inputs) {
      walk(input.typeID, (make * input.quantity) / schematic.quantity);
    }
  };
  walk(g.typeId, perHour(g));
  return { made, bought };
}

/** The chain's made nodes: `{ typeId, tier, unitsPerHour }`, highest tier first. */
export function madeNodes(
  g: Goal,
  pi: PiData
): { typeId: number; tier: number; unitsPerHour: number }[] {
  return [...chainRates(g, pi).made]
    .map(([typeId, unitsPerHour]) => ({ typeId, tier: piTier(typeId, pi), unitsPerHour }))
    .sort((a, b) => b.tier - a.tier || a.typeId - b.typeId);
}

/** Adds every made chain node of `list` into `into`, summing rates per type. */
export function expandInto(into: Map<number, number>, list: readonly Goal[], pi: PiData): void {
  for (const g of list) {
    for (const [typeId, units] of chainRates(g, pi).made) {
      into.set(typeId, (into.get(typeId) ?? 0) + units);
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
