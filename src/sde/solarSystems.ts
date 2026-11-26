import { loadSolarSystems } from './loadMarketSde';
import type { SolarSystemEntry } from './marketTypes';
import { memoizeAsync } from '@/lib/memoizeAsync';

export const loadSolarSystemsById = memoizeAsync(
  async (): Promise<ReadonlyMap<number, SolarSystemEntry>> => {
    const map = new Map<number, SolarSystemEntry>();
    for (const entry of await loadSolarSystems()) map.set(entry.id, entry);
    return map;
  },
  { fallback: null }
);

export async function lookupSolarSystem(
  systemId: number
): Promise<SolarSystemEntry | null | undefined> {
  const byId = await loadSolarSystemsById();
  if (!byId) return undefined;
  return byId.get(systemId) ?? null;
}

export const loadSolarSystemsByName = memoizeAsync(
  async (): Promise<ReadonlyMap<string, SolarSystemEntry>> => {
    const byId = await loadSolarSystemsById();
    if (!byId) throw new Error('solar system snapshot unavailable');
    return new Map([...byId.values()].map((entry) => [entry.name.toLowerCase(), entry]));
  },
  { fallback: null }
);

export async function lookupSolarSystemByName(
  name: string
): Promise<SolarSystemEntry | null | undefined> {
  const byName = await loadSolarSystemsByName();
  if (!byName) return undefined;
  return byName.get(name.trim().toLowerCase()) ?? null;
}

export function clearSolarSystemIndex(): void {
  loadSolarSystemsById.reset();
  loadSolarSystemsByName.reset();
}
