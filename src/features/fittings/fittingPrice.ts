import { buildAppraisal, type Appraisal } from '@/engine/market/appraisal';
import { FULL_PRICE_PERCENT, fitAppraisalItems } from '@/engine/fittings/fitSellPrice';
import { getHubPricesAt } from '@/features/market/hubPricesAtPercent';
import type { TradeHub } from '@/market/hubs';
import { fittingItemCounts } from '@/engine/fittings/fittingExport';
import type { Fitting } from '@/engine/fittings/types';

export function unpricedSellRows<T extends { sellTotal: number | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.sellTotal === null);
}

export async function loadFittingPrice(
  fitting: Fitting,
  hub: TradeHub,
  cloneImplants: readonly number[] = [],
  percent = 100
): Promise<Appraisal> {
  const counts = fittingItemCounts(fitting, cloneImplants);
  const prices = await getHubPricesAt(hub, [...counts.keys()], percent);
  return buildAppraisal(fitAppraisalItems(counts, prices), FULL_PRICE_PERCENT);
}
