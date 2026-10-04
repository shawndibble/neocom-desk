/** Module names for a Popular fits panel row's rack icon strip (`RackIconStrip.tsx`). */
import { useEffect, useState } from 'react';

/**
 * Names for the given module types, through `lookUp` (the SDE's `typeName`, or
 * a test's stand-in); empty until they land. Pass a stable (memoized) list — a
 * new one each render re-reads the names — and a stable `lookUp`.
 */
export function useModuleNames(
  typeIds: readonly number[] | null,
  lookUp: (typeId: number) => Promise<string>
): ReadonlyMap<number, string> {
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  useEffect(() => {
    if (typeIds === null) return;
    let cancelled = false;
    void Promise.all(
      [...new Set(typeIds)].map(async (typeId): Promise<[number, string]> => [
        typeId,
        await lookUp(typeId),
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
  }, [typeIds, lookUp]);
  return names;
}
