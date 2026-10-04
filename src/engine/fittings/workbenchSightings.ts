/**
 * "Seen on zKillboard" (issue #2486): which EVE Workbench fits for a hull
 * match one of its Popular fits — the same fitted modules, by the very key
 * `groupPopularFits` groups losses on (`popularFitKey`), so charges, drones
 * and cargo don't count. Pure: matched off each fit's own check
 * (`workbenchFitCheck.ts`), which has already parsed its EFT and decided
 * whether it can be matched at all.
 *
 * Only a positive signal. A fit that matches nothing gets no entry.
 */
import type { PopularFit } from './popularFits';
import type { WorkbenchFitCheck } from './workbenchFitCheck';

/** How often a Workbench fit's modules turned up among the hull's recent losses. */
export interface WorkbenchSighting {
  count: number;
  /** The matching group's most recent loss (ISO); null when none carried a time. */
  lastSeen: string | null;
}

/** Each matching Workbench fit's sighting, keyed by its id; fits that match nothing are absent. */
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
