import { useEffect, useState } from 'react';
import type { ModuleDiffEntry } from '@/engine/fittings/fittingCompare';
import { typeName } from '@/sde/loadSde';

/**
 * The names behind "Modules that differ" — resolved from the SDE, empty
 * until they land. Shared by the table and its export so both name a module
 * the same way.
 */
export function useModuleDiffNames(
  entries: readonly ModuleDiffEntry[]
): ReadonlyMap<number, string> {
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await Promise.all(
        entries.map(async (entry): Promise<[number, string]> => [
          entry.typeId,
          await typeName(entry.typeId),
        ])
      );
      if (!cancelled) setNames(new Map(resolved));
    })();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  return names;
}
