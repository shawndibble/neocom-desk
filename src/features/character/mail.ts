/** Fetch + cache layer for the Mail view: headers list + one body on demand. */
import {
  getCharacterMailHeaders,
  getCharacterMail,
  getCharacterMailLabels,
  type MailHeader,
  type MailBody,
  type MailLabels,
} from '@/esi/endpoints';
import {
  loadWithCache,
  loadWithCacheStatus,
  writeCached,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import { isAuthFailure } from '@/esi/client';
import { emitEsiAuthFailure } from '@/esi/authFailureSignal';
import { mergeMailHeaderPage, MAIL_HEADERS_PAGE_SIZE } from '@/engine/mail';

const KEYS = {
  headers: 'mail:headers',
  labels: 'mail:labels',
  body: (mailId: number) => `mail:${mailId}`,
} as const;

export interface MailHeadersResult extends StatusResult<MailHeader[]> {
  /** True when a next `last_mail_id` page may exist (issue #161). */
  hasMore: boolean;
}

/**
 * Up to the 50 most recent mail headers. ESI or cache, with the auth-failure
 * state exposed so the view can offer a re-login instead of a silent empty
 * state when the mail scope was revoked (issue #14).
 */
export async function loadMailHeaders(characterId: number): Promise<MailHeadersResult> {
  const result = await loadWithCacheStatus(
    characterId,
    KEYS.headers,
    async () => (await getCharacterMailHeaders(characterId)).data
  );
  return { ...result, hasMore: (result.cached?.data.length ?? 0) >= MAIL_HEADERS_PAGE_SIZE };
}

export interface LoadMoreMailHeadersResult {
  headers: MailHeader[];
  hasMore: boolean;
}

/**
 * Fetches the next older page via `last_mail_id` (the lowest `mail_id`
 * already loaded), merges it into the given list, and writes the merged list
 * back to the cache (issue #161: pagination beyond the 50-cap). On failure
 * the given list is returned unchanged, with `hasMore` left true so the
 * "load more" affordance stays available to retry — an auth failure also
 * signals the app-wide reauth banner (`emitEsiAuthFailure`), same as every
 * other read-through loader.
 */
export async function loadMoreMailHeaders(
  characterId: number,
  currentHeaders: readonly MailHeader[]
): Promise<LoadMoreMailHeadersResult> {
  const lastMailId = currentHeaders.reduce(
    (min, header) => Math.min(min, header.mail_id),
    Number.POSITIVE_INFINITY
  );
  try {
    const { data } = await getCharacterMailHeaders(characterId, {
      lastMailId: Number.isFinite(lastMailId) ? lastMailId : undefined,
    });
    const { headers, hasMore } = mergeMailHeaderPage(currentHeaders, data ?? []);
    await writeCached(characterId, KEYS.headers, headers, Date.now());
    return { headers, hasMore };
  } catch (err) {
    if (isAuthFailure(err)) emitEsiAuthFailure(characterId);
    return { headers: [...currentHeaders], hasMore: true };
  }
}

/** System + Custom Labels with unread counts — the tab bar's four buckets (CONTEXT.md round 18) and the custom-label filter chips (round 22). ESI or cache. */
export function loadMailLabels(characterId: number): Promise<StatusResult<MailLabels>> {
  return loadWithCacheStatus(
    characterId,
    KEYS.labels,
    async () => (await getCharacterMailLabels(characterId)).data
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
