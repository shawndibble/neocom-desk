import { byNumericId } from '../../compare';
import type { PiData, PiFactoryKind, PiRawResource, PiSchematic } from '@/sde/types';
import { piTier } from '../chain';
import type { Goal } from '../goalTypes';
import { singleFactoryRate } from '../pinBudget';
import { rawById } from '../rawIndex';

export const HOURS_PER_DAY = 24;
export const HOURS_PER_WEEK = 168;
export const EPSILON = 1e-9;

export const byId = byNumericId;

export function sdeMiss(what: string, typeId: number): never {
  throw new Error(`pi.json has no ${what} for type ${typeId}`);
}

export function schematicOf(typeId: number, pi: PiData): PiSchematic {
  return pi.schematics[String(typeId)] ?? sdeMiss('planetary schematic', typeId);
}

export function rawOf(typeId: number, pi: PiData): PiRawResource {
  return rawById(pi).get(typeId) ?? sdeMiss('P0 resource', typeId);
}

export function factoriesFor(typeId: number, unitsPerHour: number, pi: PiData): number | null {
  const rate = singleFactoryRate(typeId, pi);
  return rate === null ? null : Math.ceil(unitsPerHour / rate - EPSILON);
}

export function perHour(g: Goal): number {
  return g.unitsPerDay / HOURS_PER_DAY;
}

export interface ChainRates {
  made: Map<number, number>;
  bought: Map<number, number>;
}

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

export function madeNodes(
  g: Goal,
  pi: PiData
): { typeId: number; tier: number; unitsPerHour: number }[] {
  return [...chainRates(g, pi).made]
    .map(([typeId, unitsPerHour]) => ({ typeId, tier: piTier(typeId, pi), unitsPerHour }))
    .sort((a, b) => b.tier - a.tier || a.typeId - b.typeId);
}

export function expandInto(into: Map<number, number>, list: readonly Goal[], pi: PiData): void {
  for (const g of list) {
    for (const [typeId, units] of chainRates(g, pi).made) {
      into.set(typeId, (into.get(typeId) ?? 0) + units);
    }
  }
}

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
