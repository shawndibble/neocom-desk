/** Fetch + cache layer for the Mail view: headers list + one body on demand. */
import {
  getCharacterMailHeaders,
  getCharacterMail,
  type MailHeader,
  type MailBody,
} from '@/esi/endpoints';
import {
  loadWithCache,
  loadWithCacheStatus,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';

const KEYS = {
  headers: 'mail:headers',
  body: (mailId: number) => `mail:${mailId}`,
} as const;

/**
 * Up to the 50 most recent mail headers. ESI or cache, with the auth-failure
 * state exposed so the view can offer a re-login instead of a silent empty
 * state when the mail scope was revoked (issue #14).
 */
export function loadMailHeaders(characterId: number): Promise<StatusResult<MailHeader[]>> {
  return loadWithCacheStatus(
    characterId,
    KEYS.headers,
    async () => (await getCharacterMailHeaders(characterId)).data
  );
}

/** One mail's full body, fetched on open. ESI or cache. */
export function loadMailBody(
  characterId: number,
  mailId: number
): Promise<CachedResult<MailBody> | null> {
  return loadWithCache(
    characterId,
    KEYS.body(mailId),
    async () => (await getCharacterMail(characterId, mailId)).data
  );
}
