import type { PlanPriority } from '@/engine/types';
import type { PlanRow } from './markers';

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

export function meaningfulBandStarts(
  starts: ReadonlyMap<string, PlanPriority>
): ReadonlyMap<string, PlanPriority> {
  return starts.size < 2 ? new Map() : starts;
}
