import type { PlanetType } from '@/engine/pi/goalTypes';
import { isP0 } from '@/engine/pi/chain';
import type { PiData } from '@/sde/types';

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

export function planetTypesOf(pi: PiData): PlanetType[] {
  return [...new Set(pi.raw.flatMap((raw) => raw.planetTypes))].sort();
}

export function hostsOf(rawId: number, pi: PiData): readonly PlanetType[] {
  return pi.raw.find((raw) => raw.typeID === rawId)?.planetTypes ?? [];
}

export function canMakeWith(typeId: number, pi: PiData, types: ReadonlySet<PlanetType>): boolean {
  return rawInputsOf(typeId, pi).every((raw) => hostsOf(raw, pi).some((type) => types.has(type)));
}

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
