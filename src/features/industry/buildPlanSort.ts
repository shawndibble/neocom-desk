import type { BuildPlanRecord } from '@/db';

export type SortMode = 'alphabetical' | 'lastUpdated';

/** Sorted view of `plans` matching `query` by name (case-insensitive substring). */
export function filterAndSortPlans(
  plans: readonly BuildPlanRecord[],
  query: string,
  sort: SortMode
): BuildPlanRecord[] {
  const q = query.trim().toLowerCase();
  const filtered = q ? plans.filter((p) => p.name.toLowerCase().includes(q)) : [...plans];
  return filtered.sort((a, b) =>
    sort === 'alphabetical' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt
  );
}
