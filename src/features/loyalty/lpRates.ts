import { blueprintLpRate, lpRate, type LpRate } from '@/engine/loyalty/marketLpValue';
import type { TradeHub } from '@/market/hubs';
import { useLpValue } from './lpValue';
import { loadMarketLpValues } from './marketLpValue';

async function ownLpValue(): Promise<number> {
  try {
    await useLpValue.getState().hydrate();
  } catch {}
  return useLpValue.getState().value;
}

export async function loadLpRates(
  corporationIds: Iterable<number>,
  hub: TradeHub
): Promise<(corporationId: number) => LpRate> {
  const own = await ownLpValue();
  const market =
    own > 0 ? new Map<number, number | null>() : await loadMarketLpValues(corporationIds, hub);
  return (corporationId) => lpRate(own, market.get(corporationId) ?? null);
}

export async function loadBlueprintLpRate(): Promise<LpRate> {
  return blueprintLpRate(await ownLpValue());
}
