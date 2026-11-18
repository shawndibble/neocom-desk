/**
 * Per Quickbar item: current hub sell price against what the active character
 * paid for the units it still holds (issue #5333). Nothing is stored. The paid
 * side is the wallet's FIFO (`paidBasis`); the price side is the stored daily
 * hub-station sell price the Price History chart already reads, so no market
 * call is added. An item with no covered basis is simply absent from the map.
 */
import { useCallback, useMemo } from 'react';
import { hasWalletScope, loadWalletTransactions } from '@/features/character/wallet';
import { paidBasis, percentVsPaid } from '@/engine/market/paidVsPrice';
import type { TradeHub } from '@/market/hubs';
import { toWalletTrade } from './orderCostBasis';
import { loadStoredOpenPrices } from './marketOpenPrices';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export interface VsPaid {
  percent: number;
  paid: number;
  price: number;
  units: number;
}

/** The newest day with a sell price at the hub station, or null. */
function latestSell(
  stored: Awaited<ReturnType<typeof loadStoredOpenPrices>>,
  stationId: number
): number | null {
  const series = stored?.stations.get(stationId);
  if (!series) return null;
  for (let i = series.sell.length - 1; i >= 0; i--) {
    const sell = series.sell[i];
    if (sell !== null) return sell;
  }
  return null;
}

const NONE: ReadonlyMap<number, VsPaid> = new Map();

export function useQuickbarVsPaid(
  characterId: number | null,
  typeIds: readonly number[],
  hub: TradeHub
): ReadonlyMap<number, VsPaid> {
  // Sorted: a reorder must not reload the wallet.
  const key = [...typeIds].sort((a, b) => a - b).join(',');
  const ids = useMemo(() => (key === '' ? [] : key.split(',').map(Number)), [key]);
  const stationId = hub.stationId;
  const scope = `${characterId}:${stationId}:${key}`;

  const load = useCallback(async (): Promise<ReadonlyMap<number, VsPaid>> => {
    const out = new Map<number, VsPaid>();
    try {
      if (characterId !== null && ids.length > 0 && (await hasWalletScope(characterId))) {
        const wallet = await loadWalletTransactions(characterId);
        if (wallet) {
          const transactions = wallet.data.map(toWalletTrade);
          const truncated = wallet.truncated ?? false;
          const bases = ids.flatMap((typeId) => {
            const basis = paidBasis({ transactions, typeId, truncated });
            return basis ? [{ typeId, basis }] : [];
          });
          const stored = await Promise.all(bases.map((b) => loadStoredOpenPrices(b.typeId)));
          bases.forEach(({ typeId, basis }, i) => {
            const price = latestSell(stored[i], stationId);
            const percent = percentVsPaid(price, basis.unitCost);
            if (price === null || percent === null) return;
            out.set(typeId, { percent, paid: basis.unitCost, price, units: basis.units });
          });
        }
      }
    } catch {
      // A decoration: any read failure means no chip, never an error.
      out.clear();
    }
    return out;
  }, [characterId, ids, stationId]);

  // Keyed by scope: never show the previous character's figures while this one loads.
  return useKeyedLoad(scope, load).data ?? NONE;
}
