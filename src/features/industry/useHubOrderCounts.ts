/**
 * Open order counts at a Trade Hub for each compared plan's product — one
 * Fuzzwork call per distinct hub, fetched only while a market column is shown.
 */
import { useCallback } from 'react';
import type { HubOrderCounts } from '@/market/fuzzwork';
import { fetchOrderCountsWithFallback } from '@/market/priceFallback';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { getTradeHub } from '@/market/hubs';

export interface HubOrderTarget {
  hubId: string;
  typeId: number;
}

export const hubOrderKey = (hubId: string, typeId: number) => `${hubId}:${typeId}`;

export interface HubOrderCountsState {
  counts: ReadonlyMap<string, HubOrderCounts>;
  /** True while the request for the current targets is in flight. */
  loading: boolean;
  /** True when a hub's request failed; its rows then have no entry. */
  failed: boolean;
}

const IDLE: HubOrderCountsState = { counts: new Map(), loading: false, failed: false };
const LOADING: HubOrderCountsState = { counts: new Map(), loading: true, failed: false };

/** One Fuzzwork call (ESI behind it) per hub in `key`; a hub whose call fails marks the whole result `failed`. */
async function loadCounts(key: string): Promise<HubOrderCountsState> {
  const byHub = new Map<string, number[]>();
  for (const entry of key.split(',')) {
    const [hubId, typeId] = entry.split(':') as [string, string];
    byHub.set(hubId, [...(byHub.get(hubId) ?? []), Number(typeId)]);
  }
  const results = await Promise.all(
    [...byHub].map(async ([hubId, typeIds]) => {
      const hub = getTradeHub(hubId);
      if (!hub) return { hubId, counts: null };
      return {
        hubId,
        counts: await fetchOrderCountsWithFallback(hub.stationId, typeIds).catch(() => null),
      };
    })
  );
  const counts = new Map<string, HubOrderCounts>();
  let failed = false;
  for (const { hubId, counts: hubCounts } of results) {
    if (!hubCounts) failed = true;
    else for (const [typeId, value] of hubCounts) counts.set(hubOrderKey(hubId, typeId), value);
  }
  return { counts, loading: false, failed };
}

export function useHubOrderCounts(
  targets: readonly HubOrderTarget[],
  enabled: boolean
): HubOrderCountsState {
  // Value-stable across renders that rebuild the same target list.
  const key = enabled
    ? [...new Set(targets.map((target) => hubOrderKey(target.hubId, target.typeId)))]
        .sort()
        .join(',')
    : '';
  const loader = useCallback(() => loadCounts(key), [key]);
  const { data } = useKeyedLoad(key === '' ? null : key, loader);

  if (key === '') return IDLE;
  return data ?? LOADING;
}
