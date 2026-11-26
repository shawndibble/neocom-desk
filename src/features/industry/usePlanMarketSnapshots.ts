import { useMemo } from 'react';
import type { IndustryActivity } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import { applyCostIndexOverride } from './costIndexOverride';
import { applyProductSalePrice } from './productPriceCap';
import { useMarketSnapshot } from './useMarketSnapshot';
import { usePricePercentFor } from '@/features/market/pagePricePercents';

export function usePlanMarketSnapshots(
  hub: TradeHub,
  typeIds: readonly number[],
  buildSystemId: number | undefined,
  reactionBuildSystemId: number | undefined,
  activity: IndustryActivity,
  costIndexOverridePct: number | undefined,
  productTypeID: number | null,
  productSalePrice: number | undefined,
  refreshTick: number
) {
  const pricePercent = usePricePercentFor('industry');
  const {
    snapshot: esiSnapshot,
    fetchedAt,
    loading: pricesLoading,
  } = useMarketSnapshot(hub, typeIds, buildSystemId, activity, refreshTick, pricePercent);
  const snapshot = useMemo(
    () =>
      applyProductSalePrice(
        applyCostIndexOverride(esiSnapshot, costIndexOverridePct),
        productTypeID,
        productSalePrice
      ),
    [esiSnapshot, costIndexOverridePct, productTypeID, productSalePrice]
  );
  const costIndexMissing = esiSnapshot?.systemCostIndexMissing === true;

  const { snapshot: reactionSnapshot } = useMarketSnapshot(
    hub,
    typeIds,
    reactionBuildSystemId,
    'reaction',
    refreshTick,
    pricePercent
  );

  return { snapshot, costIndexMissing, fetchedAt, pricesLoading, reactionSnapshot };
}
