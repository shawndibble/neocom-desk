/**
 * One fitting's async compute (stats, can-fly…), cached per `Fitting`
 * object and invalidated only when `profile` itself changes — so adding a
 * third compare slot doesn't redo the first two, which are still the same
 * object reference. `compute` must be a stable, module-level function (not a
 * closure recreated every render), or this cache defeats itself.
 *
 * A compute that throws or resolves `null` is reported as failed, so the
 * caller can tell "still working" from "gave up" instead of waiting on it
 * forever. A failure is kept only until the next change to the compared
 * Fittings or the profile, which retries it — a passing network or SDE
 * error doesn't stick to that Fitting for the life of the page.
 */
import { useEffect, useRef, useState } from 'react';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';

export interface CompareAsyncResult<T> {
  /** Index-parallel to `fittings`; `null` for an empty slot, one still loading, or one that failed. */
  values: readonly (T | null)[];
  /** Index-parallel to `fittings`; `true` once that slot's compute has thrown or come back empty. */
  failed: readonly boolean[];
}

type CacheEntry<T> = { profile: PilotProfile; value: T } | { profile: PilotProfile; failed: true };

export function useCompareAsync<T>(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null,
  compute: (fitting: Fitting, profile: PilotProfile) => Promise<T | null>
): CompareAsyncResult<T> {
  const cacheRef = useRef(new Map<Fitting, CacheEntry<T>>());
  const [result, setResult] = useState<CompareAsyncResult<T>>(() => ({
    values: fittings.map(() => null),
    failed: fittings.map(() => false),
  }));

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;
    const read = (fitting: Fitting | null): CacheEntry<T> | null => {
      if (fitting === null) return null;
      const entry = cache.get(fitting);
      return entry && entry.profile === profile ? entry : null;
    };
    const snapshot = (): CompareAsyncResult<T> => {
      const entries = fittings.map(read);
      return {
        values: entries.map((entry) => (entry && 'value' in entry ? entry.value : null)),
        failed: entries.map((entry) => entry !== null && 'failed' in entry),
      };
    };
    setResult(snapshot());
    if (profile === null) return;
    const missing = fittings.filter((fitting): fitting is Fitting => {
      const entry = read(fitting);
      return fitting !== null && (entry === null || 'failed' in entry);
    });
    if (missing.length === 0) return;
    void (async () => {
      const results = await Promise.all(
        missing.map(async (fitting) => {
          try {
            return [fitting, await compute(fitting, profile)] as const;
          } catch {
            return [fitting, null] as const;
          }
        })
      );
      if (cancelled) return;
      for (const [fitting, value] of results) {
        cache.set(fitting, value === null ? { profile, failed: true } : { profile, value });
      }
      setResult(snapshot());
    })();
    return () => {
      cancelled = true;
    };
  }, [fittings, profile, compute]);

  return result;
}
