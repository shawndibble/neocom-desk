import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompareSetItem } from './compareSet';
import type { HubAggregate } from '@/market/fuzzwork';
import { COMPARED_HUBS, type ComparedHubId } from '@/market/hubs';
import { getHubPricesWithStatus, invalidateHubPrices } from '@/market/prices';
import { jumpsBetween, useJumpBasis } from '@/features/route/jumpBasis';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export type HubId = ComparedHubId;

export interface HubPrices {
  loading: boolean;
  unreachable: boolean;
  prices: ReadonlyMap<number, HubAggregate>;
}

export interface UseCompareHubsResult {
  hubs: Readonly<Record<HubId, HubPrices>>;
  jumps: Readonly<Record<HubId, number | null>>;
}

const EMPTY_PRICES: HubPrices = { loading: false, unreachable: false, prices: new Map() };

function allHubs<T>(value: T): Record<HubId, T> {
  return Object.fromEntries(COMPARED_HUBS.map((hub) => [hub.id, value])) as Record<HubId, T>;
}

const NO_JUMPS: Readonly<Record<HubId, number | null>> = Object.freeze(allHubs(null));

export function useCompareHubs(
  items: readonly CompareSetItem[],
  enabled: boolean,
  refreshTick = 0
): UseCompareHubsResult {
  const [fetched, setFetched] = useState<{ key: string; hubs: Record<HubId, HubPrices> } | null>(
    null
  );

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
  const jumpsKey = `${basis.key}|${originSystemId}`;
  const countJumps = useCallback(
    () =>
      Promise.all(
        COMPARED_HUBS.map((hub) =>
          jumpsBetween(originSystemId ?? 0, hub.systemId, basis)
            .then((result) => (result.kind === 'known' ? result.jumps : null))
            .catch(() => null)
        )
      ).then(
        (counts) =>
          Object.fromEntries(COMPARED_HUBS.map((hub, i) => [hub.id, counts[i]])) as Record<
            HubId,
            number | null
          >
      ),
    [basis, originSystemId]
  );
  const counted = useKeyedLoad(
    originSystemId === null ? null : jumpsKey,
    countJumps,
    !enabled || !basis.hydrated
  );

  const hubs =
    fetched?.key === `${itemsKey}|${refreshTick}`
      ? fetched.hubs
      : allHubs(enabled ? { ...EMPTY_PRICES, loading: true } : EMPTY_PRICES);

  return {
    hubs,
    jumps: counted.data ?? NO_JUMPS,
  };
}
