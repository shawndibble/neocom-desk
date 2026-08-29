/**
 * Fetch + cache layer for owned blueprints: try ESI, on success persist to
 * the generic `esiCache` Dexie table, on failure fall back to whatever is
 * cached. Mirrors src/features/skills/data.ts's read-through pattern
 * (duplicated rather than imported/exported — that module is read-only
 * territory for this feature).
 */
import { db } from '@/db';
import { getCharacterBlueprints, type CharacterBlueprint } from '@/esi/endpoints';

export interface CachedResult<T> {
  data: T;
  fetchedAt: Date;
  fromCache: boolean;
}

const KEY = 'blueprints';

async function loadWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>
): Promise<CachedResult<T> | null> {
  try {
    const data = await fetchLive();
    if (data !== null) {
      const fetchedAt = Date.now();
      await db.esiCache.put({ characterId, key, value: data, fetchedAt });
      return { data, fetchedAt: new Date(fetchedAt), fromCache: false };
    }
  } catch {
    // Offline or ESI failure: fall back to whatever is cached below.
  }
  const cached = await db.esiCache.get([characterId, key]);
  if (!cached) return null;
  return { data: cached.value as T, fetchedAt: new Date(cached.fetchedAt), fromCache: true };
}

/** Owned blueprints (originals + copies) for a character. ESI or cache. */
export function loadCharacterBlueprints(
  characterId: number
): Promise<CachedResult<CharacterBlueprint[]> | null> {
  return loadWithCache(characterId, KEY, () => getCharacterBlueprints(characterId));
}

/**
 * Best owned copy of a blueprint typeID for ME/TE prefill: prefer an
 * original (BPO, `runs === -1`) when one is owned, else the copy with the
 * highest material efficiency. Returns null when none is owned.
 */
export function findOwnedBlueprint(
  blueprints: readonly CharacterBlueprint[],
  blueprintTypeID: number
): CharacterBlueprint | null {
  const matches = blueprints.filter((b) => b.type_id === blueprintTypeID);
  if (matches.length === 0) return null;
  const original = matches.find((b) => b.runs === -1);
  if (original) return original;
  return matches.reduce((best, b) => (b.material_efficiency > best.material_efficiency ? b : best));
}
