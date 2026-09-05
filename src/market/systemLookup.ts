/**
 * Solar-system name -> id, for a Build Plan's build system.
 *
 * ESI's `/universe/ids` is an exact, case-insensitive match, not a search, so
 * this resolves a name the player has finished typing rather than powering an
 * autocomplete. The bundled SDE carries no system table (src/sde is market
 * types and blueprints only), and naming all ~5000 systems that appear in the
 * cost-index response would cost six `/universe/names` posts per session for a
 * list the player needs one entry of.
 *
 * Resolutions are cached for the session under the lower-cased name: system
 * names never change, and a plan re-resolves the same one on every edit.
 */
import { postUniverseIds } from '@/esi/endpoints';
import { loadSystemSecurity } from '@/features/character/systemSecurity';
import { securityBand, type SecurityBand } from '@/engine/securityStatus';

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
 * Resolves one system name. `null` for a blank name, an unknown name, or an
 * ESI failure — the caller shows "not found" either way, and nothing here
 * throws (a Build Plan edit must never blank the results panel).
 */
export async function resolveSolarSystem(name: string): Promise<SolarSystemRef | null> {
  const trimmed = name.trim();
  if (trimmed === '') return null;
  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

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
      found = {
        id: match.id,
        name: match.name,
        security: status === null ? null : securityBand(status),
      };
    }
  } catch {
    // An unreachable ESI is not a wrong name: leave it uncached so the next
    // edit retries instead of pinning "not found" for the session.
    return null;
  }
  cache.set(key, found);
  return found;
}
