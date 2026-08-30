/**
 * Route lifecycle shared by the read-only Character views (Wallet, Contracts):
 * waits for the active-character store, runs the view's loader on mount and on
 * every manual refresh, and exposes only the snapshot belonging to the current
 * character + refresh. Owns lifecycle only — the loader owns all fetching, so
 * each view keeps its own mix of parallel and dependent ESI calls.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';

/**
 * Flipped by the effect cleanup when the character changes, a refresh starts,
 * or the route unmounts. The hook discards a cancelled load's result itself;
 * loaders may also read it between their own awaits to skip follow-up fetches
 * whose results would only be thrown away.
 */
export interface RouteSnapshotSignal {
  cancelled: boolean;
}

/** Identifies the load a snapshot came from: character plus refresh count. */
function requestKeyFor(characterId: number | null, refreshCount: number): string {
  return `${characterId}:${refreshCount}`;
}

interface StampedSnapshot<T> {
  requestKey: string;
  data: T;
}

export interface RouteSnapshot<T> {
  /** Data for the current character + refresh, or null while it is loading. */
  data: T | null;
  loading: boolean;
  hydrated: boolean;
  activeCharacterId: number | null;
  /**
   * Manual refreshes so far, 0 on the initial load. Views need it because
   * falling back to cache reads differently before and after a Refresh click.
   */
  refreshCount: number;
  refresh: () => void;
}

export function useRouteSnapshot<T>(
  load: (characterId: number, signal: RouteSnapshotSignal) => Promise<T>
): RouteSnapshot<T> {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const [snapshot, setSnapshot] = useState<StampedSnapshot<T> | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  // Latest-ref so a caller passing an inline loader can't re-trigger the load
  // effect every render. Declared first, so it is current before that effect runs.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (activeCharacterId === null) return;
    const requestKey = requestKeyFor(activeCharacterId, refreshCount);
    const signal: RouteSnapshotSignal = { cancelled: false };
    void (async () => {
      const data = await loadRef.current(activeCharacterId, signal);
      if (signal.cancelled) return;
      setSnapshot({ requestKey, data });
    })();
    return () => {
      signal.cancelled = true;
    };
  }, [activeCharacterId, refreshCount]);

  // Belt and braces with `cancelled`: the stamped key means a snapshot from a
  // previous character or a previous refresh never renders, however it got
  // into state — the view shows its loading state until the current load lands.
  const requestKey = requestKeyFor(activeCharacterId, refreshCount);
  const current = snapshot?.requestKey === requestKey ? snapshot : null;

  return {
    data: current ? current.data : null,
    loading: current === null,
    hydrated,
    activeCharacterId,
    refreshCount,
    refresh: useCallback(() => setRefreshCount((count) => count + 1), []),
  };
}
