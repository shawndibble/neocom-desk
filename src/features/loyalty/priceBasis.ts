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
 * (CONTEXT.md).
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export type PriceBasis = 'sell' | 'buy';

export const PRICE_BASIS_SETTING_KEY = 'loyaltyStorePriceBasis';

export const DEFAULT_PRICE_BASIS: PriceBasis = 'sell';

export const usePriceBasis = createLocalSetting<PriceBasis>({
  key: PRICE_BASIS_SETTING_KEY,
  defaultValue: DEFAULT_PRICE_BASIS,
  parse: (raw) => (raw === 'sell' || raw === 'buy' ? raw : null),
});
