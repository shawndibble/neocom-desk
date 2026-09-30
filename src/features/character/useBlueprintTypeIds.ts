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
import { useEffect, useState } from 'react';
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
 * The set once loaded, null while `enabled` is false, still loading, or on a
 * failed load (a missing BPO badge is not worth an error).
 */
export function useBlueprintTypeIds(enabled: boolean): ReadonlySet<number> | null {
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
