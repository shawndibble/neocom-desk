export interface DataTableRowGroup<T> {
  key: string | null;
  rows: T[];
}

export function groupSortedRows<T>(
  rows: readonly T[],
  key: (row: T) => string | null
): DataTableRowGroup<T>[] {
  const groups: DataTableRowGroup<T>[] = [];
  const byKey = new Map<string, DataTableRowGroup<T>>();
  for (const row of rows) {
    const k = key(row);
    if (k === null) {
      groups.push({ key: null, rows: [row] });
      continue;
    }
    const existing = byKey.get(k);
    if (existing) {
      existing.rows.push(row);
    } else {
      const group = { key: k, rows: [row] };
      byKey.set(k, group);
      groups.push(group);
    }
  }
  return groups;
}

export function orderGroups<T>(
  groups: DataTableRowGroup<T>[],
  compare: ((a: readonly T[], b: readonly T[]) => number) | undefined
): DataTableRowGroup<T>[] {
  if (!compare) return groups;
  const keyed = groups
    .filter((group) => group.key !== null)
    .sort((a, b) => compare(a.rows, b.rows));
  let next = 0;
  return groups.map((group) => (group.key === null ? group : keyed[next++]!));
}
