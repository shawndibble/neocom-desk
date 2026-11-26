import { postCharactersAffiliation, type CharacterAffiliation } from '@/esi/endpoints';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  readCachedEntries,
  writeCachedMany,
} from '@/esi/cache';

function cacheKey(characterId: number): string {
  return `affiliation:${characterId}`;
}

export async function resolveAffiliations(
  characterIds: readonly number[]
): Promise<Map<number, CharacterAffiliation>> {
  const unique = [...new Set(characterIds)];
  const map = new Map<number, CharacterAffiliation>();
  if (unique.length === 0) return map;

  const cached = await readCachedEntries<CharacterAffiliation>(
    GLOBAL_CACHE_CHARACTER_ID,
    unique.map(cacheKey)
  );
  const now = Date.now();
  const unknown: number[] = [];
  const lapsed: number[] = [];
  for (const id of unique) {
    const row = cached.get(cacheKey(id));
    if (row === undefined) {
      unknown.push(id);
      continue;
    }
    map.set(id, row.value);
    if (now - row.fetchedAt >= STALE_AFTER.default) lapsed.push(id);
  }

  if (unknown.length > 0) {
    for (const [id, entry] of await fetchAffiliations([...unknown, ...lapsed])) map.set(id, entry);
    return map;
  }
  if (lapsed.length > 0) void fetchAffiliations(lapsed);
  return map;
}

async function fetchAffiliations(
  ids: readonly number[]
): Promise<Map<number, CharacterAffiliation>> {
  const resolved = new Map<number, CharacterAffiliation>();
  try {
    const entries = await postCharactersAffiliation([...ids]);
    const fetchedAt = Date.now();
    for (const entry of entries) resolved.set(entry.character_id, entry);
    await writeCachedMany(
      GLOBAL_CACHE_CHARACTER_ID,
      entries.map((entry) => [cacheKey(entry.character_id), entry] as const),
      fetchedAt
    );
  } catch {}
  return resolved;
}

export async function affiliationFetchedAt(characterId: number): Promise<Date | null> {
  const rows = await readCachedEntries<CharacterAffiliation>(GLOBAL_CACHE_CHARACTER_ID, [
    cacheKey(characterId),
  ]);
  const row = rows.get(cacheKey(characterId));
  return row === undefined ? null : new Date(row.fetchedAt);
}
