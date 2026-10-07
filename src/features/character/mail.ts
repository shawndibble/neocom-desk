/** Fetch + cache layer for the Mail view: headers list + one body on demand. */
import { db } from '@/db';
import {
  getCharacterMailHeaders,
  getCharacterMail,
  getCharacterMailLabels,
  getCharacterMailingLists,
  putCharacterMail,
  postCharacterMail,
  type MailHeader,
  type MailBody,
  type MailLabels,
  type MailingList,
  type MailRecipient,
} from '@/esi/endpoints';
import {
  conditionalFetch,
  loadWithCache,
  loadWithCacheStatus,
  readCached,
  readCachedRows,
  writeCached,
  STALE_AFTER,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import { isAuthFailure } from '@/esi/client';
import { emitEsiAuthFailure } from '@/esi/authFailureSignal';
import { reportWriteAuthFailure } from '@/esi/writeAuthFailure';
import { mergeMailHeaderPage, MAIL_HEADERS_PAGE_SIZE } from '@/engine/mail';

const KEYS = {
  headers: 'mail:headers',
  labels: 'mail:labels',
  lists: 'mail:lists',
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
    if (isAuthFailure(err)) emitEsiAuthFailure(characterId, 'getCharacterMailHeaders');
    return { headers: [...currentHeaders], hasMore: true };
  }
}

/** Everything the Mail list needs from one Character's mailbox: headers, label counts, list names. */
export interface MailOwnerLoad {
  headers: CachedResult<MailHeader[]> | null;
  labels: CachedResult<MailLabels> | null;
  lists: MailingList[];
  /** 401/403 (or a failed token refresh) on any of the three reads: "log in again", not "offline". */
  needsReauth: boolean;
  hasMore: boolean;
}

/** The three reads at once — ESI or cache, each on its own freshness window. */
export async function loadMailOwner(characterId: number): Promise<MailOwnerLoad> {
  const [headers, labels, lists] = await Promise.all([
    loadMailHeaders(characterId),
    loadMailLabels(characterId),
    loadMailingLists(characterId),
  ]);
  return {
    headers: headers.cached,
    labels: labels.cached,
    lists: lists.cached?.data ?? [],
    needsReauth: headers.needsReauth || labels.needsReauth || lists.needsReauth,
    hasMore: headers.hasMore,
  };
}

/** Same shape as `loadMailOwner`, from Dexie only — never a live call. */
export async function loadMailOwnerCacheOnly(characterId: number): Promise<MailOwnerLoad> {
  const [headers, labels, lists] = await Promise.all([
    readCachedRows<MailHeader[]>([characterId], KEYS.headers),
    readCachedRows<MailLabels>([characterId], KEYS.labels),
    readCachedRows<MailingList[]>([characterId], KEYS.lists),
  ]);
  const cached = headers.get(characterId) ?? null;
  return {
    headers: cached,
    labels: labels.get(characterId) ?? null,
    lists: lists.get(characterId)?.data ?? [],
    needsReauth: false,
    hasMore: (cached?.data.length ?? 0) >= MAIL_HEADERS_PAGE_SIZE,
  };
}

/** Cached label sets for many Characters, for per-Character unread figures — never a live call. */
export function readMailLabelsForCharacters(
  characterIds: readonly number[]
): Promise<Map<number, CachedResult<MailLabels>>> {
  return readCachedRows<MailLabels>(characterIds, KEYS.labels);
}

/** System + Custom Labels with unread counts — the tab bar's four buckets (CONTEXT.md round 18) and the custom-label filter chips (round 22). ESI or cache. */
export function loadMailLabels(characterId: number): Promise<StatusResult<MailLabels>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterMailLabels(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.labels, fetchLive, { conditional });
}

/** A character's mailing-list memberships — resolves a `mailing_list` recipient's real name (issue #416). Membership changes rarely, so it gets the `static` freshness tier, same as a mail body. */
export function loadMailingLists(characterId: number): Promise<StatusResult<MailingList[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterMailingLists(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.lists, fetchLive, {
    staleAfterMs: STALE_AFTER.static,
    conditional,
  });
}

/** One mail's full body, fetched on open. ESI or cache. */
export function loadMailBody(
  characterId: number,
  mailId: number
): Promise<CachedResult<MailBody> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterMail(characterId, mailId, options)
  );
  return loadWithCache(
    characterId,
    KEYS.body(mailId),
    fetchLive,
    // A delivered mail's body never changes. Not even the `read` flag moves
    // it — that lives on the header, and its write goes through ESI, not
    // through this cache, so a stale body is never the reason it drifts.
    { staleAfterMs: STALE_AFTER.static, conditional }
  );
}

/**
 * Pushes the "read" write to ESI, alongside the session-local mark-read that
 * always happens regardless. Errors are otherwise swallowed — nothing for a
 * caller to react to, just another chance next time this mail reopens — but
 * an auth failure still signals the app-wide reauth banner
 * (`reportWriteAuthFailure`, which asks for this endpoint's Permission only
 * when the grant lacks it): a stale grant (e.g. a token that predates `organize_mail`'s addition,
 * issue #741) would otherwise fail silently on every open with no way for the
 * user to learn a re-login would fix it.
 *
 * On success, patches the cached header list's own `is_read` flag rather than
 * refetching from ESI: the local write already knows the true state, while a
 * refetch risks losing a race with ESI's own propagation delay. Without this
 * the session-local mark-read (Mail.tsx's `locallyReadIds`) is the only thing
 * showing the mail as read, and it's gone the moment the headers reload from
 * cache — leaving a message that reopens as unread on every return visit
 * inside the 10-minute cache window.
 */
export async function markMailReadOnEsi(characterId: number, mailId: number): Promise<void> {
  try {
    await putCharacterMail(characterId, mailId, { read: true });
  } catch (err) {
    await reportWriteAuthFailure(characterId, err, 'putCharacterMail');
    return;
  }
  const headers = await readCached<MailHeader[]>(characterId, KEYS.headers);
  if (!headers) return;
  await writeCached(
    characterId,
    KEYS.headers,
    headers.map((header) => (header.mail_id === mailId ? { ...header, is_read: true } : header)),
    Date.now()
  );
}

/**
 * Sends a Reply or Forward (`MailSendBody.approved_cost` — see there for why
 * it's never set). Auth failure signals the app-wide reauth banner like
 * every other write in this file; every other failure is left for the
 * caller to display inline (no toast component in this app).
 *
 * On success, deletes the cached headers row rather than patching it: unlike
 * `markMailReadOnEsi`, the new mail's shape (timestamp, `mail_id`) is not
 * known locally, so the next Mail load simply refetches instead of guessing.
 */
export async function sendMail(
  characterId: number,
  recipients: readonly MailRecipient[],
  subject: string,
  body: string
): Promise<number> {
  let mailId: number;
  try {
    const result = await postCharacterMail(characterId, {
      recipients: [...recipients],
      subject,
      body,
    });
    if (result.data === null) throw new Error('ESI did not answer with a mail id.');
    mailId = result.data;
  } catch (err) {
    await reportWriteAuthFailure(characterId, err, 'postCharacterMail');
    throw err;
  }
  await db.esiCache.delete([characterId, KEYS.headers]);
  return mailId;
}
