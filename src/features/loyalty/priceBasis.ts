import type { HubPrices } from '@/engine/industry/types';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';
import type { TradedPrices } from '@/engine/market/tradedPriceCheck';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { atPercent } from '@/features/market/pagePricePercents';
import { hubPricesAtPercent } from '@/features/market/hubPricesAtPercent';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';

export type PriceBasis = 'sell' | 'buy';

export const PRICE_BASIS_SETTING_KEY = 'loyaltyStorePriceBasis';

export const DEFAULT_PRICE_BASIS: PriceBasis = 'sell';

export const usePriceBasis = createLocalSetting<PriceBasis>({
  key: PRICE_BASIS_SETTING_KEY,
  defaultValue: DEFAULT_PRICE_BASIS,
  parse: (raw) => (raw === 'sell' || raw === 'buy' ? raw : null),
});

export function revenuePricing(
  snapshot: { hubPrices: HubPrices; hubBuyPrices: HubPrices },
  basis: PriceBasis
): { revenueHubPrices: HubPrices; liquidationBasis: LiquidationBasis } {
  return basis === 'buy'
    ? { revenueHubPrices: snapshot.hubBuyPrices, liquidationBasis: 'instant' }
    : { revenueHubPrices: snapshot.hubPrices, liquidationBasis: 'order' };
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

export function lpPricesAtPercent<S extends { hubPrices: HubPrices; hubBuyPrices: HubPrices }>(
  snapshot: S,
  tradedPrices: ReadonlyMap<number, TradedPrices> | null | undefined,
  percent: number
): { snapshot: S; tradedPrices: ReadonlyMap<number, TradedPrices> | null | undefined } {
  if (percent === DEFAULT_PRICE_PERCENT) return { snapshot, tradedPrices };
  return {
    snapshot: {
      ...snapshot,
      hubPrices: hubPricesAtPercent(snapshot.hubPrices, percent),
      hubBuyPrices: hubPricesAtPercent(snapshot.hubBuyPrices, percent),
    },
    tradedPrices:
      tradedPrices &&
      new Map([...tradedPrices].map(([typeId, t]) => [typeId, tradedAtPercent(t, percent)])),
  };
}
