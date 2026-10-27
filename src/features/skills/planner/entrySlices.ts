/**
 * Which scheduled steps each plan entry contributed, as index ranges.
 *
 * `normalizePlanWithBoundaries` reports boundaries over the *catalog-known*
 * subset of entries, while every caller renders or edits the full list — so
 * each one has to walk two sequences at once and skip unknown entries without
 * consuming a boundary. Three callers were doing that arithmetic three
 * different ways (`summarizeEntryQueue`, `splitEntriesByLevel`,
 * `planDrop`'s ghost check); this is the one place it lives now.
 *
 * Indices, not steps: callers hold different step types (`PlanStep` while
 * splitting, `ScheduledStep` once timed) and want different things from the
 * range, so handing back slices would force one of those shapes on everyone.
 */
import type { PlanEntry, PlanStep } from '@/engine/types';

export interface EntrySlice {
  /** First step index this entry contributed, including prereqs pulled in for it. */
  start: number;
  /**
   * First index of the entry's *own* skill, or -1 when it contributed none —
   * a level an earlier entry already trained, or an already-trained skill.
   * Steps in `[start, ownStart)` are the prerequisites inserted ahead of it.
   */
  ownStart: number;
  /** One past this entry's last step. */
  end: number;
}

/**
 * One slice per entry, positionally aligned to `entries` — including entries
 * whose skill the catalog does not know, which consume no boundary and get an
 * empty slice rather than shifting every slice after them.
 */
export function entrySlices(
  entries: readonly PlanEntry[],
  entryBoundaries: readonly number[],
  steps: readonly PlanStep[],
  isKnown: (skillTypeID: number) => boolean
): EntrySlice[] {
  let previous = 0;
  let boundaryIndex = 0;
  return entries.map((entry) => {
    if (!isKnown(entry.skillTypeID)) {
      return { start: previous, ownStart: -1, end: previous };
    }
    const start = previous;
    const end = entryBoundaries[boundaryIndex++];
    let ownStart = -1;
    for (let i = start; i < end; i++) {
      if (steps[i].skillTypeID === entry.skillTypeID) {
        ownStart = i;
        break;
      }
    }
    previous = end;
    return { start, ownStart, end };
  });
}
