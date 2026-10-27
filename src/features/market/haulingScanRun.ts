/**
 * The scan work `useHaulingScan` and `useHaulingFillScan` share: read the SDE
 * the scan needs, pick the type ids, then run the Hauling Opportunities scan.
 * Its own module so a test that mocks `./useHaulingScan` wholesale still gets
 * a working fill scan.
 */
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';
import {
  runHaulingScan,
  type HaulMode,
  type HaulingProgress,
  type HaulingScan,
} from './haulingData';
import type { HaulingEnd } from './haulingHubs';

export interface HaulingScanTarget {
  from: HaulingEnd;
  to: HaulingEnd;
  mode: HaulMode;
  /** See `HaulingScanRequest.scope`. */
  scope: number | string;
  /** See `HaulingScanRequest.maxUnitPrice`. */
  maxUnitPrice?: number | null;
  typeIds: (
    groups: readonly MarketGroupNode[],
    marketTypes: readonly MarketTypeEntry[]
  ) => number[];
}

export async function scanHaulingLane(
  target: HaulingScanTarget,
  signal: AbortSignal,
  onProgress: (progress: HaulingProgress) => void
): Promise<HaulingScan> {
  const [groups, marketTypes, types, groupCategories] = await Promise.all([
    loadMarketGroups(),
    loadMarketTypes(),
    loadTypes(),
    // Without it every category reads as unknown: items still plan, in the general hold only.
    loadGroupCategories().catch(() => ({})),
  ]);
  return runHaulingScan({
    from: target.from,
    to: target.to,
    typeIds: target.typeIds(groups, marketTypes),
    scope: target.scope,
    mode: target.mode,
    maxUnitPrice: target.maxUnitPrice,
    types,
    groupCategories,
    signal,
    onProgress,
  });
}
