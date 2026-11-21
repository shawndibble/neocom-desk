import { useMemo } from 'react';
import type { IndustryActivity } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import { applyCostIndexOverride } from './costIndexOverride';
import { applyProductSalePrice } from './productPriceCap';
import { useMarketSnapshot } from './useMarketSnapshot';
import { usePricePercentFor } from '@/features/market/pagePricePercents';

/**
 * The plan's two market snapshots: the primary one at its build system, and
 * the Reaction Location's own cost index.
 */
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
  // A plan keeps its own hub but prices at the Industry percent (issue #6531).
  const pricePercent = usePricePercentFor('industry');
  // Distinct from `pricesReady`: that one collapses "still fetching"
  // and "the live ESI call failed" into the same false, which used to flash
  // the "prices unavailable" warning on every fresh load before the first
  // response landed.
  const {
    snapshot: esiSnapshot,
    fetchedAt,
    loading: pricesLoading,
  } = useMarketSnapshot(hub, typeIds, buildSystemId, activity, refreshTick, pricePercent);
  // The pilot's own cost index outranks ESI's — the only one there is in
  // J-Space. Everything reads this; `esiSnapshot` is for asking what ESI
  // itself could not supply.
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

  // The Reaction Location's own cost index — a second, independent fetch
  // (issue #698): sharing `snapshot` would charge a reaction job at the
  // primary facility's system, which is exactly the wrong number Include
  // Reactions exists to fix. Hub prices/adjusted prices are cached by
  // (station, type) after the primary fetch above already resolved them, so
  // this only really costs the one additional cost-index lookup.
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
