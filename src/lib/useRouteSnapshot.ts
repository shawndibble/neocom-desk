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
import { invalidateFreshness, onCacheRevalidated } from '@/esi/cache';
import { readRouteSnapshot, writeRouteSnapshot } from './routeSnapshotCache';

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

export interface RouteSnapshotOptions {
  /**
   * Route-stable id under which this view's last successful snapshot is kept
   * across unmounts, in `lib/routeSnapshotCache.ts`. Supply it and a return
   * visit renders that snapshot on its very first frame — no spinner — while
   * the loader re-reads behind it; omit it and the view keeps the old
   * spinner-on-every-mount behaviour.
   *
   * An explicit string rather than the `load` identity: several call sites
   * pass an inline arrow (`Corp.tsx`), whose identity changes every render and
   * would silently never hit. It must be unique per view — two views sharing
   * one id would hand each other the wrong snapshot shape.
   */
  cacheKey?: string;
  /**
   * Keep the last successfully-loaded data visible while a manual `refresh()`
   * is in flight, instead of `data` going back to `null` until the reload
   * lands (issue #418). Off by default: most callers already gate their whole
   * body on `loading` and would otherwise render nothing underneath a
   * "loading" state that never shows — this only helps a caller whose body
   * reads `data` directly. Never masks a character switch: the carried value
   * is cleared the moment `characterId` changes, same render as the epoch
   * bump, so switching characters still shows a spinner rather than the
   * previous one's rows.
   */
  staleWhileRevalidate?: boolean;
}

export interface RouteSnapshot<T> {
  /**
   * Data for the current character + refresh, or null while loading or
   * failed — except that with `staleWhileRevalidate` (mid-refresh) or
   * `cacheKey` (a return visit) this is the last successful load instead.
   * `loading` still flips true in those windows (a load is genuinely in
   * flight), so a caller wanting "is this fresh" keeps using `loading`; a
   * caller wanting "do I have something to show" uses `data`. Views should
   * spin on `loading && !data`, never on `loading` alone.
   */
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
  propCharacterId?: number,
  options?: RouteSnapshotOptions
): RouteSnapshot<T> {
  const staleWhileRevalidate = options?.staleWhileRevalidate ?? false;
  const cacheKey = options?.cacheKey;
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
  // Carried across a refresh only — see `RouteSnapshotOptions.staleWhileRevalidate`.
  const [lastGoodData, setLastGoodData] = useState<T | null>(null);

  /**
   * Bumped when a background revalidation settles (`esi/cache.ts` serves a
   * lapsed row immediately and refreshes it behind the view). Deliberately NOT
   * part of `epoch`: the re-run stamps the epoch it already had, so the
   * rendered snapshot stays `current` throughout and `loading` never flips —
   * the view keeps showing the stale rows until the new ones replace them,
   * rather than blinking back to a spinner.
   */
  const [revalidation, setRevalidation] = useState(0);
  const loadInFlight = useRef(false);
  const revalidationPending = useRef(false);

  // Adjusting state during render, React's documented way to reset on a
  // changed input: it re-renders before committing, so no effect round-trip
  // and no frame showing the previous character's data.
  if (lifecycle.characterId !== activeCharacterId) {
    setLifecycle({ characterId: activeCharacterId, epoch: lifecycle.epoch + 1, refreshCount: 0 });
    if (lastGoodData !== null) setLastGoodData(null);
  }

  // Latest-ref so a caller passing an inline loader can't re-trigger the load
  // effect every render. Declared first, so it is current before that effect runs.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  /**
   * A revalidation must never cancel a load the user is waiting on, so a
   * signal arriving mid-load is held and flushed once that load settles. One
   * page reads several keys and each revalidates separately, so this also
   * collapses a burst into a single re-run — and it cannot stall the way a
   * resetting debounce would, because the flush is driven by the load
   * finishing rather than by the signals going quiet.
   */
  useEffect(
    () =>
      onCacheRevalidated(() => {
        if (loadInFlight.current) {
          revalidationPending.current = true;
          return;
        }
        setRevalidation((n) => n + 1);
      }),
    []
  );

  const { characterId, epoch } = lifecycle;
  useEffect(() => {
    if (characterId === null) return;
    const signal: RouteSnapshotSignal = { cancelled: false };
    loadInFlight.current = true;
    void (async () => {
      try {
        const data = await loadRef.current(characterId, signal);
        if (!signal.cancelled) {
          setSnapshot({ epoch, data, error: null });
          if (staleWhileRevalidate) setLastGoodData(data);
          if (cacheKey !== undefined) writeRouteSnapshot(cacheKey, characterId, data);
        }
      } catch (error) {
        // Stamping the failure is what clears `loading` and re-enables Refresh.
        // Swallowing it would leave the view spinning with no way back.
        if (!signal.cancelled) setSnapshot({ epoch, data: null, error });
      } finally {
        if (!signal.cancelled) {
          loadInFlight.current = false;
          if (revalidationPending.current) {
            revalidationPending.current = false;
            setRevalidation((n) => n + 1);
          }
        }
      }
    })();
    return () => {
      signal.cancelled = true;
    };
    // `revalidation` re-runs the loader without touching `epoch`; see its
    // declaration for why that distinction is what keeps the view from
    // blinking. `staleWhileRevalidate` is a primitive, stable per call site —
    // safe to depend on directly rather than routing it through a ref.
  }, [characterId, epoch, revalidation, staleWhileRevalidate, cacheKey]);

  const current = snapshot?.epoch === epoch ? snapshot : null;

  /**
   * What this view rendered the last time it was mounted for this Character.
   * Read during render, not in an effect, so the very first frame after a
   * navigation already has rows — an effect would still cost one spinner
   * frame. Only consulted while nothing is loaded for the current epoch: a
   * a load has produced data for the current epoch — including, as with
   * `staleWhileRevalidate`, when the newest attempt *failed*: the view reads
   * `error` before `data`, so keeping rows behind a failure never presents
   * them as the fresh answer.
   */
  const retained =
    cacheKey !== undefined && activeCharacterId !== null
      ? readRouteSnapshot<T>(cacheKey, activeCharacterId)
      : null;

  return {
    data: current?.data ?? (staleWhileRevalidate ? lastGoodData : null) ?? retained,
    error: current?.error ?? null,
    loading: current === null,
    hydrated,
    activeCharacterId,
    refreshCount: lifecycle.refreshCount,
    refresh: useCallback(() => {
      // A manual refresh must always reach ESI, not a freshness-window hit
      // from the page's own last load (issue #41) — invalidate before the
      // epoch bump re-runs the loader, so this reload is exempt.
      invalidateFreshness();
      setLifecycle((s) => ({ ...s, epoch: s.epoch + 1, refreshCount: s.refreshCount + 1 }));
    }, []),
  };
}
