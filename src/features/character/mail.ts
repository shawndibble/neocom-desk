/** Fetch + cache layer for the Mail view: headers list + one body on demand. */
import { db } from '@/db';
import {
  getCharacterMailHeaders,
  getCharacterMail,
  getCharacterMailLabels,
  getCharacterMailingLists,
  putCharacterMail,
  deleteCharacterMail,
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
  readCachedEntries,
  readCachedRows,
  writeCached,
  STALE_AFTER,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import { isAuthFailure, isOfflineFailure } from '@/esi/client';
import { emitEsiAuthFailure } from '@/esi/authFailureSignal';
import { grantHoldsEndpointScope } from '@/esi/grantScope';
import { reportWriteAuthFailure } from '@/esi/writeAuthFailure';
import {
  mergeMailHeaderPage,
  selectMailBodiesToPrefetch,
  MAIL_HEADERS_PAGE_SIZE,
} from '@/engine/mail/mail';
import { MAIL_BODY_PREFETCH_LIMIT, prefetchMissing } from './detailPrefetch';
import { clearDraft } from './mailDrafts';

export const KEYS = {
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
  /** Set when the page could not be loaded: `offline` for a network failure, `error` for the rest. */
  failure?: 'offline' | 'error';
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
    return {
      headers: [...currentHeaders],
      hasMore: true,
      failure: isOfflineFailure(err) ? 'offline' : 'error',
    };
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

/** System + Custom Labels with unread counts — the tab bar's four buckets (GLOSSARY.md round 18) and the custom-label filter chips (round 22). ESI or cache. */
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
 * After a header load that reached ESI: fetches and caches the bodies of the
 * newest mail (unread first) that are not cached yet, so the reader shows
 * them offline. A delivered body does not change, so a cached one is never
 * fetched again. Bounds, gate and failure memory: `detailPrefetch.ts`.
 */
export function prefetchMailBodies(
  characterId: number,
  headers: readonly MailHeader[]
): Promise<void> {
  return prefetchMissing({
    kind: 'mail-body',
    characterId,
    allIds: headers.map((header) => header.mail_id),
    keyOf: KEYS.body,
    select: (skip) =>
      selectMailBodiesToPrefetch(headers, {
        ownerId: characterId,
        cachedIds: skip,
        limit: MAIL_BODY_PREFETCH_LIMIT,
      }),
    load: (mailId) => loadMailBody(characterId, mailId),
  });
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
  await setMailReadOnEsi(characterId, mailId, true);
}

/** How a Mail organize write ended: `skipped` is "the Permission is not held" (nothing was requested). */
export type MailWriteResult = 'done' | 'skipped' | 'failed';

/**
 * Sets one mail's read flag on ESI (so the game client shows it too), then
 * patches the cached header the same way as `markMailReadOnEsi`, and the
 * cached label counts so a reload agrees. Nothing else is stored: ESI stays
 * the source of truth.
 */
export async function setMailReadOnEsi(
  characterId: number,
  mailId: number,
  read: boolean
): Promise<MailWriteResult> {
  // Opening a mail is not a request to write, and `organize_mail` is off by
  // default (Write to EVE): without the scope skip quietly, rather than fail
  // and raise the grant notice on every open. The Mail view offers the grant.
  if (!(await grantHoldsEndpointScope(characterId, 'putCharacterMail'))) return 'skipped';
  try {
    await putCharacterMail(characterId, mailId, { read });
  } catch (err) {
    await reportWriteAuthFailure(characterId, err, 'putCharacterMail');
    return 'failed';
  }
  // ESI has answered: the write is done even if tidying the local copy fails.
  try {
    const before = await patchCachedHeaders(characterId, mailId, (header) => ({
      ...header,
      is_read: read,
    }));
    if (before !== undefined && Boolean(before.is_read) !== read) {
      await patchCachedUnreadCounts(characterId, before, read ? -1 : 1);
    }
  } catch {
    // Deliberately not rethrown: see above.
  }
  return 'done';
}

/**
 * Deletes one mail on ESI (in game too; irreversible), then drops the local
 * copies: the cached header, the cached body and any Reply/Forward draft for
 * it. A mail that fails to delete is left exactly as it was.
 */
export async function deleteMailOnEsi(
  characterId: number,
  mailId: number
): Promise<MailWriteResult> {
  if (!(await grantHoldsEndpointScope(characterId, 'deleteCharacterMail'))) return 'skipped';
  try {
    await deleteCharacterMail(characterId, mailId);
  } catch (err) {
    await reportWriteAuthFailure(characterId, err, 'deleteCharacterMail');
    return 'failed';
  }
  // ESI has answered 204: the mail is gone in EVE, so it is deleted even if
  // dropping the local copies fails (a stale cached row ages out on the daily prune).
  try {
    const before = await patchCachedHeaders(characterId, mailId, null);
    if (before !== undefined && before.is_read === false) {
      await patchCachedUnreadCounts(characterId, before, -1);
    }
    await db.esiCache.delete([characterId, KEYS.body(mailId)]);
    await clearDraft(characterId, mailId);
  } catch {
    // Deliberately not rethrown: see above.
  }
  return 'done';
}

/** One cache patch at a time per Character: a bulk action writes three mails at once, and two read-patch-writes interleaved would drop each other's change. */
const cachePatchQueue = new Map<number, Promise<unknown>>();

function serializePerCharacter<T>(characterId: number, run: () => Promise<T>): Promise<T> {
  const next = (cachePatchQueue.get(characterId) ?? Promise.resolve()).then(run, run);
  cachePatchQueue.set(
    characterId,
    next.catch(() => undefined)
  );
  return next;
}

/**
 * Rewrites one mail in the cached header list (`null` removes it), keeping the
 * list's own age: it was not re-read from ESI, and restamping it would show a
 * days-old list as just fetched. Resolves to the mail as it was, or undefined
 * when the list or the mail is not cached.
 */
function patchCachedHeaders(
  characterId: number,
  mailId: number,
  patch: ((header: MailHeader) => MailHeader) | null
): Promise<MailHeader | undefined> {
  return serializePerCharacter(characterId, async () => {
    const row = (await readCachedEntries<MailHeader[]>(characterId, [KEYS.headers])).get(
      KEYS.headers
    );
    const before = row?.value.find((header) => header.mail_id === mailId);
    if (!row || before === undefined) return undefined;
    const next =
      patch === null
        ? row.value.filter((header) => header.mail_id !== mailId)
        : row.value.map((header) => (header.mail_id === mailId ? patch(header) : header));
    await writeCached(characterId, KEYS.headers, next, row.fetchedAt);
    return before;
  });
}

/** Moves the cached label unread counts (each label the mail carries, and the total) by `change`, floored at zero, so the folder chips agree after a reload. */
function patchCachedUnreadCounts(
  characterId: number,
  header: MailHeader,
  change: 1 | -1
): Promise<void> {
  return serializePerCharacter(characterId, async () => {
    const row = (await readCachedEntries<MailLabels>(characterId, [KEYS.labels])).get(KEYS.labels);
    if (!row) return;
    const carried = new Set(header.labels ?? []);
    const bump = (n: number | undefined) => Math.max(0, (n ?? 0) + change);
    await writeCached(
      characterId,
      KEYS.labels,
      {
        ...row.value,
        labels: row.value.labels?.map((label) =>
          carried.has(label.label_id) ? { ...label, unread_count: bump(label.unread_count) } : label
        ),
        total_unread_count: bump(row.value.total_unread_count),
      },
      row.fetchedAt
    );
  });
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
