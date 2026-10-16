/**
 * The on-demand scan behind "Fill the free space": the same
 * Hauling Opportunities scan as `useHaulingScan`, over the type ids of every
 * other Hauling category on the lane, run only once `enabled` turns true (the
 * user asked) and never when the category is already Everything.
 *
 * One ask = one lane: route/category/mode change aborts → idle even if
 * `enabled` stays true (scan costs ESI budget; never self-reruns). Re-ask:
 * toggle `enabled` or `refresh`.
 */
import { useCallback, useEffect, useState } from 'react';
import { EVERYTHING_CATEGORY_ID, typeIdsOutsideHaulingCategory } from './haulingCategories';
import { evictHaulingScan, haulingScanCacheKey, type HaulMode } from './haulingData';
import type { HaulingEnd } from './haulingHubs';
import { scanHaulingLane } from './haulingScanRun';
import type { HaulingScanState } from './useHaulingScan';

export type HaulingFillScanState = { status: 'idle' } | HaulingScanState;

/** String: never collides with a category's numeric scope. */
export const haulingFillScope = (categoryId: number): string => `fill-${categoryId}`;

/** One ask from the user for one lane; a refresh is a new ask, so it re-runs. */
interface Ask {
  key: string;
}

export function useHaulingFillScan(
  from: HaulingEnd,
  to: HaulingEnd,
  categoryId: number,
  mode: HaulMode,
  enabled: boolean
): { state: HaulingFillScanState; refresh: () => void } {
  const key = haulingScanCacheKey({ from, to, scope: haulingFillScope(categoryId), mode });
  const [ask, setAsk] = useState<Ask | null>(enabled ? { key } : null);
  const [seen, setSeen] = useState({ enabled, key });
  if (enabled !== seen.enabled || key !== seen.key) {
    setSeen({ enabled, key });
    setAsk(enabled && enabled !== seen.enabled ? { key } : null);
  }
  // Tagged with the ask it answers, so an old lane's rows never show for a new ask.
  const [result, setResult] = useState<{ ask: Ask; state: HaulingScanState } | null>(null);

  const active = ask?.key === key && categoryId !== EVERYTHING_CATEGORY_ID ? ask : null;

  useEffect(() => {
    if (active === null) return;
    const ask = active;
    const controller = new AbortController();
    const settle = (state: HaulingScanState) => {
      if (!controller.signal.aborted) setResult({ ask, state });
    };
    void (async () => {
      try {
        const scan = await scanHaulingLane(
          {
            from,
            to,
            mode,
            scope: haulingFillScope(categoryId),
            typeIds: (groups, marketTypes) =>
              typeIdsOutsideHaulingCategory(categoryId, groups, marketTypes),
          },
          controller.signal,
          (progress) => settle({ status: 'loading', progress })
        );
        settle({ status: 'ready', scan });
      } catch {
        // An abort lands nowhere (`settle` checks); any other failure, IndexedDB's included, is an error.
        settle({ status: 'error' });
      }
    })();
    return () => controller.abort();
  }, [active, from, to, categoryId, mode]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    // A new lane may still come from the cache; a retry drops only this fill's entry, never the category scan's.
    if (ask?.key === key) evictHaulingScan(key);
    setAsk({ key });
  }, [enabled, key, ask]);

  let state: HaulingFillScanState = { status: 'idle' };
  if (active !== null) {
    state = result?.ask === active ? result.state : { status: 'loading', progress: null };
  }
  return { state, refresh };
}
