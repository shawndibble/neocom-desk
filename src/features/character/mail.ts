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
  readCachedEntries,
  readCachedRows,
  writeCached,
  STALE_AFTER,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import { esiFetch, isAuthFailure, isOfflineFailure } from '@/esi/client';
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
  hasMore: boolean;
}

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
  failure?: 'offline' | 'error';
}

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

export interface MailOwnerLoad {
  headers: CachedResult<MailHeader[]> | null;
  labels: CachedResult<MailLabels> | null;
  lists: MailingList[];
  needsReauth: boolean;
  hasMore: boolean;
}

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

export function readMailLabelsForCharacters(
  characterIds: readonly number[]
): Promise<Map<number, CachedResult<MailLabels>>> {
  return readCachedRows<MailLabels>(characterIds, KEYS.labels);
}

export function loadMailLabels(characterId: number): Promise<StatusResult<MailLabels>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterMailLabels(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.labels, fetchLive, { conditional });
}

export function loadMailingLists(characterId: number): Promise<StatusResult<MailingList[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterMailingLists(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEYS.lists, fetchLive, {
    staleAfterMs: STALE_AFTER.static,
    conditional,
  });
}

export function loadMailBody(
  characterId: number,
  mailId: number
): Promise<CachedResult<MailBody> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterMail(characterId, mailId, options)
  );
  return loadWithCache(characterId, KEYS.body(mailId), fetchLive, {
    staleAfterMs: STALE_AFTER.static,
    conditional,
  });
}

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

export async function markMailReadOnEsi(characterId: number, mailId: number): Promise<void> {
  await setMailReadOnEsi(characterId, mailId, true);
}

export type MailWriteResult = 'done' | 'skipped' | 'failed';

export async function setMailReadOnEsi(
  characterId: number,
  mailId: number,
  read: boolean
): Promise<MailWriteResult> {
  if (!(await grantHoldsEndpointScope(characterId, 'putCharacterMail'))) return 'skipped';
  try {
    await putCharacterMail(characterId, mailId, { read });
  } catch (err) {
    await reportWriteAuthFailure(characterId, err, 'putCharacterMail');
    return 'failed';
  }
  try {
    const before = await patchCachedHeaders(characterId, mailId, (header) => ({
      ...header,
      is_read: read,
    }));
    if (before !== undefined && Boolean(before.is_read) !== read) {
      await patchCachedUnreadCounts(characterId, before, read ? -1 : 1);
    }
  } catch {}
  return 'done';
}

export async function deleteMailOnEsi(
  characterId: number,
  mailId: number
): Promise<MailWriteResult> {
  if (!(await grantHoldsEndpointScope(characterId, 'putCharacterMail'))) return 'skipped';
  try {
    await esiFetch<void>(`/characters/${characterId}/mail/${mailId}/`, {
      characterId,
      method: 'DELETE',
      endpointId: 'putCharacterMail',
    });
  } catch (err) {
    await reportWriteAuthFailure(characterId, err, 'putCharacterMail');
    return 'failed';
  }
  try {
    const before = await patchCachedHeaders(characterId, mailId, null);
    if (before !== undefined && before.is_read === false) {
      await patchCachedUnreadCounts(characterId, before, -1);
    }
    await db.esiCache.delete([characterId, KEYS.body(mailId)]);
    await clearDraft(characterId, mailId);
  } catch {}
  return 'done';
}

const cachePatchQueue = new Map<number, Promise<unknown>>();

function serializePerCharacter<T>(characterId: number, run: () => Promise<T>): Promise<T> {
  const next = (cachePatchQueue.get(characterId) ?? Promise.resolve()).then(run, run);
  cachePatchQueue.set(
    characterId,
    next.catch(() => undefined)
  );
  return next;
}

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
