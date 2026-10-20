/** Module names for a Popular fits panel row's rack icon strip (`RackIconStrip.tsx`). */
import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

const NO_NAMES: ReadonlyMap<number, string> = new Map();

/**
 * Names for the given module types, through `lookUp` (the SDE's `typeName`, or
 * a test's stand-in); empty until they land. Pass a stable (memoized) list — a
 * new one each render re-reads the names — and a stable `lookUp`.
 */
export function useModuleNames(
  typeIds: readonly number[] | null,
  lookUp: (typeId: number) => Promise<string>
): ReadonlyMap<number, string> {
  const loader = useCallback(
    async (): Promise<ReadonlyMap<number, string>> =>
      new Map(
        await Promise.all(
          [...new Set(typeIds ?? [])].map(async (typeId): Promise<[number, string]> => [
            typeId,
            await lookUp(typeId),
          ])
        )
      ),
    [typeIds, lookUp]
  );
  // No SDE, no names: a failed load stays empty and the icons keep their `#id` fallback.
  const { data } = useKeyedLoad('names', loader, typeIds === null);
  return data ?? NO_NAMES;
}
