/**
 * Fetches each Compare Set item's best sell and buy at every Trade Hub's
 * station, for the drawer's Trade hubs view (issue #4697). One batched
 * station-price read per hub covers every item, so a view costs five reads
 * however large the set is. Only fetches while `enabled`, like
 * `useCompareAttributes.ts` — a closed drawer or one on another view must not
 * spend the reads.
 *
 * Also counts the jumps from the pilot's Current System to each hub, for the
 * column headers.
 */
import { useEffect, useRef, useState } from 'react';
import type { CompareSetItem } from './compareSet';
import type { HubAggregate } from '@/market/fuzzwork';
import { COMPARED_HUBS, type ComparedHubId } from '@/market/hubs';
import { getHubPricesWithStatus, invalidateHubPrices } from '@/market/prices';
import { jumpsBetween, useJumpBasis } from '@/features/route/jumpBasis';
import { useCurrentSystem } from '@/features/route/currentSystem';

export type HubId = ComparedHubId;

export interface HubPrices {
  loading: boolean;
  /** The price read failed: the hub's figures are unknown, not empty. */
  unreachable: boolean;
  prices: ReadonlyMap<number, HubAggregate>;
}

export interface UseCompareHubsResult {
  hubs: Readonly<Record<HubId, HubPrices>>;
  /** Jumps from the Current System; null while counting, or with no route or location. */
  jumps: Readonly<Record<HubId, number | null>>;
}

const EMPTY_PRICES: HubPrices = { loading: false, unreachable: false, prices: new Map() };

function allHubs<T>(value: T): Record<HubId, T> {
  return Object.fromEntries(COMPARED_HUBS.map((hub) => [hub.id, value])) as Record<HubId, T>;
}

/** One frozen object for "no counts yet", so a consumer's memo on `jumps` holds. */
const NO_JUMPS: Readonly<Record<HubId, number | null>> = Object.freeze(allHubs(null));

export function useCompareHubs(
  items: readonly CompareSetItem[],
  enabled: boolean,
  refreshTick = 0
): UseCompareHubsResult {
  // Tagged with the signature it was fetched for, so the first render after a
  // change reads as loading rather than briefly as "no orders".
  const [fetched, setFetched] = useState<{ key: string; hubs: Record<HubId, HubPrices> } | null>(
    null
  );

  // Value-stable typeId signature, same reasoning as `useCompareRows.ts`.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const itemsKey = items.map((item) => item.typeId).join(',');
  const tickRef = useRef(refreshTick);

  useEffect(() => {
    const typeIds = itemsRef.current.map((item) => item.typeId);
    if (!enabled || typeIds.length === 0) {
      setFetched(null);
      return;
    }
    // A bumped refresh tick forces a read past the price cache's TTL.
    if (tickRef.current !== refreshTick) {
      tickRef.current = refreshTick;
      for (const hub of COMPARED_HUBS) invalidateHubPrices(hub.stationId, typeIds);
    }
    let cancelled = false;
    const key = `${itemsKey}|${refreshTick}`;
    setFetched({ key, hubs: allHubs({ ...EMPTY_PRICES, loading: true }) });
    for (const hub of COMPARED_HUBS) {
      void getHubPricesWithStatus(hub, typeIds)
        .then(({ prices, unreachable }): HubPrices => ({ loading: false, unreachable, prices }))
        .catch((): HubPrices => ({ ...EMPTY_PRICES, unreachable: true }))
        .then((result) => {
          if (!cancelled)
            setFetched((current) =>
              current?.key === key ? { key, hubs: { ...current.hubs, [hub.id]: result } } : current
            );
        });
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, itemsKey, refreshTick]);

  const basis = useJumpBasis();
  const { systemId: originSystemId } = useCurrentSystem();
  const [counted, setCounted] = useState<{
    key: string;
    jumps: Record<HubId, number | null>;
  } | null>(null);
  const jumpsKey = `${basis.key}|${originSystemId}`;

  useEffect(() => {
    if (!enabled || !basis.hydrated || originSystemId === null) return;
    let cancelled = false;
    void Promise.all(
      COMPARED_HUBS.map((hub) =>
        jumpsBetween(originSystemId, hub.systemId, basis)
          .then((result) => (result.kind === 'known' ? result.jumps : null))
          .catch(() => null)
      )
    ).then((counts) => {
      if (cancelled) return;
      setCounted({
        key: jumpsKey,
        jumps: Object.fromEntries(COMPARED_HUBS.map((hub, i) => [hub.id, counts[i]])) as Record<
          HubId,
          number | null
        >,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, basis, originSystemId, jumpsKey]);

  const hubs =
    fetched?.key === `${itemsKey}|${refreshTick}`
      ? fetched.hubs
      : allHubs(enabled ? { ...EMPTY_PRICES, loading: true } : EMPTY_PRICES);

  return {
    hubs,
    jumps: counted?.key === jumpsKey ? counted.jumps : NO_JUMPS,
  };
}
