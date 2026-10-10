/**
 * Open order counts at a Trade Hub for each compared plan's product — one
 * Fuzzwork call per distinct hub, fetched only while a market column is shown.
 */
import { useEffect, useState } from 'react';
import { fetchOrderCounts, type HubOrderCounts } from '@/market/fuzzwork';
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
  const [state, setState] = useState<{ key: string; value: HubOrderCountsState }>({
    key: '',
    value: IDLE,
  });

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    const byHub = new Map<string, number[]>();
    for (const entry of key.split(',')) {
      const [hubId, typeId] = entry.split(':') as [string, string];
      byHub.set(hubId, [...(byHub.get(hubId) ?? []), Number(typeId)]);
    }
    void Promise.all(
      [...byHub].map(async ([hubId, typeIds]) => {
        const hub = getTradeHub(hubId);
        if (!hub) return { hubId, counts: null };
        return { hubId, counts: await fetchOrderCounts(hub.stationId, typeIds).catch(() => null) };
      })
    ).then((results) => {
      if (cancelled) return;
      const counts = new Map<string, HubOrderCounts>();
      let failed = false;
      for (const { hubId, counts: hubCounts } of results) {
        if (!hubCounts) failed = true;
        else for (const [typeId, value] of hubCounts) counts.set(hubOrderKey(hubId, typeId), value);
      }
      setState({ key, value: { counts, loading: false, failed } });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (key === '') return IDLE;
  if (state.key !== key) return { counts: new Map(), loading: true, failed: false };
  return state.value;
}
