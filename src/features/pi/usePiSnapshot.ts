import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
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

const SharedPiSnapshot = createContext<{ characterId: number; state: PiSnapshotState } | null>(
  null
);

/**
 * Reads the Character's colony snapshot once for a subtree. The PI page mounts
 * this so Plan, Map and Colonies share one read instead of each running its
 * own, and a tab switch re-uses it instead of loading again. `reloadKey` is the
 * page's manual refresh count: a new value re-reads behind the last snapshot.
 */
export function PiSnapshotProvider({
  characterId,
  reloadKey = 0,
  children,
}: {
  characterId: number;
  reloadKey?: number;
  children: ReactNode;
}) {
  const state = useLoadedPiSnapshot(characterId, reloadKey);
  return createElement(SharedPiSnapshot.Provider, { value: { characterId, state } }, children);
}

/**
 * The colony snapshot for one Character, shared by the PI tabs: the enclosing
 * `PiSnapshotProvider`'s when it serves this Character, else loaded here.
 * Another Character's snapshot is never returned; a new `reloadKey` re-reads
 * behind the last one (ignored under a provider, which owns the reload). A null
 * `characterId` loads nothing.
 */
export function usePiSnapshot(characterId: number | null, reloadKey = 0): PiSnapshotState {
  const shared = useContext(SharedPiSnapshot);
  const served = shared !== null && shared.characterId === characterId;
  // Always called so the hook order is stable; a null id loads nothing.
  const local = useLoadedPiSnapshot(served ? null : characterId, reloadKey);
  return served ? shared.state : local;
}

function useLoadedPiSnapshot(characterId: number | null, reloadKey: number): PiSnapshotState {
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
