import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { RegionOrder } from '@/esi/endpoints';
import {
  resolveOrderLocation,
  orderExpiry,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import { orderFees, type OrderFeeContext } from '@/engine/market/orderFees';
import { priceComparison, sellOutlierMultiple } from '@/engine/market/orderBookDepth';
import { exportFlag } from '@/lib/exportFlag';
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
  /** A row's jump count from the Current System; null when unmeasurable or not yet known. */
  jumpsFor: (systemId: number) => number | null;
  /** What the fee columns price with; null until the active Character's skills are known (the fee cells are then blank). */
  feeContext: OrderFeeContext | null;
  myOrderIds: ReadonlySet<number>;
  /** The side's best price, which "vs best" and the bait flag measure against. */
  best: number | null;
}

/**
 * CSV columns for the Market Browser's order book: price, quantity,
 * location, expiry, and — for buy orders — range and min volume. `price`
 * and `quantity` are raw numbers, not `formatIsk`/`formatVolume` strings.
 * `expiry` is the computed expiry as a raw ISO string, not the
 * `toLocaleDateString()` display rendering. `location` reuses the same
 * resolved station/system text the location column renders, since a raw
 * `location_id` alone isn't meaningful outside the app. Every column the
 * table can show is here, whichever the column picker has ticked (security,
 * jumps, the fee pair), plus the marks and row-expand facts: your order, bait,
 * total volume, issue date, order value and distance from the best price.
 */
export function orderBookCsvColumns(
  t: CsvTranslate,
  { npcStations, solarSystems, isBuy, jumpsFor, feeContext, myOrderIds, best }: OrderBookCsvOptions
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
    {
      header: t('market.securityColumn'),
      value: (order) => resolveOrderLocation(order, npcStations, solarSystems).security,
    },
    { header: t('market.jumpsColumn'), value: (order) => jumpsFor(order.system_id) },
    {
      header: t('market.feesColumn'),
      value: (order) => (feeContext === null ? null : orderFees(order, feeContext).fees),
    },
    {
      header: t('market.finalPriceColumn'),
      value: (order) => (feeContext === null ? null : orderFees(order, feeContext).finalPrice),
    },
    {
      header: t('market.exportMyOrder'),
      value: (order) => exportFlag(t, myOrderIds.has(order.order_id)),
    },
    { header: t('market.exportVolumeTotal'), value: (order) => order.volume_total },
    { header: t('market.exportIssued'), value: (order) => order.issued },
    {
      header: t('market.orderDetail.orderValue'),
      value: (order) => order.price * order.volume_remain,
    },
    {
      header: t('market.exportVsBest'),
      value: (order) => priceComparison(best, order.price)?.delta ?? null,
    },
    {
      header: t('market.exportVsBestPct'),
      value: (order) => {
        const ratio = priceComparison(best, order.price)?.ratio;
        return ratio === undefined ? null : ratio * 100;
      },
    },
    { header: t('market.expiry'), value: (order) => orderExpiry(order).toISOString() },
  ];
  if (!isBuy) {
    columns.push({
      header: t('market.exportBait'),
      value: (order) => exportFlag(t, sellOutlierMultiple(order.price, best) !== null),
    });
  }
  if (isBuy) {
    columns.push(
      { header: t('market.range'), value: (order) => rangeLabel(order.range, t) },
      { header: t('market.minVolume'), value: (order) => order.min_volume ?? null }
    );
  }
  return columns;
}
