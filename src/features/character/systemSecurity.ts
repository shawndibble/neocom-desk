/**
 * Solar-system security status for Assets' station-header badge (issue
 * #148), and solar-system name for the "in space" location label: GET
 * /universe/systems/{id} is public and cacheable (see cache.ts), same shape
 * as `stations.ts`'s station-name lookup. Both readers share one cached
 * fetch per system id.
 *
 * Name and security are read from the bundled solar-system table
 * (`sde/solarSystems.ts`) first, so they resolve offline and without an ESI
 * request; ESI is the fallback for a table that cannot be read or lacks the id.
 * Only the planet list still needs ESI.
 */
import { getUniverseSystem, type UniverseSystem } from '@/esi/endpoints';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { loadStaticEntity } from '@/esi/cache';

async function loadSystem(systemId: number): Promise<UniverseSystem | null> {
  // A solar system's name and security status are map constants.
  const result = await loadStaticEntity('system', systemId, getUniverseSystem);
  return result?.data ?? null;
}

/** The local table's name and security for a system, or null when it cannot answer. */
async function loadLocalSystem(
  systemId: number
): Promise<{ name: string; security: number } | null> {
  const entry = await lookupSolarSystem(systemId);
  return entry ? { name: entry.name, security: entry.security } : null;
}

/** A solar system's security status, or null if unresolvable (offline + uncached). */
export async function loadSystemSecurity(systemId: number): Promise<number | null> {
  const local = await loadLocalSystem(systemId);
  if (local) return local.security;
  return (await loadSystem(systemId))?.security_status ?? null;
}

/** A solar system's name, or null if unresolvable (offline + uncached). */
export async function loadSystemName(systemId: number): Promise<string | null> {
  const local = await loadLocalSystem(systemId);
  if (local) return local.name;
  return (await loadSystem(systemId))?.name ?? null;
}

export interface SystemNameAndSecurity {
  name: string | null;
  security: number | null;
}

/**
 * Both fields off one cached `/universe/systems/{id}` read, for a caller
 * (Moon Mining's row list) that wants name and security together — calling
 * `loadSystemName` and `loadSystemSecurity` separately per system would be
 * two round trips through `loadWithCache` for what is the same underlying row.
 */
export async function loadSystemNameAndSecurity(systemId: number): Promise<SystemNameAndSecurity> {
  const local = await loadLocalSystem(systemId);
  if (local) return { name: local.name, security: local.security };
  const system = await loadSystem(systemId);
  return { name: system?.name ?? null, security: system?.security_status ?? null };
}
