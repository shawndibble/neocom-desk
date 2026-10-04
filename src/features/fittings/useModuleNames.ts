/** Module names for a Popular fits panel row's rack icon strip (`RackIconStrip.tsx`). */
import { useEffect, useState } from 'react';
import { typeName } from '@/sde/loadSde';

/**
 * Names for the given module types, from the SDE; empty until they land.
 * Pass a stable (memoized) list — a new one each render re-reads the names.
 */
export function useModuleNames(typeIds: readonly number[] | null): ReadonlyMap<number, string> {
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  useEffect(() => {
    if (typeIds === null) return;
    let cancelled = false;
    void Promise.all(
      [...new Set(typeIds)].map(async (typeId): Promise<[number, string]> => [
        typeId,
        await typeName(typeId),
      ])
    )
      .then((resolved) => {
        if (!cancelled) setNames(new Map(resolved));
      })
      // No SDE, no names: the icons keep their `#id` fallback.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [typeIds]);
  return names;
}
