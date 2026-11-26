import { getCharacterBlueprints, type CharacterBlueprint } from '@/esi/endpoints';
import {
  conditionalPagedFetch,
  loadPaginatedWithCacheStatus,
  type StatusResult,
} from '@/esi/cache';

export const KEY = 'blueprints';

export function loadCharacterBlueprints(
  characterId: number
): Promise<StatusResult<CharacterBlueprint[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterBlueprints(characterId, options)
  );
  return loadPaginatedWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

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
