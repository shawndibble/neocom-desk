import { useCallback, useEffect, useRef, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { invalidateFreshness, onCacheRevalidated } from '@/esi/cache';
import { readRouteSnapshot, routeSnapshotEpoch, writeRouteSnapshot } from './routeSnapshotCache';
import { useRouteSnapshotHydration } from './useRouteSnapshotHydration';

export interface RouteSnapshotSignal<T = unknown> {
  cancelled: boolean;
  publish?(partial: T): void;
}

interface Lifecycle {
  characterId: number | null;
  epoch: number;
  refreshCount: number;
}

interface StampedSnapshot<T> {
  epoch: number;
  data: T | null;
  error: unknown;
  partial?: boolean;
}

export interface RouteSnapshotOptions {
  cacheKey?: string;
  staleWhileRevalidate?: boolean;
  skip?: boolean;
}

export interface RouteSnapshot<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  hydrated: boolean;
  activeCharacterId: number | null;
  refreshCount: number;
  refresh: () => void;
}

const MAX_CONSECUTIVE_AUTO_RELOADS = 3;

export const REVALIDATION_COALESCE_MS = 1000;

export function useRouteSnapshot<T>(
  load: (characterId: number, signal: RouteSnapshotSignal<T>) => Promise<T>,
  propCharacterId?: number,
  options?: RouteSnapshotOptions
): RouteSnapshot<T> {
  const staleWhileRevalidate = options?.staleWhileRevalidate ?? false;
  const cacheKey = options?.cacheKey;
  const skip = options?.skip ?? false;
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
  const [lastGoodData, setLastGoodData] = useState<T | null>(null);

  const [revalidation, setRevalidation] = useState(0);
  const loadInFlight = useRef(false);
  const revalidationPending = useRef(false);
  const consecutiveAutoReloads = useRef(0);

  if (lifecycle.characterId !== activeCharacterId) {
    setLifecycle({ characterId: activeCharacterId, epoch: lifecycle.epoch + 1, refreshCount: 0 });
    if (lastGoodData !== null) setLastGoodData(null);
  }

  const loadRef = useRef(load);
  const lastGoodRef = useRef(lastGoodData);
  useEffect(() => {
    loadRef.current = load;
    lastGoodRef.current = lastGoodData;
  });

  const coalesceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRevalidation = useCallback(() => {
    if (coalesceTimer.current !== null) return;
    coalesceTimer.current = setTimeout(() => {
      coalesceTimer.current = null;
      if (loadInFlight.current) {
        revalidationPending.current = true;
        return;
      }
      setRevalidation((n) => n + 1);
    }, REVALIDATION_COALESCE_MS);
  }, []);

  useEffect(() => {
    const unsubscribe = onCacheRevalidated(() => {
      if (loadInFlight.current) {
        revalidationPending.current = true;
        return;
      }
      scheduleRevalidation();
    });
    return () => {
      unsubscribe();
      if (coalesceTimer.current !== null) clearTimeout(coalesceTimer.current);
      coalesceTimer.current = null;
    };
  }, [scheduleRevalidation]);

  const { characterId, epoch } = lifecycle;
  useEffect(() => {
    if (characterId === null || skip) return;
    const signal: RouteSnapshotSignal<T> = {
      cancelled: false,
      publish(partial) {
        if (signal.cancelled) return;
        if (lastGoodRef.current !== null) return;
        if (cacheKey !== undefined && readRouteSnapshot(cacheKey, characterId) !== null) return;
        setSnapshot((prev) =>
          prev?.epoch === epoch && !prev.partial
            ? prev
            : { epoch, data: partial, error: null, partial: true }
        );
      },
    };
    loadInFlight.current = true;
    const startedAt = routeSnapshotEpoch(characterId);
    void (async () => {
      try {
        const data = await loadRef.current(characterId, signal);
        if (!signal.cancelled) {
          setSnapshot({ epoch, data, error: null });
          if (staleWhileRevalidate) setLastGoodData(data);
          if (cacheKey !== undefined)
            writeRouteSnapshot(cacheKey, characterId, data, { startedAt });
        }
      } catch (error) {
        if (!signal.cancelled) setSnapshot({ epoch, data: null, error });
      } finally {
        if (!signal.cancelled) {
          loadInFlight.current = false;
          if (revalidationPending.current) {
            revalidationPending.current = false;
            if (consecutiveAutoReloads.current < MAX_CONSECUTIVE_AUTO_RELOADS) {
              consecutiveAutoReloads.current += 1;
              scheduleRevalidation();
            }
          } else {
            consecutiveAutoReloads.current = 0;
          }
        }
      }
    })();
    return () => {
      signal.cancelled = true;
    };
  }, [
    characterId,
    epoch,
    revalidation,
    staleWhileRevalidate,
    cacheKey,
    skip,
    scheduleRevalidation,
  ]);

  const current = snapshot?.epoch === epoch ? snapshot : null;

  const retained =
    cacheKey !== undefined && activeCharacterId !== null
      ? readRouteSnapshot<T>(cacheKey, activeCharacterId)
      : null;
  useRouteSnapshotHydration(
    activeCharacterId,
    cacheKey !== undefined && retained === null && current === null
  );

  return {
    data: current?.data ?? (staleWhileRevalidate ? lastGoodData : null) ?? retained,
    error: current?.error ?? null,
    loading: current === null || current.partial === true,
    hydrated,
    activeCharacterId,
    refreshCount: lifecycle.refreshCount,
    refresh: useCallback(() => {
      invalidateFreshness();
      setLifecycle((s) => ({ ...s, epoch: s.epoch + 1, refreshCount: s.refreshCount + 1 }));
    }, []),
  };
}
