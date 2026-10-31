import { useEffect, useMemo, useState } from 'react';
import { loadFittingPrice, unpricedSellRows } from '@/features/fittings/fittingPrice';
import type { FittingChoices } from '@/features/fittings/useFittingChoices';
import type { TradeHub } from '@/market/hubs';
import type { WalletGoal } from './walletGoalSetting';

/** Absent while loading. `partial`: some items have no sell order, so a total would undercount. */
export type GoalPrice =
  { status: 'failed' } | { status: 'partial' } | { status: 'ready'; sell: number };

/** Identity of a Goal's price: a new Fitting on the same Goal is a new price. */
export const goalPriceKey = (goal: Pick<WalletGoal, 'id' | 'fittingId'>) =>
  JSON.stringify([goal.id, goal.fittingId]);

/**
 * The target of each Fitting-priced Goal: the Fitting's sell price at `hub`
 * (what buying it off the hub costs), read again on each visit so it follows
 * the market. Keyed by `goalPriceKey`.
 */
export function useGoalPrices(
  goals: readonly WalletGoal[],
  hub: TradeHub,
  resolve: FittingChoices['resolve'],
  ready: boolean
): ReadonlyMap<string, GoalPrice> {
  const [loaded, setLoaded] = useState<{ key: string; prices: ReadonlyMap<string, GoalPrice> }>({
    key: '',
    prices: new Map(),
  });
  const wantedKey = JSON.stringify(
    goals.filter((goal) => goal.fittingId !== null).map((goal) => [goal.id, goal.fittingId])
  );
  const effectKey = `${hub.id}|${wantedKey}`;

  useEffect(() => {
    const wanted = JSON.parse(wantedKey) as [string, string][];
    if (!ready || wanted.length === 0) return;
    let cancelled = false;
    void Promise.all(
      wanted.map(async ([id, fittingId]): Promise<[string, GoalPrice]> => {
        const key = goalPriceKey({ id, fittingId });
        try {
          const picked = await resolve(fittingId);
          if (!picked) return [key, { status: 'failed' }];
          const price = await loadFittingPrice(picked.fitting, hub);
          if (unpricedSellRows(price.rows).length > 0) return [key, { status: 'partial' }];
          return [
            key,
            price.totals.sell > 0
              ? { status: 'ready', sell: price.totals.sell }
              : { status: 'failed' },
          ];
        } catch {
          return [key, { status: 'failed' }];
        }
      })
    ).then((entries) => {
      if (!cancelled) setLoaded({ key: effectKey, prices: new Map(entries) });
    });
    return () => {
      cancelled = true;
    };
    // `effectKey` stands for `hub` and the wanted pairs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectKey, resolve, ready]);

  // A load for another hub or Goal set is not this one's answer.
  return useMemo(() => (loaded.key === effectKey ? loaded.prices : new Map()), [loaded, effectKey]);
}
