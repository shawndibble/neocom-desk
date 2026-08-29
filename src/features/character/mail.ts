/** Fetch + cache layer for the Mail view: headers list + one body on demand. */
import {
  getCharacterMailHeaders,
  getCharacterMail,
  type MailHeader,
  type MailBody,
} from '@/esi/endpoints';
import { loadWithCache, type CachedResult } from './cache';

const KEYS = {
  headers: 'mail:headers',
  body: (mailId: number) => `mail:${mailId}`,
} as const;

/** Up to the 50 most recent mail headers. ESI or cache. */
export function loadMailHeaders(characterId: number): Promise<CachedResult<MailHeader[]> | null> {
  return loadWithCache(
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
