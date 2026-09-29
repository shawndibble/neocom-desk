/** Fetch + cache layer for the Clones view. */
import { getCharacterClones, type CharacterClones } from '@/esi/endpoints';
import { loadUniverseType } from '@/features/skills/data';
import { typeDescription } from '@/features/skills/typeDisplay';
import { conditionalFetch, loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'clones';

/**
 * Jump clones, home location and last-jump timestamp. ESI or cache, with the
 * auth-failure state exposed so the view can offer a re-login instead of a
 * silent empty state when the clones scope was revoked.
 */
export function loadCharacterClones(characterId: number): Promise<StatusResult<CharacterClones>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterClones(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

/**
 * Markup-stripped descriptions for implant types, keyed by typeID. A failed
 * lookup or an empty description leaves the id absent, so the caller renders
 * the bare name rather than an empty tooltip. `loadUniverseType` already
 * retries once; a still-failing id never rejects the whole snapshot.
 */
export async function loadImplantDescriptions(
  typeIds: readonly number[]
): Promise<Map<number, string>> {
  const unique = [...new Set(typeIds)];
  const types = await Promise.all(unique.map((id) => loadUniverseType(id).catch(() => null)));
  const map = new Map<number, string>();
  unique.forEach((id, i) => {
    const description = typeDescription(types[i]?.data?.description);
    if (description) map.set(id, description);
  });
  return map;
}
