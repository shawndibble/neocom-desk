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
      out.clear();
    }
    return out;
  }, [characterId, ids, stationId]);

  return useKeyedLoad(scope, load).data ?? NONE;
}
