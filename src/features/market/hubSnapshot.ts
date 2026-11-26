import { DEFAULT_TRADE_HUB, type TradeHub } from '@/market/hubs';
import type { OpenPriceSeries } from '@/engine/market/priceHistoryOpen';
import type { SidePrices } from '@/engine/miningTax/priceBasis';
import { loadStoredOpenPrices } from './marketOpenPrices';

export interface HubSnapshotRange {
  saved: Map<string, Map<number, SidePrices>>;
}

function dayAt(series: OpenPriceSeries | undefined, i: number): SidePrices | undefined {
  const buy = series?.buy[i] ?? null;
  const sell = series?.sell[i] ?? null;
  return buy === null && sell === null ? undefined : { buy, sell };
}

function put(
  target: Map<string, Map<number, SidePrices>>,
  date: string,
  typeId: number,
  prices: SidePrices
) {
  let day = target.get(date);
  if (!day) target.set(date, (day = new Map()));
  day.set(typeId, prices);
}

export async function loadHubSnapshotRange(
  startDate: string,
  endDate: string,
  typeIds: readonly number[],
  hub: TradeHub = DEFAULT_TRADE_HUB
): Promise<HubSnapshotRange> {
  const result: HubSnapshotRange = { saved: new Map() };
  const unique = [...new Set(typeIds)];
  if (startDate > endDate || unique.length === 0) return result;
  const objects = await Promise.all(unique.map((typeId) => loadStoredOpenPrices(typeId)));
  unique.forEach((typeId, index) => {
    const stored = objects[index];
    if (!stored) return;
    const station = stored.stations.get(hub.stationId);
    station?.dates.forEach((date, i) => {
      if (date < startDate || date > endDate) return;
      const day = dayAt(station, i);
      if (day) put(result.saved, date, typeId, day);
    });
  });
  return result;
}
