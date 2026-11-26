import { getCharacterNotifications, type CharacterNotification } from '@/esi/endpoints';
import { conditionalFetch, loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEYS = {
  notifications: 'notifications:eve',
} as const;

export function loadCharacterNotifications(
  characterId: number
): Promise<StatusResult<CharacterNotification[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterNotifications(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.notifications, fetchLive, { conditional });
}
