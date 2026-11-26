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
        const found = new Map<number, HardpointKind | null>();
        await mapWithConcurrencyLimit(missing, ESI_FANOUT_CONCURRENCY, async (typeId) => {
          const kind = await loadHardpointKind(typeId);
          if (kind !== undefined) found.set(typeId, kind);
        });
        if (cancelled) return;
        if (found.size > 0) setKinds((previous) => new Map([...previous, ...found]));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [highTypeIds, kinds]);

  const kindOf = useCallback((typeId: number) => kinds.get(typeId), [kinds]);
  return { used: fitting === null ? null : countHardpoints(fitting, kindOf), kindOf };
}
