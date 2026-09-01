/**
 * Active character's current solar system, for jumps-away distances on the
 * Assets page (issue #87): fetched once per page load via ESI, never polled.
 *
 * `esi-location.read_location.v1` was added to the registry alongside this
 * loader, so a character who logged in before it existed hasn't granted it
 * yet — a 403 here is exactly `structures.ts`'s "not on the ACL" situation,
 * not a real auth failure, so it must not trip the shell-wide re-auth banner
 * for what is only a secondary enhancement to the page. Only a 401 (or a
 * failed token refresh) counts.
 */
import { AuthError } from '@/auth/sso';
import { getCharacterLocation } from '@/esi/endpoints';
import { EsiError } from '@/esi/client';
import { loadWithCache } from '@/esi/cache';

function cacheKey(): string {
  return 'characterLocation';
}

/** The character's current solar system id, or null if unresolvable (missing grant, offline, or uncached). */
export async function loadCharacterSolarSystemId(characterId: number): Promise<number | null> {
  const result = await loadWithCache(
    characterId,
    cacheKey(),
    async () => (await getCharacterLocation(characterId)).data?.solar_system_id ?? null,
    {
      detectAuthFailure: (err) =>
        err instanceof AuthError || (err instanceof EsiError && err.status === 401),
    }
  );
  return result?.data ?? null;
}
