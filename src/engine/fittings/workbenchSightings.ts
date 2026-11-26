import type { PopularFit } from './popularFits';
import type { WorkbenchFitCheck } from './workbenchFitCheck';

export interface WorkbenchSighting {
  count: number;
  lastSeen: string | null;
}

export function matchWorkbenchSightings(
  checks: ReadonlyMap<string, Pick<WorkbenchFitCheck, 'hullTypeId' | 'sightingKey'>>,
  popular: readonly PopularFit[],
  hullTypeId: number
): Map<string, WorkbenchSighting> {
  const sightings = new Map<string, WorkbenchSighting>();
  const byKey = new Map(
    popular
      .filter((fit) => fit.parts.hullTypeId === hullTypeId)
      .map((fit) => [fit.key, fit] as const)
  );
  if (byKey.size === 0) return sightings;

  for (const [id, check] of checks) {
    if (check.hullTypeId !== hullTypeId || check.sightingKey === null) continue;
    const group = byKey.get(check.sightingKey);
    if (group) sightings.set(id, { count: group.count, lastSeen: group.lastSeen });
  }
  return sightings;
}
