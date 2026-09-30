/**
 * The SDE's blueprint typeIDs, for telling a **BPO** apart from an ordinary
 * item on the Assets pages (`engine/blueprintKind.ts`).
 *
 * Off the page's critical path: the badge is a progressive enhancement, so a
 * BPC badge shows at once (ESI flags copies) and a BPO badge appears once
 * this lands, never blocking the list. `loadBlueprints` is memoized for the
 * session, so the Assets page's lazily loaded Build Plan catalog reuses the
 * same fetch rather than repeating it.
 */
import { useEffect, useMemo, useState } from 'react';
import { mayBeBlueprintName } from '@/engine/blueprintKind';
import { loadBlueprints } from '@/sde/loadSde';
import type { BlueprintMap } from '@/sde/types';

let built: { source: BlueprintMap; ids: ReadonlySet<number> } | null = null;

function blueprintTypeIdSet(source: BlueprintMap): ReadonlySet<number> {
  if (built?.source !== source) {
    built = { source, ids: new Set(Object.keys(source).map(Number)) };
  }
  return built.ids;
}

/**
 * The set once loaded; null while still loading, on a failed load (a missing
 * BPO badge is not worth an error), or when no name in `typeNames` — the
 * listed asset types — could be a blueprint's: most asset lists hold none,
 * and the file is 1.6 MB, so it is fetched only once one could.
 */
export function useBlueprintTypeIds(
  typeNames: ReadonlyMap<number, string>
): ReadonlySet<number> | null {
  const enabled = useMemo(() => [...typeNames.values()].some(mayBeBlueprintName), [typeNames]);
  const [ids, setIds] = useState<ReadonlySet<number> | null>(null);

  useEffect(() => {
    if (!enabled || ids !== null) return;
    let cancelled = false;
    loadBlueprints()
      .then((source) => {
        if (!cancelled) setIds(blueprintTypeIdSet(source));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, ids]);

  return enabled ? ids : null;
}
