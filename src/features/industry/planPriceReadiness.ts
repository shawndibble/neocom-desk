import type { MarketSnapshot } from './marketData';

/**
 * Whether the plan can be priced yet, and whether the price source is down.
 *
 * Blueprint prices are provisional until the market/LP offers land, so the
 * page doesn't offer to "find" a blueprint the next render prices.
 * An unreachable price source reads as "not ready", never as free materials.
 * Either source being down leaves the result unpriceable: the hub lookup, or
 * the ESI adjusted prices the job cost is computed from.
 */
export function planPriceReadiness(snapshot: MarketSnapshot | null, blueprintOffersReady: boolean) {
  const pricesUnreachable =
    snapshot !== null &&
    (snapshot.hubPricesUnreachable === true || snapshot.adjustedPrices === null);
  const pricesReady =
    snapshot !== null &&
    snapshot.adjustedPrices !== null &&
    snapshot.systemCostIndex !== null &&
    !pricesUnreachable &&
    blueprintOffersReady;
  return { pricesUnreachable, pricesReady };
}
