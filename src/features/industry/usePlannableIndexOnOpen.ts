import { useEffect, useState } from 'react';
import { loadPlannableIndex, type PlannableIndex } from './plannableProduct';

/**
 * Resolves the plannable-product index on first open, for a row menu's
 * "Build Plan" (`BuildPlanContextMenu`, the Community Library's Shared
 * Blueprints). Shared by the
 * right-click menu and the visible button (issue #1498) — each trigger owns
 * its own instance (same reasoning as `ItemContextMenu`'s per-trigger
 * `alertOpen`), so a failed fetch on one retries on that trigger's own next
 * open rather than depending on the other having been opened first.
 * `loadBlueprints` underneath is already memoized, so two instances resolving
 * independently still only fetches `blueprints.json` once.
 */
export function usePlannableIndexOnOpen(): {
  index: PlannableIndex | null;
  onOpenChange: (open: boolean) => void;
} {
  const [index, setIndex] = useState<PlannableIndex | null>(null);
  /** Bumped on every open until the index resolves, so a failed fetch retries on the next open instead of reading "checking…" forever. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0 || index) return;
    let cancelled = false;
    void loadPlannableIndex().then(
      (next) => {
        if (!cancelled) setIndex(next);
      },
      () => {
        // Leave the label in its checking state; the next open retries.
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, index]);

  return {
    index,
    onOpenChange: (open) => {
      if (open && !index) setAttempt((n) => n + 1);
    },
  };
}
