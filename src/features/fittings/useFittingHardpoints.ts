/**
 * How many turret and launcher hardpoints the open Fitting's high slots take,
 * from each fitted type's dogma effects (`hardpointKinds.ts`). Null until
 * every high-slot type is known, so a pip is never shown free by mistake.
 */
import { useEffect, useMemo, useState } from 'react';
import { countHardpoints, type HardpointsUsed } from '@/engine/fittings/hardpoints';
import type { Fitting } from '@/engine/fittings/types';
import { loadHardpointKind } from './hardpointKinds';

type Kind = 'turret' | 'launcher' | null;

export function useFittingHardpoints(fitting: Fitting | null): HardpointsUsed | null {
  const [kinds, setKinds] = useState<ReadonlyMap<number, Kind>>(new Map());
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
      const loaded = await Promise.all(
        missing.map(async (typeId) => [typeId, await loadHardpointKind(typeId)] as const)
      );
      if (cancelled) return;
      setKinds((previous) => new Map([...previous, ...loaded]));
    })();
    return () => {
      cancelled = true;
    };
  }, [highTypeIds, kinds]);

  if (fitting === null) return null;
  return countHardpoints(fitting, (typeId) => kinds.get(typeId));
}
