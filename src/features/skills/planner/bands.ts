/**
 * Priority-band headers for the entry list (#27: Skill priorities and
 * bands). Purely presentational: the plan's actual order (and drag-and-drop)
 * is untouched — this only decides where to draw a divider between runs of
 * differently-prioritized entries, using each entry's *effective* priority
 * (inherited from dependents, see `@/engine/planPriority`) so a prerequisite
 * never reads as a lower band than the entry that needs it.
 */
import type { PlanPriority } from '@/engine/types';
import type { PlanRow } from './markers';

/**
 * Row ids that start a new priority band, mapped to that band's priority.
 * Marker rows are skipped entirely — they neither start a band nor reset the
 * running comparison between entries.
 */
export function bandStarts(
  rows: readonly PlanRow[],
  effectivePriority: ReadonlyMap<number, PlanPriority>
): Map<string, PlanPriority> {
  const starts = new Map<string, PlanPriority>();
  let previous: PlanPriority | undefined;
  for (const row of rows) {
    if (row.kind !== 'entry') continue;
    const priority = effectivePriority.get(row.entry.skillTypeID) ?? 'normal';
    if (priority !== previous) starts.set(row.id, priority);
    previous = priority;
  }
  return starts;
}
