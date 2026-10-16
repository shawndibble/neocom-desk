import type { TradeHub } from '@/market/hubs';

/**
 * Whether any hub with unpriced ore actually answered (so its gap is a thin
 * order book, not a failed fetch). Decides the banner's title.
 */
export function hasReachableUnpricedHub(
  unpricedByHub: ReadonlyMap<TradeHub['id'], ReadonlySet<number>>,
  unreachableHubs: ReadonlySet<TradeHub['id']>
): boolean {
  return [...unpricedByHub].some(
    ([hubId, typeIds]) => typeIds.size > 0 && !unreachableHubs.has(hubId)
  );
}
