import { useMemo } from 'react';
import type { IndustryActivity } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import { applyCostIndexOverride } from './costIndexOverride';
import { useMarketSnapshot } from './useMarketSnapshot';

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
  refreshTick: number
) {
  // Distinct from `pricesReady`: that one collapses "still fetching"
  // and "the live ESI call failed" into the same false, which used to flash
  // the "prices unavailable" warning on every fresh load before the first
  // response landed.
  const {
    snapshot: esiSnapshot,
    fetchedAt,
    loading: pricesLoading,
  } = useMarketSnapshot(hub, typeIds, buildSystemId, activity, refreshTick);
  // The pilot's own cost index outranks ESI's — the only one there is in
  // J-Space. Everything reads this; `esiSnapshot` is for asking what ESI
  // itself could not supply.
  const snapshot = useMemo(
    () => applyCostIndexOverride(esiSnapshot, costIndexOverridePct),
    [esiSnapshot, costIndexOverridePct]
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
    refreshTick
  );

  return { snapshot, costIndexMissing, fetchedAt, pricesLoading, reactionSnapshot };
}
