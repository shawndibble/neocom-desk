import { getCharacterFittings, type CharacterFitting } from '@/esi/endpoints';
import { conditionalFetch, loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'fittings:inGame';

export function loadInGameFittings(characterId: number): Promise<StatusResult<CharacterFitting[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterFittings(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}
