/**
 * How many turret and launcher hardpoints the open Fitting's high slots take,
 * from each fitted type's dogma effects (`hardpointKinds.ts`). Null until
 * every high-slot type is known, so a pip is never shown free by mistake.
 */
import { useEffect, useMemo, useState } from 'react';
import { countHardpoints, type HardpointKind } from '@/engine/fittings/hardpoints';
import type { Fitting, HardpointCounts } from '@/engine/fittings/types';
import { loadHardpointKind } from './hardpointKinds';

export function useFittingHardpoints(fitting: Fitting | null): HardpointCounts | null {
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
        const loaded = await Promise.all(
          missing.map(async (typeId) => [typeId, await loadHardpointKind(typeId)] as const)
        );
        if (cancelled) return;
        // A type ESI couldn't supply stays unknown — and missing, so the next Fitting change retries it.
        const known = loaded.filter(
          (entry): entry is readonly [number, HardpointKind | null] => entry[1] !== undefined
        );
        if (known.length > 0) setKinds((previous) => new Map([...previous, ...known]));
      } catch {
        // Leaves them unknown; the pips show nothing taken.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [highTypeIds, kinds]);

  if (fitting === null) return null;
  return countHardpoints(fitting, (typeId) => kinds.get(typeId));
}
