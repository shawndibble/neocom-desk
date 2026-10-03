/**
 * "Seen on zKillboard" for the EVE Workbench tab (issue #2486): the hull's
 * Workbench fits matched against its Popular fits by
 * `engine/fittings/workbenchSightings.ts`. The losses come from
 * `loadPopularFits` — the zKillboard tab's own load, cached and shared per
 * hull — so the badges never cost a zKillboard request of their own. If
 * zKillboard can't be reached the answer is simply "no badges".
 */
import { useEffect, useState } from 'react';
import {
  matchWorkbenchSightings,
  type WorkbenchSighting,
} from '@/engine/fittings/workbenchSightings';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadFittingSlots } from '@/sde/loadSde';
import { loadPopularFits } from './popularFits';
import type { WorkbenchFit } from './workbenchFits';

export type { WorkbenchSighting };

const NONE: ReadonlyMap<string, WorkbenchSighting> = new Map();

/** Each Workbench fit seen among the hull's recent losses, by fit id. Never throws. */
export async function loadWorkbenchSightings(
  shipTypeId: number,
  fits: readonly WorkbenchFit[]
): Promise<ReadonlyMap<string, WorkbenchSighting>> {
  if (fits.length === 0) return NONE;
  try {
    const popular = await loadPopularFits(shipTypeId);
    if (!popular.ok || popular.fits.length === 0) return NONE;
    const [typeByName, slotByTypeId] = await Promise.all([loadItemNameMap(), loadFittingSlots()]);
    return matchWorkbenchSightings(fits, popular.fits, shipTypeId, typeByName, slotByTypeId);
  } catch {
    return NONE;
  }
}

/** The Workbench fits' sightings; empty until they land, and for good when there are none. */
export function useWorkbenchSightings(
  shipTypeId: number,
  fits: readonly WorkbenchFit[] | null
): ReadonlyMap<string, WorkbenchSighting> {
  const [state, setState] = useState<{
    fits: readonly WorkbenchFit[];
    sightings: ReadonlyMap<string, WorkbenchSighting>;
  } | null>(null);
  useEffect(() => {
    if (fits === null) return;
    let cancelled = false;
    void loadWorkbenchSightings(shipTypeId, fits).then((sightings) => {
      if (!cancelled) setState({ fits, sightings });
    });
    return () => {
      cancelled = true;
    };
  }, [shipTypeId, fits]);
  // Answers for another hull's list never show against this one.
  return state !== null && state.fits === fits ? state.sightings : NONE;
}
