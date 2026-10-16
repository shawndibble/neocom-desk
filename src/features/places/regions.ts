/**
 * A region's name and a solar system's region, for Place Info. Both read the
 * bundled tables first (offline, no ESI); a region outside `regions.json`
 * falls back to the cached `resolveNames` through `loadRouteRegionNames`.
 * Each resolves to `null` when it cannot answer, never throws.
 */
import { loadRouteRegionNames } from '@/features/route/routeSafetyData';
import { lookupSolarSystem } from '@/sde/solarSystems';

export async function loadRegionName(regionId: number): Promise<string | null> {
  const names = await loadRouteRegionNames([regionId]).catch(() => null);
  return names?.get(regionId) ?? null;
}

export async function loadSystemRegionId(systemId: number): Promise<number | null> {
  const entry = await lookupSolarSystem(systemId).catch(() => null);
  return entry?.regionId ?? null;
}
