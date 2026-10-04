/**
 * "Seen on zKillboard" (issue #2486): which EVE Workbench fits for a hull
 * match one of its Popular fits — the same fitted modules, by the very key
 * `groupPopularFits` groups losses on (`popularFitKey`), so charges, drones
 * and cargo don't count. Pure: the caller loads the Workbench fits, the
 * Popular fits and the type/slot lookups.
 *
 * Only a positive signal. A fit that matches nothing gets no entry, and a fit
 * with any line the catalog can't resolve is left out rather than matched on
 * what's left — a dropped module could otherwise make it equal a smaller
 * group it isn't. A missed badge is harmless; a false one is not.
 *
 * One exception (issue #2536): the catalog leaves out Abyssal filaments, LP
 * boosters and the like, which Workbench fits carry in cargo all the time. An
 * unread line written with a count (`x1`, `countWritten`) was never a fitted
 * module, so it can't change the key. Such a fit is still matched, so long as
 * the game still has the item (`isGameItem`, the rule the Out-of-date check
 * applies): a fit carrying a removed item is out of date, and gets no badge.
 * An unread line without a count may be a fitted module, so it still rules
 * the fit out, even when the game has it — a mutated module, say.
 */
import { loadEftFitting, type EftSlotLookup, type EftTypeLookup } from './eftLoader';
import { popularFitKey, type PopularFit } from './popularFits';

/** How often a Workbench fit's modules turned up among the hull's recent losses. */
export interface WorkbenchSighting {
  count: number;
  /** The matching group's most recent loss (ISO); null when none carried a time. */
  lastSeen: string | null;
}

/** Each matching Workbench fit's sighting, keyed by its id; fits that match nothing are absent. */
export function matchWorkbenchSightings(
  fits: readonly { id: string; eft: string }[],
  popular: readonly PopularFit[],
  hullTypeId: number,
  typeByName: EftTypeLookup,
  slotByTypeId: EftSlotLookup,
  isGameItem: (name: string) => boolean
): Map<string, WorkbenchSighting> {
  const sightings = new Map<string, WorkbenchSighting>();
  const byKey = new Map(
    popular
      .filter((fit) => fit.parts.hullTypeId === hullTypeId)
      .map((fit) => [fit.key, fit] as const)
  );
  if (byKey.size === 0) return sightings;

  for (const fit of fits) {
    const parts = loadEftFitting(fit.eft, typeByName, slotByTypeId);
    if (parts.hullTypeId !== hullTypeId) continue;
    const onlyUnreadCargo = parts.unresolved.every(
      (warning) =>
        warning.kind === 'unknown-item' && warning.countWritten === true && isGameItem(warning.text)
    );
    if (!onlyUnreadCargo) continue;
    const group = byKey.get(popularFitKey(parts.modules));
    if (group) sightings.set(fit.id, { count: group.count, lastSeen: group.lastSeen });
  }
  return sightings;
}
