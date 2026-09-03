/**
 * Fetch + cache layer for EVE's own server-pushed notifications (issue #274)
 * — a different, non-overlapping domain from every other Notification Event,
 * which the app synthesizes by diffing other endpoints.
 */
import { getCharacterNotifications, type CharacterNotification } from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEYS = {
  notifications: 'notifications:eve',
} as const;

/**
 * Not paginated — ESI returns a bounded recent window, not full history, so
 * unlike mail/calendar there is no "load more" here.
 */
export function loadCharacterNotifications(
  characterId: number
): Promise<StatusResult<CharacterNotification[]>> {
  return loadWithCacheStatus(
    characterId,
    KEYS.notifications,
    async () => (await getCharacterNotifications(characterId)).data
  );
}
