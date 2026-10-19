import { useCallback, useState } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadGoalPlannerSnapshot, type GoalPlannerSnapshot } from './goalPlannerSnapshot';

export interface PiSnapshotState {
  /** The Character's colony reads; null while loading, idle or after a failure. */
  snapshot: GoalPlannerSnapshot | null;
  /** The read failed outright. */
  failed: boolean;
  /** A `retry()` is in flight; the old snapshot still shows meanwhile. */
  retrying: boolean;
  retry: () => void;
}

/**
 * The colony snapshot for one Character, shared by the PI tabs. Another
 * Character's snapshot is never returned; a new `reloadKey` re-reads behind the
 * last one. A null `characterId` loads nothing.
 */
export function usePiSnapshot(characterId: number | null, reloadKey = 0): PiSnapshotState {
  const loader = useCallback(
    () => loadGoalPlannerSnapshot(characterId as number),
    // `reloadKey` is the caller's "read again" signal: a new loader re-runs the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterId, reloadKey]
  );
  const { status, data, retry: reload } = useKeyedLoad(characterId?.toString() ?? null, loader);
  const snapshot = data ?? null;
  // Derived, not stored with an effect: retrying lasts until a different snapshot object lands.
  const [retryFrom, setRetryFrom] = useState<GoalPlannerSnapshot | null>(null);
  const retrying = snapshot !== null && snapshot === retryFrom;
  const retry = useCallback(() => {
    setRetryFrom(snapshot);
    reload();
  }, [snapshot, reload]);
  return { snapshot, failed: status === 'failed', retrying, retry };
}
