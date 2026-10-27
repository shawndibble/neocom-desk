/**
 * Which planets a product takes. A product's raw (P0) inputs each come from
 * some planet types; the fewest planets that cover every input is "needs N
 * planets". Pure: `pi.json` is a parameter.
 */
import type { PlanetType } from '@/engine/pi/goalTypes';
import { isP0 } from '@/engine/pi/chain';
import type { PiData } from '@/sde/types';

/** The P0 typeIDs a product ultimately needs, sorted. A raw is its own input. */
export function rawInputsOf(typeId: number, pi: PiData): number[] {
  const raws = new Set<number>();
  const seen = new Set<number>();
  const walk = (id: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (isP0(id, pi)) {
      raws.add(id);
      return;
    }
    for (const input of pi.schematics[String(id)]?.inputs ?? []) walk(input.typeID);
  };
  walk(typeId);
  return [...raws].sort((a, b) => a - b);
}

/** Every planet type that hosts at least one raw, sorted. */
export function planetTypesOf(pi: PiData): PlanetType[] {
  return [...new Set(pi.raw.flatMap((raw) => raw.planetTypes))].sort();
}

/** The planet types that yield a raw; empty for an unknown one. */
export function hostsOf(rawId: number, pi: PiData): readonly PlanetType[] {
  return pi.raw.find((raw) => raw.typeID === rawId)?.planetTypes ?? [];
}

/** Can planets of these types, between them, extract every raw the product needs? */
export function canMakeWith(typeId: number, pi: PiData, types: ReadonlySet<PlanetType>): boolean {
  return rawInputsOf(typeId, pi).every((raw) => hostsOf(raw, pi).some((type) => types.has(type)));
}

/**
 * The fewest planets (one of each type chosen) whose raws cover the product's
 * inputs; null when some input has no host at all.
 */
export function planetsNeeded(typeId: number, pi: PiData): number | null {
  const raws = rawInputsOf(typeId, pi);
  if (raws.length === 0) return null;
  const types = planetTypesOf(pi);
  const covers = (chosen: readonly PlanetType[]) =>
    raws.every((raw) => hostsOf(raw, pi).some((type) => chosen.includes(type)));
  const pick = (start: number, size: number, chosen: PlanetType[]): boolean => {
    if (chosen.length === size) return covers(chosen);
    for (let i = start; i < types.length; i += 1) {
      if (pick(i + 1, size, [...chosen, types[i]])) return true;
    }
    return false;
  };
  for (let size = 1; size <= types.length; size += 1) {
    if (pick(0, size, [])) return size;
  }
  return null;
}
