/**
 * Orders that traded per day in each compared plan's hub region, from ESI's
 * market history (its `order_count`, averaged over 30 days). Per region, never
 * per hub — ESI has no finer cut. Fetched only while the column is shown;
 * each region's history is cached until ESI's daily rollover.
 */
import { useEffect, useState } from 'react';
import { averageDailyOrders } from '@/engine/industry/marketWideSanity';
import { EsiError } from '@/esi/errors';
import { loadPriceHistory } from '@/features/market/priceHistory';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { getTradeHub } from '@/market/hubs';
import { hubOrderKey, type HubOrderTarget } from './useHubOrderCounts';

export interface HubDailyOrdersState {
  /** Orders a day by `hubOrderKey`; absent where the read failed. */
  perDay: ReadonlyMap<string, number>;
  loading: boolean;
}

const IDLE: HubDailyOrdersState = { perDay: new Map(), loading: false };

export function useHubDailyOrders(
  targets: readonly HubOrderTarget[],
  enabled: boolean
): HubDailyOrdersState {
  const key = enabled
    ? [...new Set(targets.map((target) => hubOrderKey(target.hubId, target.typeId)))]
        .sort()
        .join(',')
    : '';
  const [state, setState] = useState<{ key: string; value: HubDailyOrdersState }>({
    key: '',
    value: IDLE,
  });

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    const perDay = new Map<string, number>();
    void mapWithConcurrencyLimit(key.split(','), ESI_FANOUT_CONCURRENCY, async (entry) => {
      const [hubId, typeId] = entry.split(':') as [string, string];
      const hub = getTradeHub(hubId);
      if (!hub) return;
      try {
        const { points } = await loadPriceHistory(hub.regionId, Number(typeId));
        perDay.set(entry, averageDailyOrders(points, Date.now()));
      } catch (error) {
        // A type with no market (ESI 400) traded no orders; anything else is unknown.
        if (error instanceof EsiError && error.status === 400) perDay.set(entry, 0);
      }
    }).then(() => {
      if (!cancelled) setState({ key, value: { perDay, loading: false } });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (key === '') return IDLE;
  if (state.key !== key) return { perDay: new Map(), loading: true };
  return state.value;
}
