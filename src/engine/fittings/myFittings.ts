export interface MyFittingRow {
  id: string;
  name: string;
  hull: string | null;
}

export interface HullGroup<T extends MyFittingRow> {
  hull: string | null;
  rows: T[];
}

const byText = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

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

export function filterMyFittings<T extends MyFittingRow>(rows: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...rows];
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(needle) || (row.hull?.toLowerCase().includes(needle) ?? false)
  );
}

export const LIBRARY_SOURCES = ['saved', 'inGame', 'shared', 'doctrine'] as const;
export type LibrarySource = (typeof LIBRARY_SOURCES)[number];
export type LibrarySourcePick = LibrarySource | 'all';

export type LibraryRowSource = LibrarySource | 'active';

const sourceOf = (source: LibraryRowSource): LibrarySource =>
  source === 'active' ? 'inGame' : source;

export function librarySources(rows: readonly { source: LibraryRowSource }[]): LibrarySource[] {
  const present = new Set(rows.map((row) => sourceOf(row.source)));
  return LIBRARY_SOURCES.filter((source) => present.has(source));
}

export function filterBySource<T extends { source: LibraryRowSource }>(
  rows: readonly T[],
  pick: LibrarySourcePick
): T[] {
  return pick === 'all' ? [...rows] : rows.filter((row) => sourceOf(row.source) === pick);
}

export function effectiveSource(
  pick: LibrarySourcePick,
  offered: readonly LibrarySource[]
): LibrarySourcePick {
  return pick !== 'all' && offered.includes(pick) ? pick : 'all';
}
