import { useEffect, useMemo, useState } from 'react';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import { fittingEditLocation } from '@/features/fittings/fittingRoutes';
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

export interface GoalFittingLocation {
  pathname: string;
  search: string;
}

export interface GoalPrices {
  /** Keyed by `goalPriceKey`; absent while loading. */
  prices: ReadonlyMap<string, GoalPrice>;
  /** Where each Fitting-priced Goal's Fitting opens, keyed by `goalPriceKey`; absent until it resolves or when it is too large to share. */
  links: ReadonlyMap<string, GoalFittingLocation>;
}

const NONE: GoalPrices = { prices: new Map(), links: new Map() };

/**
 * The target of each Fitting-priced Goal: the Fitting's sell price at `hub`
 * (what buying it off the hub costs), read again on each visit so it follows
 * the market, and the editor location that opens that Fitting.
 */
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
          const [price, encoded] = await Promise.all([
            loadFittingPrice(picked.fitting, hub),
            encodeFittingShare(fittingToShareInput(picked.fitting)),
          ]);
          const link = encoded.ok ? fittingEditLocation(encoded.payload) : null;
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
    // `effectKey` stands for `hub` and the wanted pairs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectKey, resolve, ready]);

  // A load for another hub or Goal set is not this one's answer.
  return useMemo(() => (loaded.key === effectKey ? loaded.result : NONE), [loaded, effectKey]);
}
