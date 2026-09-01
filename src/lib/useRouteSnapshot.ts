/**
 * Route lifecycle shared by the read-only Character views: waits for the
 * active-character store, runs the view's loader on mount and on every manual
 * refresh, and exposes only the result belonging to the current character and
 * refresh. Owns lifecycle only — the loader owns all fetching, so each view
 * keeps its own mix of parallel and dependent ESI calls.
 *
 * `load` must close over nothing but its arguments. The effect keys on the
 * character and the refresh, so state a loader captures from its own scope
 * will not trigger a reload and `exhaustive-deps` cannot see it.
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

/**
 * `epoch` is monotonic rather than `characterId:refreshCount`, because that
 * pair repeats: switch A→B→A and the returning load carries the key the first
 * one already wrote, so a stale snapshot reads as current and the view shows
 * pre-switch data with `loading` false. `refreshCount` resets with the
 * character, so it answers "has *this* character been refreshed" — which is
 * the question the views asking it actually have.
 */
interface Lifecycle {
  characterId: number | null;
  epoch: number;
  refreshCount: number;
}

interface StampedSnapshot<T> {
  epoch: number;
  data: T | null;
  error: unknown;
}

export interface RouteSnapshot<T> {
  /** Data for the current character + refresh, or null while loading or failed. */
  data: T | null;
  /** Whatever the loader threw. Views must offer a way out — `loading` alone would strand them. */
  error: unknown;
  loading: boolean;
  hydrated: boolean;
  activeCharacterId: number | null;
  /** Manual refreshes for the current character; 0 on its initial load. */
  refreshCount: number;
  refresh: () => void;
}

export function useRouteSnapshot<T>(
  load: (characterId: number, signal: RouteSnapshotSignal) => Promise<T>,
  /**
   * Second case alongside the active-character store: a caller that already
   * resolved its own character (e.g. a panel embedded in a route that reads
   * the store itself) supplies it directly. Bypasses the store entirely —
   * `hydrated` is `true` from the first render, since there is no store wait
   * to report.
   */
  propCharacterId?: number
): RouteSnapshot<T> {
  const storeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const storeHydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = propCharacterId ?? storeCharacterId;
  const hydrated = propCharacterId !== undefined ? true : storeHydrated;

  const [lifecycle, setLifecycle] = useState<Lifecycle>({
    characterId: activeCharacterId,
    epoch: 0,
    refreshCount: 0,
  });
  const [snapshot, setSnapshot] = useState<StampedSnapshot<T> | null>(null);

  // Adjusting state during render, React's documented way to reset on a
  // changed input: it re-renders before committing, so no effect round-trip
  // and no frame showing the previous character's data.
  if (lifecycle.characterId !== activeCharacterId) {
    setLifecycle({ characterId: activeCharacterId, epoch: lifecycle.epoch + 1, refreshCount: 0 });
  }

  // Latest-ref so a caller passing an inline loader can't re-trigger the load
  // effect every render. Declared first, so it is current before that effect runs.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const { characterId, epoch } = lifecycle;
  useEffect(() => {
    if (characterId === null) return;
    const signal: RouteSnapshotSignal = { cancelled: false };
    void (async () => {
      try {
        const data = await loadRef.current(characterId, signal);
        if (!signal.cancelled) setSnapshot({ epoch, data, error: null });
      } catch (error) {
        // Stamping the failure is what clears `loading` and re-enables Refresh.
        // Swallowing it would leave the view spinning with no way back.
        if (!signal.cancelled) setSnapshot({ epoch, data: null, error });
      }
    })();
    return () => {
      signal.cancelled = true;
    };
  }, [characterId, epoch]);

  const current = snapshot?.epoch === epoch ? snapshot : null;

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    hydrated,
    activeCharacterId,
    refreshCount: lifecycle.refreshCount,
    refresh: useCallback(
      () => setLifecycle((s) => ({ ...s, epoch: s.epoch + 1, refreshCount: s.refreshCount + 1 })),
      []
    ),
  };
}
