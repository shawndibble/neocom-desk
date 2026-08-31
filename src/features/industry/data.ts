/** Fetch + cache layer for owned blueprints: read-through against ESI via the shared `esi/cache` helpers. */
import { getCharacterBlueprints, type CharacterBlueprint } from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'blueprints';

/**
 * Owned blueprints (originals + copies) for a character. ESI or cache, with
 * the auth-failure state exposed so the view can offer a re-login instead of
 * silently prefilling nothing when the blueprints scope was revoked (issue #14).
 */
export function loadCharacterBlueprints(
  characterId: number
): Promise<StatusResult<CharacterBlueprint[]>> {
  return loadWithCacheStatus(characterId, KEY, () => getCharacterBlueprints(characterId));
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
