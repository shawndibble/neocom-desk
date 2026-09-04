/**
 * "Can Planetary Industry make this item?" for one type.
 *
 * `undefined` while `pi.json` is still loading, so a caller can hold the
 * action back rather than flash one in and out. The payload is 15KB and
 * module-cached, so asking from every row of a market tree costs one fetch;
 * rows mounted after it lands never re-render, because the hook seeds its
 * state from the already-resolved set.
 *
 * Failure resolves to `false`, not to a stuck `undefined`: the menu simply
 * offers no PI action, which is the same thing the answer would have been
 * for all but ~70 items in the game.
 */
import { useEffect, useState } from 'react';
import { loadPlannableTypeIds, peekPlannableTypeIds } from './products';

export function usePiPlannable(typeId: number): boolean | undefined {
  const [ids, setIds] = useState<ReadonlySet<number> | null>(peekPlannableTypeIds);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ids !== null) return;
    let cancelled = false;
    void loadPlannableTypeIds().then(
      (loaded) => {
        if (!cancelled) setIds(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (ids !== null) return ids.has(typeId);
  return failed ? false : undefined;
}
