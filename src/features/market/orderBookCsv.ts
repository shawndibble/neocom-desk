import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { RegionOrder } from '@/esi/endpoints';
import {
  resolveOrderLocation,
  orderExpiry,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import { orderFees, type OrderFeeContext } from '@/engine/market/orderFees';
import {
  comparisonPct,
  priceComparison,
  sellOutlierMultiple,
} from '@/engine/market/orderBookDepth';
import { memoByRow } from '@/lib/memoByRow';
import { exportFlag } from '@/lib/exportFlag';
import { formatOrderLocationText } from './format';

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
  isBuy: boolean;
  jumpsFor: (systemId: number) => number | null;
  feeContext: OrderFeeContext | null;
  myOrderIds: ReadonlySet<number>;
  best: number | null;
}

export function orderBookCsvColumns(
  t: CsvTranslate,
  { npcStations, solarSystems, isBuy, jumpsFor, feeContext, myOrderIds, best }: OrderBookCsvOptions
): CsvColumn<RegionOrder>[] {
  const feesOf = memoByRow((order: RegionOrder) =>
    feeContext === null ? null : orderFees(order, feeContext)
  );
  const versusBest = memoByRow((order: RegionOrder) => priceComparison(best, order.price));
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
      value: (order) => feesOf(order)?.fees ?? null,
    },
    {
      header: t('market.finalPriceColumn'),
      value: (order) => feesOf(order)?.finalPrice ?? null,
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
      value: (order) => versusBest(order)?.delta ?? null,
    },
    {
      header: t('market.exportVsBestPct'),
      value: (order) => comparisonPct(versusBest(order)),
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
