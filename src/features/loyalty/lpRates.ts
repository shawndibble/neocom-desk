/**
 * The rate each store's LP is priced at, wherever LP is priced: the pilot's
 * own **LP Value** when they've set one (for every store), else that store's
 * market LP Value at the Trade Hub being priced at (`marketLpValue.ts`).
 */
import { lpRate, type LpRate } from '@/engine/loyalty/marketLpValue';
import type { TradeHub } from '@/market/hubs';
import { useLpValue } from './lpValue';
import { loadMarketLpValues } from './marketLpValue';

async function ownLpValue(): Promise<number> {
  try {
    await useLpValue.getState().hydrate();
  } catch {
    // An unreadable setting is the default rate, as everywhere else.
  }
  return useLpValue.getState().value;
}

/** `lpRate` for each of `corporationIds` at `hub`; a null rate for a store nothing prices. */
export async function loadLpRates(
  corporationIds: Iterable<number>,
  hub: TradeHub
): Promise<(corporationId: number) => LpRate> {
  const own = await ownLpValue();
  const market =
    own > 0 ? new Map<number, number | null>() : await loadMarketLpValues(corporationIds, hub);
  return (corporationId) => lpRate(own, market.get(corporationId) ?? null);
}
