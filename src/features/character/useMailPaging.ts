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

export function useMailPaging(
  data: Snapshot | null,
  owners: readonly Owner[],
  ownerById: ReadonlyMap<number, Owner>
) {
  const [loadedHeaders, setLoadedHeaders] = useState<ReadonlyMap<number, MailHeader[]> | null>(
    null
  );
  const [loadedNames, setLoadedNames] = useState<ReadonlyMap<number, string> | null>(null);
  const [loadedAffiliations, setLoadedAffiliations] = useState<Map<
    number,
    CharacterAffiliation
  > | null>(null);
  const [hasMoreByOwner, setHasMoreByOwner] = useState<ReadonlyMap<number, boolean>>(NO_HAS_MORE);
  const hasMore = [...hasMoreByOwner.values()].some(Boolean);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailure, setLoadMoreFailure] = useState<'offline' | 'error' | null>(null);
  const [snapshotForHeaders, setSnapshotForHeaders] = useState<Snapshot | null>(null);
  if (data !== snapshotForHeaders) {
    setSnapshotForHeaders(data);
    setLoadedHeaders(null);
    setLoadedNames(null);
    setLoadedAffiliations(null);
    setHasMoreByOwner(new Map((data?.owners ?? []).map((o) => [o.characterId, o.hasMore])));
  }
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  const names = loadedNames ?? data?.names ?? NO_NAMES;
  const senderAffiliations = loadedAffiliations ?? data?.senderAffiliations ?? NO_AFFILIATIONS;

  function currentHeadersOf(ownerId: number): MailHeader[] {
    return loadedHeaders?.get(ownerId) ?? ownerById.get(ownerId)?.headersResult?.data ?? [];
  }

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
