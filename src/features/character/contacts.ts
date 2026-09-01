/** Fetch + cache layer for the Contacts view. */
import { getCharacterContacts, type CharacterContact } from '@/esi/endpoints';
import { loadPaginatedWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'contacts';

/**
 * All contacts (every page). ESI or cache, with the auth-failure state
 * exposed so the view can offer a re-login instead of a silent empty state
 * when the contacts scope was revoked. `truncated` on the cached result
 * means pages were missing.
 */
export function loadContacts(characterId: number): Promise<StatusResult<CharacterContact[]>> {
  return loadPaginatedWithCacheStatus(characterId, KEY, () => getCharacterContacts(characterId));
}
