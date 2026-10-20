/**
 * The daily hub-station prices the mining pages value a mined day at
 * (docs/context/decisions/20261019-091155-mining-prices-read-the-open-prices.md):
 * the Open Prices `syncMarketOpenPrices` publishes to R2, one object per type
 * (`marketOpenPrices.ts`), read for every type a page prices. The same objects
 * draw Price History's Buy and Sell lines, so the mining pages and the chart
 * agree on a day's price and share one read.
 *
 * A station day feeds the tax ledgers' `saved` tier (`priceBasis.ts`).
 *
 * Never fails a caller: a type with no object (404), a failed read and a
 * malformed object all count as no days, and the tier chain falls further back.
 */
import { DEFAULT_TRADE_HUB, type TradeHub } from '@/market/hubs';
import type { OpenPriceSeries } from '@/engine/market/priceHistoryOpen';
import type { SidePrices } from '@/engine/miningTax/priceBasis';
import { loadStoredOpenPrices } from './marketOpenPrices';

export interface HubSnapshotRange {
  /** The hub station's end-of-day prices, by date then type id. */
  saved: Map<string, Map<number, SidePrices>>;
}

/** The series' prices on index `i`, or undefined when neither side has one. */
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

/**
 * Every day in `[startDate, endDate]` (inclusive) that `typeIds` have a price
 * at `hub`. Reads one object per type, in parallel.
 */
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
