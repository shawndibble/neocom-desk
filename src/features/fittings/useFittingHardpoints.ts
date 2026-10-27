/**
 * How many turret and launcher hardpoints the open Fitting's high slots take,
 * from each fitted type's dogma effects (`hardpointKinds.ts`), and which one
 * each type takes, for its tile's badge. The counts are null until every
 * high-slot type is known, so a pip is never shown free by mistake.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  countHardpoints,
  type HardpointKind,
  type HardpointKindOf,
} from '@/engine/fittings/hardpoints';
import type { Fitting, HardpointCounts } from '@/engine/fittings/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadHardpointKind } from './hardpointKinds';

export interface FittingHardpoints {
  used: HardpointCounts | null;
  /** A high-slot type's hardpoint (null: none); undefined until fetched, or for a type in another rack. */
  kindOf: HardpointKindOf;
}

export function useFittingHardpoints(fitting: Fitting | null): FittingHardpoints {
  const [kinds, setKinds] = useState<ReadonlyMap<number, HardpointKind | null>>(new Map());
  const highTypeIds = useMemo(
    () => [
      ...new Set((fitting?.modules ?? []).filter((m) => m.slot === 'high').map((m) => m.typeId)),
    ],
    [fitting]
  );

  useEffect(() => {
    const missing = highTypeIds.filter((typeId) => !kinds.has(typeId));
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        // Bounded, not `Promise.all(missing.map(...))`: a fit's high slots can
        // hold a dozen distinct types, each its own uncached ESI round trip —
        // ESI has no batch endpoint for dogma effects (Sentry: "N+1 API Call"
        // on /fittings/edit) — so cap the fan-out like every other ESI call site.
        const found = new Map<number, HardpointKind | null>();
        await mapWithConcurrencyLimit(missing, ESI_FANOUT_CONCURRENCY, async (typeId) => {
          const kind = await loadHardpointKind(typeId);
          // A type ESI couldn't supply stays unknown — and missing, so the next Fitting change retries it.
          if (kind !== undefined) found.set(typeId, kind);
        });
        if (cancelled) return;
        if (found.size > 0) setKinds((previous) => new Map([...previous, ...found]));
      } catch {
        // Leaves them unknown; the pips show nothing taken.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [highTypeIds, kinds]);

  const kindOf = useCallback((typeId: number) => kinds.get(typeId), [kinds]);
  return { used: fitting === null ? null : countHardpoints(fitting, kindOf), kindOf };
}
