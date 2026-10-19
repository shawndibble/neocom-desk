/**
 * Orders that traded per day in each compared plan's hub region, from ESI's
 * market history (its `order_count`, averaged over 30 days). Per region, never
 * per hub — ESI has no finer cut. Fetched only while the column is shown;
 * each region's history is cached until ESI's daily rollover.
 */
import { useCallback } from 'react';
import { averageDailyOrders } from '@/engine/industry/marketWideSanity';
import { EsiError } from '@/esi/errors';
import { loadPriceHistory } from '@/features/market/priceHistory';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { getTradeHub } from '@/market/hubs';
import { hubOrderKey, type HubOrderTarget } from './useHubOrderCounts';

export interface HubDailyOrdersState {
  /** Orders a day by `hubOrderKey`; absent where the read failed. */
  perDay: ReadonlyMap<string, number>;
  loading: boolean;
}

const IDLE: HubDailyOrdersState = { perDay: new Map(), loading: false };
const LOADING: HubDailyOrdersState = { perDay: new Map(), loading: true };

async function loadDailyOrders(key: string): Promise<HubDailyOrdersState> {
  const perDay = new Map<string, number>();
  await mapWithConcurrencyLimit(key.split(','), ESI_FANOUT_CONCURRENCY, async (entry) => {
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
  });
  return { perDay, loading: false };
}

export function useHubDailyOrders(
  targets: readonly HubOrderTarget[],
  enabled: boolean
): HubDailyOrdersState {
  const key = enabled
    ? [...new Set(targets.map((target) => hubOrderKey(target.hubId, target.typeId)))]
        .sort()
        .join(',')
    : '';
  const loader = useCallback(() => loadDailyOrders(key), [key]);
  const { data } = useKeyedLoad(key === '' ? null : key, loader);

  if (key === '') return IDLE;
  return data ?? LOADING;
}
