/**
 * Solar-system name -> id, for a Build Plan's build system.
 *
 * Resolves a name the player has finished typing rather than powering an
 * autocomplete. The local solar-system table (`market/systems.json`, read by
 * `sde/solarSystems.ts`) is asked first, so a name resolves offline with its
 * security band and no ESI call. Only when that table cannot be read does it
 * fall back to ESI's `/universe/ids`, an exact, case-insensitive match.
 *
 * ESI-path resolutions are cached for the session under the lower-cased name:
 * system names never change, and a plan re-resolves the same one on every edit.
 */
import { postUniverseIds } from '@/esi/endpoints';
import { loadSystemSecurity } from '@/features/character/systemSecurity';
import { securityBand, type SecurityBand } from '@/engine/securityStatus';
import { lookupSolarSystemByName } from '@/sde/solarSystems';

export interface SolarSystemRef {
  id: number;
  /** ESI's own casing, not what the player typed. */
  name: string;
  /**
   * The system's security band, so naming a system settles the plan's rig
   * multiplier too. `null` only when `/universe/systems/{id}` could not be
   * reached and nothing was cached — the caller then keeps the band it has
   * rather than guessing a new one.
   */
  security: SecurityBand | null;
}

/** `null` caches a name ESI does not know, so a typo is not re-asked on every keystroke. */
const cache = new Map<string, SolarSystemRef | null>();

/** Test-only: production callers rely on system names being immutable. */
export function clearSystemLookupCache(): void {
  cache.clear();
}

/**
 * Resolves one system name. `null` for a blank or unknown name; `undefined`
 * when the name could not be checked at all (no local table and ESI
 * unreachable) — "couldn't check" is not "not found", and the caller words
 * them differently. Nothing here throws (a Build Plan edit must never blank
 * the results panel).
 */
export async function resolveSolarSystem(name: string): Promise<SolarSystemRef | null | undefined> {
  const trimmed = name.trim();
  if (trimmed === '') return null;
  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const local = await lookupSolarSystemByName(trimmed);
  if (local !== undefined) {
    // The table lists every system, so a miss in it is a real "not found".
    return local === null
      ? null
      : { id: local.id, name: local.name, security: securityBand(local.security) };
  }

  let found: SolarSystemRef | null = null;
  try {
    const result = await postUniverseIds([trimmed]);
    // ESI answers with every category that matched, and a system name can
    // collide with a corporation or alliance name (Amarr does). Only the
    // `systems` bucket is ever read.
    const match = result.systems?.find((s) => s.name.toLowerCase() === key) ?? null;
    if (match) {
      // A second, public, statically-cached read — the same
      // `/universe/systems/{id}` row the Assets badge and the corp structure
      // picker already share, so a system named twice costs one request.
      const status = await loadSystemSecurity(match.id);
      // An unreachable security lookup is the same kind of failure as an
      // unreachable `/universe/ids`, so it gets the same answer: return what we
      // have and cache nothing, or a band that failed once would stay null for
      // the rest of the session with no way to re-derive it.
      if (status === null) return { id: match.id, name: match.name, security: null };
      found = { id: match.id, name: match.name, security: securityBand(status) };
    }
  } catch {
    // An unreachable ESI is not a wrong name: leave it uncached so the next
    // edit retries instead of pinning "not found" for the session.
    return undefined;
  }
  cache.set(key, found);
  return found;
}
