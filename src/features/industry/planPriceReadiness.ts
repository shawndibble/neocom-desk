import type { MarketSnapshot } from './marketData';

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
