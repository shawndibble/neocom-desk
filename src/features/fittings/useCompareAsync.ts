/**
 * One fitting's async compute (stats, can-fly…), cached per `Fitting`
 * object and invalidated only when `profile` itself changes — so adding a
 * third compare slot doesn't redo the first two, which are still the same
 * object reference. `compute` must be a stable, module-level function (not a
 * closure recreated every render), or this cache defeats itself.
 */
import { useEffect, useRef, useState } from 'react';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';

export function useCompareAsync<T>(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null,
  compute: (fitting: Fitting, profile: PilotProfile) => Promise<T | null>
): readonly (T | null)[] {
  const cacheRef = useRef(new Map<Fitting, { profile: PilotProfile; value: T }>());
  const [values, setValues] = useState<readonly (T | null)[]>(() => fittings.map(() => null));

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;
    const read = (fitting: Fitting | null): T | null => {
      if (fitting === null) return null;
      const entry = cache.get(fitting);
      return entry && entry.profile === profile ? entry.value : null;
    };
    setValues(fittings.map(read));
    if (profile === null) return;
    const missing = fittings.filter((fitting): fitting is Fitting => read(fitting) === null);
    if (missing.length === 0) return;
    void (async () => {
      const results = await Promise.all(
        missing.map(async (fitting) => [fitting, await compute(fitting, profile)] as const)
      );
      if (cancelled) return;
      for (const [fitting, value] of results) {
        if (value !== null) cache.set(fitting, { profile, value });
      }
      setValues(fittings.map(read));
    })();
    return () => {
      cancelled = true;
    };
  }, [fittings, profile, compute]);

  return values;
}
