export interface DataTableRowGroup<T> {
  /** The shared key, or `null` for a row that never groups (always a singleton). */
  key: string | null;
  rows: T[];
}

/**
 * Gathers already-sorted rows by `key` without re-sorting them: each group
 * sits where its first member did, and members keep their incoming order. So
 * the table's sort still decides what a reader sees first — a group of three
 * courier offers on one route surfaces at its best offer's rank, not at the
 * end of the list. `null` is "no identity to group on", so each such row is
 * its own singleton rather than all of them pooling into one bucket.
 *
 * Its own module for the same reason `dataTableSort` is: a plain function
 * that tests without rendering, kept out of the component file.
 */
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

/**
 * Reorders the keyed groups by `compare` while every `null`-key singleton
 * stays at the slot it held: those rows have no group identity, so only the
 * groups that read as a section move. Members keep their incoming (sorted)
 * order and ties keep the incoming group order, so a group order never
 * disturbs the row sort inside a group.
 */
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
