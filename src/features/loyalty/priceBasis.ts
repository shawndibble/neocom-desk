/**
 * The LP store's revenue price basis — "sell" (list an order at the hub's
 * lowest sell, the default and today's only behavior) or "buy" (dump
 * instantly to the hub's highest buy order: faster ISK, usually less of it).
 * Only affects how an offer's *revenue* is priced (`offerRows.ts`'s
 * `revenueHubPrices`) — materials and `required_items` turn-ins always price
 * at the sell side, same as Build Plan.
 *
 * Persisted like the market hub picker beside it (`features/market/hub.ts`):
 * a device-local UI preference, not Editable Data, so it's never synced
 * (GLOSSARY.md).
 */
import type { HubPrices } from '@/engine/industry/types';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';
import type { TradedPrices } from '@/engine/market/tradedPriceCheck';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { atPercent } from '@/features/market/pagePricePercents';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';

export type PriceBasis = 'sell' | 'buy';

export const PRICE_BASIS_SETTING_KEY = 'loyaltyStorePriceBasis';

export const DEFAULT_PRICE_BASIS: PriceBasis = 'sell';

export const usePriceBasis = createLocalSetting<PriceBasis>({
  key: PRICE_BASIS_SETTING_KEY,
  defaultValue: DEFAULT_PRICE_BASIS,
  parse: (raw) => (raw === 'sell' || raw === 'buy' ? raw : null),
});

/**
 * The revenue side of `computeLoyaltyOfferRows` for a basis, shared by every
 * caller so one offer never shows two ISK/LP: "sell" lists an order at the
 * hub's sell price, "buy" dumps into its standing buy orders.
 */
export function revenuePricing(
  snapshot: { hubPrices: HubPrices; hubBuyPrices: HubPrices },
  basis: PriceBasis
): { revenueHubPrices: HubPrices; liquidationBasis: LiquidationBasis } {
  return basis === 'buy'
    ? { revenueHubPrices: snapshot.hubBuyPrices, liquidationBasis: 'instant' }
    : { revenueHubPrices: snapshot.hubPrices, liquidationBasis: 'order' };
}

function mapAtPercent(prices: HubPrices, percent: number): HubPrices {
  const out: HubPrices = {};
  for (const [typeId, price] of Object.entries(prices))
    out[Number(typeId)] = atPercent(price, percent);
  return out;
}

function tradedAtPercent(traded: TradedPrices, percent: number): TradedPrices {
  return {
    recentSalePrice:
      traded.recentSalePrice === null ? null : atPercent(traded.recentSalePrice, percent),
    latestDay: traded.latestDay && {
      ...traded.latestDay,
      highest: atPercent(traded.latestDay.highest, percent),
      lowest: atPercent(traded.latestDay.lowest, percent),
    },
  };
}

/**
 * The LP Store's hub prices at its page price percent (issue #6531,
 * `usePricePercentFor('lpStore')`): both sides of the book, so offer revenue,
 * `required_items` turn-ins and blueprint materials all move together, and the
 * recent trades a sale is checked against, so a capped sale scales too
 * (`capListedPrice` of two scaled prices is the scaled cap). At 100 the inputs
 * come back as they are.
 */
export function lpPricesAtPercent<S extends { hubPrices: HubPrices; hubBuyPrices: HubPrices }>(
  snapshot: S,
  tradedPrices: ReadonlyMap<number, TradedPrices> | null | undefined,
  percent: number
): { snapshot: S; tradedPrices: ReadonlyMap<number, TradedPrices> | null | undefined } {
  if (percent === DEFAULT_PRICE_PERCENT) return { snapshot, tradedPrices };
  return {
    snapshot: {
      ...snapshot,
      hubPrices: mapAtPercent(snapshot.hubPrices, percent),
      hubBuyPrices: mapAtPercent(snapshot.hubBuyPrices, percent),
    },
    tradedPrices:
      tradedPrices &&
      new Map([...tradedPrices].map(([typeId, t]) => [typeId, tradedAtPercent(t, percent)])),
  };
}
