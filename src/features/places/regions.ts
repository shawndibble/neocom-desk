/**
 * A region's name and a solar system's region, for Place Info. Both read the
 * bundled tables first (offline, no ESI); a region outside `regions.json`
 * (no market) falls back to the cached `resolveNames`. Each resolves to
 * `null` when it cannot answer, never throws.
 */
import { resolveNames } from '@/features/character/names';
import { loadMarketRegions } from '@/sde/loadMarketSde';
import { lookupSolarSystem } from '@/sde/solarSystems';

export async function loadRegionName(regionId: number): Promise<string | null> {
  const catalog = await loadMarketRegions().catch(() => []);
  const local = catalog.find((entry) => entry.id === regionId);
  if (local) return local.name;
  const resolved = await resolveNames([regionId]).catch(() => null);
  return resolved?.get(regionId) ?? null;
}

export async function loadSystemRegionId(systemId: number): Promise<number | null> {
  const entry = await lookupSolarSystem(systemId).catch(() => null);
  return entry?.regionId ?? null;
}
