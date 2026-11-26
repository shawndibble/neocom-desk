import type { TradeHub } from '@/market/hubs';

export function hasReachableUnpricedHub(
  unpricedByHub: ReadonlyMap<TradeHub['id'], ReadonlySet<number>>,
  unreachableHubs: ReadonlySet<TradeHub['id']>
): boolean {
  return [...unpricedByHub].some(
    ([hubId, typeIds]) => typeIds.size > 0 && !unreachableHubs.has(hubId)
  );
}
