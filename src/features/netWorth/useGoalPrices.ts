import { useEffect, useState } from 'react';
import { loadFittingPrice } from '@/features/fittings/fittingPrice';
import type { FittingChoices } from '@/features/fittings/useFittingChoices';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { WalletGoal } from './walletGoalSetting';

export type GoalPrice =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; sell: number };

/**
 * The target of each Fitting-priced Goal: the Fitting's sell price at the
 * default Trade Hub (what buying it off the hub costs), read again on each
 * visit so it follows the market. Keyed by Goal id.
 */
export function useGoalPrices(
  goals: readonly WalletGoal[],
  resolve: FittingChoices['resolve'],
  ready: boolean
): ReadonlyMap<string, GoalPrice> {
  const [prices, setPrices] = useState<ReadonlyMap<string, GoalPrice>>(new Map());
  const wanted = goals.filter((goal) => goal.fittingId !== null);
  const wantedKey = wanted.map((goal) => `${goal.id}:${goal.fittingId}`).join('|');

  useEffect(() => {
    if (!ready || wantedKey === '') return;
    let cancelled = false;
    const pairs = wantedKey.split('|').map((pair) => {
      const [id, ...rest] = pair.split(':');
      return { id: id!, fittingId: rest.join(':') };
    });
    void Promise.all(
      pairs.map(async ({ id, fittingId }): Promise<[string, GoalPrice]> => {
        try {
          const picked = await resolve(fittingId);
          if (!picked) return [id, { status: 'failed' }];
          const price = await loadFittingPrice(picked.fitting, DEFAULT_TRADE_HUB);
          const sell = price.totals.sell;
          return [id, sell > 0 ? { status: 'ready', sell } : { status: 'failed' }];
        } catch {
          return [id, { status: 'failed' }];
        }
      })
    ).then((entries) => {
      if (!cancelled) setPrices(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [wantedKey, resolve, ready]);

  return prices;
}
