import { useEffect, useMemo, useState } from 'react';
import { fittingEditLocationFor } from '@/features/fittings/fittingEditLink';
import { fittingEditLocation, type FittingEditLocation } from '@/features/fittings/fittingRoutes';
import { loadFittingPrice, unpricedSellRows } from '@/features/fittings/fittingPrice';
import type { FittingChoices } from '@/features/fittings/useFittingChoices';
import type { TradeHub } from '@/market/hubs';
import type { WalletGoal } from './walletGoalSetting';

export type GoalPrice =
  { status: 'failed' } | { status: 'partial' } | { status: 'ready'; sell: number };

export const goalPriceKey = (goal: Pick<WalletGoal, 'id' | 'fittingId'>) =>
  JSON.stringify([goal.id, goal.fittingId]);

export interface GoalPrices {
  prices: ReadonlyMap<string, GoalPrice>;
  links: ReadonlyMap<string, FittingEditLocation>;
}

const NONE: GoalPrices = { prices: new Map(), links: new Map() };

export function useGoalPrices(
  goals: readonly WalletGoal[],
  hub: TradeHub,
  resolve: FittingChoices['resolve'],
  ready: boolean
): GoalPrices {
  const [loaded, setLoaded] = useState<{ key: string; result: GoalPrices }>({
    key: '',
    result: NONE,
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
      wanted.map(async ([id, fittingId]) => {
        const key = goalPriceKey({ id, fittingId });
        const failed = { key, price: { status: 'failed' } as GoalPrice, link: null };
        try {
          const picked = await resolve(fittingId);
          if (!picked) return failed;
          const link = picked.code
            ? fittingEditLocation(picked.code)
            : await fittingEditLocationFor(picked.fitting);
          const price = await loadFittingPrice(picked.fitting, hub);
          if (unpricedSellRows(price.rows).length > 0) {
            return { key, price: { status: 'partial' } as GoalPrice, link };
          }
          return {
            key,
            price: (price.totals.sell > 0
              ? { status: 'ready', sell: price.totals.sell }
              : { status: 'failed' }) as GoalPrice,
            link,
          };
        } catch {
          return failed;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setLoaded({
        key: effectKey,
        result: {
          prices: new Map(entries.map((e) => [e.key, e.price])),
          links: new Map(entries.flatMap((e) => (e.link ? [[e.key, e.link] as const] : []))),
        },
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectKey, resolve, ready]);

  return useMemo(() => (loaded.key === effectKey ? loaded.result : NONE), [loaded, effectKey]);
}
