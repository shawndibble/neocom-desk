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

/**
 * A Source filter's choices for the Fittings library (issue #6217), in the
 * order they are offered. The Active Fitting has none of its own: it is the
 * ship fitted in game, so it counts as In-game.
 */
export const LIBRARY_SOURCES = ['saved', 'inGame', 'shared', 'doctrine'] as const;
export type LibrarySource = (typeof LIBRARY_SOURCES)[number];
export type LibrarySourcePick = LibrarySource | 'all';

/** A library row's own source: one of the filter's, or the Active Fitting's. */
export type LibraryRowSource = LibrarySource | 'active';

const sourceOf = (source: LibraryRowSource): LibrarySource =>
  source === 'active' ? 'inGame' : source;

/** The sources that have at least one row, in `LIBRARY_SOURCES` order. */
export function librarySources(rows: readonly { source: LibraryRowSource }[]): LibrarySource[] {
  const present = new Set(rows.map((row) => sourceOf(row.source)));
  return LIBRARY_SOURCES.filter((source) => present.has(source));
}

/** Keeps the rows of the picked source; `all` keeps every row. */
export function filterBySource<T extends { source: LibraryRowSource }>(
  rows: readonly T[],
  pick: LibrarySourcePick
): T[] {
  return pick === 'all' ? [...rows] : rows.filter((row) => sourceOf(row.source) === pick);
}

/** The pick, or All sources once its source has no rows, so a stale pick never empties the list. */
export function effectiveSource(
  pick: LibrarySourcePick,
  offered: readonly LibrarySource[]
): LibrarySourcePick {
  return pick !== 'all' && offered.includes(pick) ? pick : 'all';
}
