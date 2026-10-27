import { useEffect, useRef, useState } from 'react';
import { NO_AFFILIATIONS, NO_NAMES } from '@/lib/emptyCollections';
import { loadMailHeaders, loadMoreMailHeaders } from '@/features/character/mail';
import {
  namePartyIds,
  resolveSenderAffiliations,
  NO_HAS_MORE,
  type Snapshot,
} from '@/features/character/mailSnapshot';
import { resolveNames } from '@/features/character/names';
import type { CharacterAffiliation, MailHeader } from '@/esi/endpoints';

type Owner = Snapshot['owners'][number];

/**
 * Mail headers loaded past the snapshot's first page ("load more", issue #161),
 * plus the names and sender affiliations for them. They live outside
 * `useRouteSnapshot`, which only supports a full reload, not an incremental
 * patch. Per Character: each mailbox pages by its own `last_mail_id`.
 */
export function useMailPaging(
  data: Snapshot | null,
  owners: readonly Owner[],
  ownerById: ReadonlyMap<number, Owner>
) {
  // `null` means "no load-more yet this snapshot" — fall back to the snapshot's own lists.
  const [loadedHeaders, setLoadedHeaders] = useState<ReadonlyMap<number, MailHeader[]> | null>(
    null
  );
  // Names for those headers: the snapshot only resolved the parties in its own
  // first page, so without this every row past it would read "Unknown".
  const [loadedNames, setLoadedNames] = useState<ReadonlyMap<number, string> | null>(null);
  // Same gap, for standing: the snapshot only resolved affiliations for its
  // own first page of senders, so without this an inherited (corp/alliance)
  // standing would silently never show past it — a personal contact entry
  // would still match (the index is id-keyed), which is what makes this easy
  // to miss in a quick look.
  const [loadedAffiliations, setLoadedAffiliations] = useState<Map<
    number,
    CharacterAffiliation
  > | null>(null);
  const [hasMoreByOwner, setHasMoreByOwner] = useState<ReadonlyMap<number, boolean>>(NO_HAS_MORE);
  const hasMore = [...hasMoreByOwner.values()].some(Boolean);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Why the last "Load more" gave nothing, or `null`. Cleared when the next attempt starts. */
  const [loadMoreFailure, setLoadMoreFailure] = useState<'offline' | 'error' | null>(null);
  // Reset for a new snapshot (character switch, manual refresh, or the
  // initial load) synchronously during render — the same "adjust state while
  // rendering" pattern useRouteSnapshot itself uses — so `hasMore` is already
  // correct on the very render that first shows this snapshot's headers,
  // instead of lagging a render behind through a useEffect.
  const [snapshotForHeaders, setSnapshotForHeaders] = useState<Snapshot | null>(null);
  if (data !== snapshotForHeaders) {
    setSnapshotForHeaders(data);
    setLoadedHeaders(null);
    setLoadedNames(null);
    setLoadedAffiliations(null);
    setHasMoreByOwner(new Map((data?.owners ?? []).map((o) => [o.characterId, o.hasMore])));
  }
  // Latest snapshot, readable from the async closures below after an
  // await — a stale closure over `data` would never see the character
  // switch or refresh that superseded the in-flight request.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  const names = loadedNames ?? data?.names ?? NO_NAMES;
  const senderAffiliations = loadedAffiliations ?? data?.senderAffiliations ?? NO_AFFILIATIONS;

  /** What each mailbox currently shows: its load-more list if it has one, else the snapshot's. */
  function currentHeadersOf(ownerId: number): MailHeader[] {
    return loadedHeaders?.get(ownerId) ?? ownerById.get(ownerId)?.headersResult?.data ?? [];
  }

  /**
   * Shared by `handleLoadMore` and `refetchOwnerHeaders`: resolve
   * names/affiliations for fresh header lists and apply them, unless a
   * character switch or refresh already superseded `requestSnapshot` while this
   * was in flight (`dataRef` tracks the latest one).
   */
  async function applyFreshHeaders(
    requestSnapshot: Snapshot | null,
    fresh: ReadonlyMap<number, { headers: MailHeader[]; hasMore: boolean }>
  ) {
    const all = [...fresh.values()].flatMap((entry) => entry.headers);
    const [freshNames, freshAffiliations] = await Promise.all([
      resolveNames(namePartyIds(all)),
      resolveSenderAffiliations(all),
    ]);
    if (dataRef.current !== requestSnapshot) return;
    setLoadedHeaders(new Map([...fresh].map(([id, entry]) => [id, entry.headers])));
    setHasMoreByOwner(new Map([...fresh].map(([id, entry]) => [id, entry.hasMore])));
    setLoadedNames(freshNames);
    setLoadedAffiliations(freshAffiliations);
  }

  /** One more page per mailbox that has one — a mailbox with nothing older is left as it is. */
  async function handleLoadMore() {
    if (owners.length === 0 || loadingMore) return;
    const requestSnapshot = data;
    setLoadingMore(true);
    setLoadMoreFailure(null);
    try {
      const fresh = new Map<number, { headers: MailHeader[]; hasMore: boolean }>();
      const failures = new Set<'offline' | 'error'>();
      await Promise.all(
        owners.map(async (owner) => {
          const current = currentHeadersOf(owner.characterId);
          if (!hasMoreByOwner.get(owner.characterId)) {
            fresh.set(owner.characterId, { headers: current, hasMore: false });
            return;
          }
          const page = await loadMoreMailHeaders(owner.characterId, current);
          if (page.failure) failures.add(page.failure);
          fresh.set(owner.characterId, page);
        })
      );
      setLoadMoreFailure(
        failures.has('offline') ? 'offline' : failures.has('error') ? 'error' : null
      );
      await applyFreshHeaders(requestSnapshot, fresh);
    } finally {
      setLoadingMore(false);
    }
  }

  /**
   * After a successful send. `sendMail` already deleted the cached headers row
   * (mail-reply-and-forward decision: "a targeted invalidation of one key, not
   * a broader reload") — refetching just the headers here is what shows the
   * new Sent mail without a manual refresh while keeping that promise. Not
   * `refresh()`: it calls the cache's global `invalidateFreshness()`, forcing
   * every other default-tier row (labels, mailing lists, contacts,
   * affiliations) to refetch too. Only the sending Character's mailbox is
   * refetched; the others keep what they show.
   */
  async function refetchOwnerHeaders(ownerId: number) {
    const requestSnapshot = data;
    const result = await loadMailHeaders(ownerId);
    const fresh = new Map(
      owners.map((o) => [
        o.characterId,
        {
          headers: currentHeadersOf(o.characterId),
          hasMore: hasMoreByOwner.get(o.characterId) ?? false,
        },
      ])
    );
    fresh.set(ownerId, { headers: result.cached?.data ?? [], hasMore: result.hasMore });
    await applyFreshHeaders(requestSnapshot, fresh);
  }

  return {
    loadedHeaders,
    names,
    senderAffiliations,
    hasMore,
    loadingMore,
    loadMoreFailure,
    handleLoadMore,
    refetchOwnerHeaders,
  };
}
