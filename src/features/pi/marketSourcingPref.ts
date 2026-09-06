/**
 * Device-local: which hub, if any, may the Advisor assume you can buy
 * planetary inputs at?
 *
 * `'none'` by default, and that default is the point. Buying P1 to feed an
 * Advanced Industry Facility is a good strategy and a common one, but it
 * assumes a trade hub you can actually reach — the pilot this was built with is
 * thirty minutes out, which turns "+6,300 ISK an hour" into a standing freight
 * commitment they did not agree to. Advice that quietly assumes a shop next
 * door is advice for somebody else's operation.
 *
 * ## Why a hub and not a yes/no
 *
 * It was a checkbox, which forced every figure on the tab through Jita whether
 * or not that was the market the pilot could reach. Naming the hub makes the
 * control honest: it is both the permission and the price basis, so an Amarr
 * pilot's margins are Amarr's. `'none'` keeps the reference hub for revenue —
 * output still has to be priced somewhere — while refusing to plan a purchase.
 *
 * What this does *not* gate is routing between the pilot's own colonies. That
 * is hauling too, but it is hauling they already control, and it is the case
 * the Advisor exists to spot: four planets each refining a different P1 that no
 * one planet can combine. `planNetwork` finds those with this off.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';

export const PI_MARKET_SOURCING_KEY = 'piMarketSourcing';

/** A hub to buy at, or `'none'` — do not assume a shop is reachable. */
export type MarketSourcing = TradeHub['id'] | 'none';

export const DEFAULT_PI_MARKET_SOURCING: MarketSourcing = 'none';

export const useMarketSourcing = createLocalSetting<MarketSourcing>({
  key: PI_MARKET_SOURCING_KEY,
  defaultValue: DEFAULT_PI_MARKET_SOURCING,
  // This key held a boolean before the control became a hub picker, so a
  // stored `true`/`false` fails the check and falls back to `'none'`. That is
  // the right migration in both directions: `false` meant exactly `'none'`,
  // and `true` meant "Jita, because Jita was the only option" — an assumption
  // worth making the pilot restate now that it is a choice.
  parse: (raw) =>
    raw === 'none' || TRADE_HUBS.some((hub) => hub.id === raw) ? (raw as MarketSourcing) : null,
});
