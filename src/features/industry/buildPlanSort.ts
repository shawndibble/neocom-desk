import type { BuildPlanRecord } from '@/db';
import { sortRowsBy } from '@/components/ui/dataTableSort';
import type { DataTableSort } from '@/components/ui/DataTable';
import { useState } from 'react';
import type { PlanIndexStats } from './BuildPlanList';

export type BuildPlanSortKey = 'profit' | 'iskPerHour' | 'margin';

function sortValue(stats: PlanIndexStats | undefined, key: string): number | undefined {
  if (!stats || stats.verdict === 'fixLocation') return undefined;
  if (key === 'profit') return stats.profit ?? undefined;
  return (key === 'iskPerHour' ? stats.iskPerHour : stats.marginPct) ?? undefined;
}

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
