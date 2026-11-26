import { postUniverseIds } from '@/esi/endpoints';
import { loadSystemSecurity } from '@/features/character/systemSecurity';
import { securityBand, type SecurityBand } from '@/engine/securityStatus';
import { lookupSolarSystemByName } from '@/sde/solarSystems';

export interface SolarSystemRef {
  id: number;
  name: string;
  security: SecurityBand | null;
}

const cache = new Map<string, SolarSystemRef | null>();

export function clearSystemLookupCache(): void {
  cache.clear();
}

export type SolarSystemResolution =
  { status: 'found'; system: SolarSystemRef } | { status: 'notFound' } | { status: 'unavailable' };

const NOT_FOUND: SolarSystemResolution = { status: 'notFound' };
const UNAVAILABLE: SolarSystemResolution = { status: 'unavailable' };

export async function resolveSolarSystem(name: string): Promise<SolarSystemResolution> {
  const trimmed = name.trim();
  if (trimmed === '') return NOT_FOUND;
  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached === null ? NOT_FOUND : { status: 'found', system: cached };
  }

  const local = await lookupSolarSystemByName(trimmed);
  if (local) {
    return {
      status: 'found',
      system: { id: local.id, name: local.name, security: securityBand(local.security) },
    };
  }

  let found: SolarSystemRef | null = null;
  try {
    const result = await postUniverseIds([trimmed]);
    const match = result.systems?.find((s) => s.name.toLowerCase() === key) ?? null;
    if (match) {
      const status = await loadSystemSecurity(match.id);
      if (status === null) {
        return { status: 'found', system: { id: match.id, name: match.name, security: null } };
      }
      found = { id: match.id, name: match.name, security: securityBand(status) };
    }
  } catch {
    return UNAVAILABLE;
  }
  cache.set(key, found);
  return found === null ? NOT_FOUND : { status: 'found', system: found };
}
