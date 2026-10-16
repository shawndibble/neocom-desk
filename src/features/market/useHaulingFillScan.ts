/**
 * The on-demand scan behind "Fill the free space" (issue #3878): the same
 * Hauling Opportunities scan as `useHaulingScan`, over the type ids of every
 * other Hauling category on the lane, run only once `enabled` turns true (the
 * user asked) and never when the category is already Everything.
 *
 * An ask is for one lane: the route, category and mode `enabled` turned on
 * for. Any of them changing abandons the scan in flight and goes back to idle
 * even while `enabled` stays true — the scan costs ESI budget, so it never
 * re-runs on its own. The user asks again by `enabled` going false then true,
 * or by `refresh`, which re-scans the lane already asked for afresh.
 */
import { useCallback, useEffect, useState } from 'react';
import { EVERYTHING_CATEGORY_ID, typeIdsOutsideHaulingCategory } from './haulingCategories';
import { clearHaulingScanCache, type HaulMode } from './haulingData';
import { haulingEndId, type HaulingEnd } from './haulingHubs';
import { scanHaulingLane } from './haulingScanRun';
import type { HaulingScanState } from './useHaulingScan';

export type HaulingFillScanState = { status: 'idle' } | HaulingScanState;

/** The fill's cache scope: category ids are positive, so it never shares an entry with a category scan. */
export const haulingFillScope = (categoryId: number): number => -categoryId;

interface Ask {
  key: string;
  attempt: number;
}

export function useHaulingFillScan(
  from: HaulingEnd,
  to: HaulingEnd,
  categoryId: number,
  mode: HaulMode,
  enabled: boolean
): { state: HaulingFillScanState; refresh: () => void } {
  const key = `${haulingEndId(from)}>${haulingEndId(to)}:${categoryId}:${mode}`;
  const [ask, setAsk] = useState<Ask | null>(enabled ? { key, attempt: 0 } : null);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    setAsk(enabled ? { key, attempt: 0 } : null);
  }
  // Tagged with the ask it answers, so an old lane's rows never show for a new ask.
  const [result, setResult] = useState<{ ask: Ask; state: HaulingScanState } | null>(null);

  const active = ask !== null && ask.key === key && categoryId !== EVERYTHING_CATEGORY_ID;

  useEffect(() => {
    if (!active || ask === null) return;
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
      } catch (error) {
        if (!(error instanceof DOMException)) settle({ status: 'error' });
      }
    })();
    return () => controller.abort();
  }, [active, ask, from, to, categoryId, mode]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    // The lane already asked for is fetched afresh; a new lane may still come from the cache.
    if (ask?.key === key) clearHaulingScanCache();
    setAsk({ key, attempt: (ask?.attempt ?? 0) + 1 });
  }, [enabled, key, ask]);

  let state: HaulingFillScanState = { status: 'idle' };
  if (active) {
    state = result?.ask === ask ? result.state : { status: 'loading', progress: null };
  }
  return { state, refresh };
}
