import { useEffect, useRef, useState } from 'react';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';

export interface CompareAsyncResult<T> {
  values: readonly (T | null)[];
  failed: readonly boolean[];
}

type CacheEntry<T> = { profile: PilotProfile; context: unknown } & (
  { value: T } | { failed: true }
);

export function useCompareAsync<T>(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null,
  compute: (fitting: Fitting, profile: PilotProfile, context?: unknown) => Promise<T | null>,
  context?: unknown
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
      return entry && entry.profile === profile && entry.context === context ? entry : null;
    };
    const snapshot = (): CompareAsyncResult<T> => {
      const entries = fittings.map(read);
      return {
        values: fittings.map((fitting, i) => {
          const stale = fitting === null ? undefined : cache.get(fitting);
          const entry = entries[i] ?? (stale?.profile === profile ? stale : undefined);
          return entry && 'value' in entry ? entry.value : null;
        }),
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
            return [fitting, await compute(fitting, profile, context)] as const;
          } catch {
            return [fitting, null] as const;
          }
        })
      );
      if (cancelled) return;
      for (const [fitting, value] of results) {
        cache.set(
          fitting,
          value === null ? { profile, context, failed: true } : { profile, context, value }
        );
      }
      setResult(snapshot());
    })();
    return () => {
      cancelled = true;
    };
  }, [fittings, profile, compute, context]);

  return result;
}
