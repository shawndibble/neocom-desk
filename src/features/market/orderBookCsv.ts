import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { RegionOrder } from '@/esi/endpoints';
import {
  resolveOrderLocation,
  orderExpiry,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import { formatOrderLocationText } from './format';

/** "station" / "region" / "solarsystem" / a jump count, translated for display and export alike. */
export function rangeLabel(range: string, t: CsvTranslate): string {
  if (range === 'station') return t('market.rangeStation');
  if (range === 'region') return t('market.rangeRegion');
  if (range === 'solarsystem') return t('market.rangeSystem');
  const jumps = Number(range);
  return Number.isFinite(jumps) ? t('market.rangeJumps', { count: jumps }) : range;
}

interface OrderBookCsvOptions {
  npcStations: ReadonlyMap<number, NpcStationLookup>;
  solarSystems: ReadonlyMap<number, SolarSystemLookup>;
  /** Buy orders add range + min volume columns; sell orders don't carry a meaningful min volume. */
  isBuy: boolean;
}

/**
 * CSV columns for the Market Browser's order book: price, quantity,
 * location, expiry, and — for buy orders — range and min volume. `price`
 * and `quantity` are raw numbers, not `formatIsk`/`formatVolume` strings.
 * `expiry` is the computed expiry as a raw ISO string, not the
 * `toLocaleDateString()` display rendering. `location` reuses the same
 * resolved station/system text the location column renders, since a raw
 * `location_id` alone isn't meaningful outside the app.
 */
export function orderBookCsvColumns(
  t: CsvTranslate,
  { npcStations, solarSystems, isBuy }: OrderBookCsvOptions
): CsvColumn<RegionOrder>[] {
  const columns: CsvColumn<RegionOrder>[] = [
    { header: t('market.price'), value: (order) => order.price },
    { header: t('market.quantity'), value: (order) => order.volume_remain },
    {
      header: t('market.location'),
      value: (order) =>
        formatOrderLocationText(
          resolveOrderLocation(order, npcStations, solarSystems),
          t('market.unknownStructure')
        ),
    },
    { header: t('market.expiry'), value: (order) => orderExpiry(order).toISOString() },
  ];
  if (isBuy) {
    columns.push(
      { header: t('market.range'), value: (order) => rangeLabel(order.range, t) },
      { header: t('market.minVolume'), value: (order) => order.min_volume ?? null }
    );
  }
  return columns;
}
