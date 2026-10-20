import { useCallback } from 'react';
import type { ModuleDiffEntry } from '@/engine/fittings/fittingCompare';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { typeName } from '@/sde/loadSde';

const NO_NAMES: ReadonlyMap<number, string> = new Map();

/**
 * The names behind "Modules that differ" — resolved from the SDE, empty
 * until they land. Shared by the table and its export so both name a module
 * the same way.
 */
export function useModuleDiffNames(
  entries: readonly ModuleDiffEntry[]
): ReadonlyMap<number, string> {
  const loader = useCallback(
    async (): Promise<ReadonlyMap<number, string>> =>
      new Map(
        await Promise.all(
          entries.map(async (entry): Promise<[number, string]> => [
            entry.typeId,
            await typeName(entry.typeId),
          ])
        )
      ),
    [entries]
  );
  const { data } = useKeyedLoad('names', loader);
  return data ?? NO_NAMES;
}
