/**
 * Pure list helpers for My Fittings (issue #1538): the saved records, once
 * each share code has been decoded to its hull name, grouped and searched.
 */

export interface MyFittingRow {
  id: string;
  name: string;
  /** Hull name, or null when the saved code no longer decodes. */
  hull: string | null;
}

export interface HullGroup<T extends MyFittingRow> {
  hull: string | null;
  rows: T[];
}

const byText = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Groups by hull (A–Z, undecodable codes last); rows within a hull by name. */
export function groupByHull<T extends MyFittingRow>(rows: readonly T[]): HullGroup<T>[] {
  const byHull = new Map<string | null, T[]>();
  for (const row of rows) {
    const list = byHull.get(row.hull);
    if (list) list.push(row);
    else byHull.set(row.hull, [row]);
  }
  return [...byHull.entries()]
    .map(([hull, list]) => ({ hull, rows: list.sort((a, b) => byText(a.name, b.name)) }))
    .sort((a, b) => {
      if (a.hull === null) return b.hull === null ? 0 : 1;
      if (b.hull === null) return -1;
      return byText(a.hull, b.hull);
    });
}

/** Keeps rows whose name or hull contains the query; a blank query keeps all. */
export function filterMyFittings<T extends MyFittingRow>(rows: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...rows];
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(needle) || (row.hull?.toLowerCase().includes(needle) ?? false)
  );
}
