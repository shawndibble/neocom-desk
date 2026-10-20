import type { BuildPlanRecord } from '@/db';
import { sortRowsBy } from '@/components/ui/dataTableSort';
import type { DataTableSort } from '@/components/ui/DataTable';
import { useState } from 'react';
import type { PlanIndexStats } from './BuildPlanList';

/** The columns the list can be sorted by. No active sort means the pilot's own drag order. */
export type BuildPlanSortKey = 'profit' | 'iskPerHour' | 'margin';

function sortValue(stats: PlanIndexStats | undefined, key: string): number | undefined {
  // A "Fix location" plan's figures are not real, so it never ranks on them.
  if (!stats || stats.verdict === 'fixLocation') return undefined;
  if (key === 'profit') return stats.profit ?? undefined;
  return (key === 'iskPerHour' ? stats.iskPerHour : stats.marginPct) ?? undefined;
}

/** Stable sort by one column; plans with no figure sink to the bottom in either direction. */
export function sortPlans(
  plans: readonly BuildPlanRecord[],
  sort: DataTableSort | null,
  statsByPlanId: ReadonlyMap<string, PlanIndexStats>
): readonly BuildPlanRecord[] {
  if (!sort) return plans;
  return sortRowsBy(
    plans,
    (plan) => sortValue(statsByPlanId.get(plan.id), sort.columnId),
    sort.direction
  );
}

/**
 * Click-to-sort state: desc, then asc, then back to null (the manual drag
 * order). Not `nextDataTableSort`, which toggles forever with no way back.
 */
export function useBuildPlanSort() {
  const [sort, setSort] = useState<DataTableSort | null>(null);
  function cycleSort(columnId: BuildPlanSortKey) {
    setSort((prev) =>
      prev?.columnId !== columnId
        ? { columnId, direction: 'desc' }
        : prev.direction === 'desc'
          ? { columnId, direction: 'asc' }
          : null
    );
  }
  return { sort, cycleSort };
}
