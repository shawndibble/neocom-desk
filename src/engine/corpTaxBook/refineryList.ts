/**
 * Refineries from Extractions (issue #6348): players know a moon by its refinery's name, so the
 * Refineries tab has one row per refinery (`structureId`), and its page is keyed the same way
 * (archive is stored per refinery, and one moon can have several refineries over time).
 */
import type { ExtractionRow } from './bookView';
import type { ExtractionState } from './extraction';

export interface RefineryListRow {
  structureId: number;
  /** The moon of the refinery's newest Extraction. */
  moonId: number;
  /** The moon owner whose refinery it is; absent means the book's own corporation. */
  sourceCorporationId?: number;
  extractionCount: number;
  states: Partial<Record<ExtractionState, number>>;
  /** The soonest chunk still to pop. */
  nextPopAt?: string;
  /** The latest chunk that popped (not cancelled, not still to come). */
  lastPopAt?: string;
  tax: number;
}

export const newestFirst = (a: ExtractionRow, b: ExtractionRow) =>
  b.startedAt.localeCompare(a.startedAt);

/** The soonest chunk still to pop, and the latest that popped (not cancelled, not still to come). */
export function popBounds(rows: readonly ExtractionRow[]): {
  nextPopAt?: string;
  lastPopAt?: string;
} {
  const upcoming = rows
    .filter((x) => x.state === 'extracting')
    .map((x) => x.chunkArrivalAt)
    .sort();
  const popped = rows
    .filter((x) => x.state !== 'cancelled' && x.state !== 'extracting')
    .map((x) => x.chunkArrivalAt)
    .sort();
  return {
    ...(upcoming[0] !== undefined ? { nextPopAt: upcoming[0] } : {}),
    ...(popped.length > 0 ? { lastPopAt: popped[popped.length - 1] } : {}),
  };
}

/** One row per refinery that has an Extraction, in no particular order (the table sorts). */
export function refineryListRows(extractions: readonly ExtractionRow[]): RefineryListRow[] {
  const byRefinery = new Map<number, ExtractionRow[]>();
  for (const x of extractions) {
    const held = byRefinery.get(x.structureId);
    if (held) held.push(x);
    else byRefinery.set(x.structureId, [x]);
  }
  return [...byRefinery].map(([structureId, rows]) => {
    const [newest] = [...rows].sort(newestFirst);
    const states: RefineryListRow['states'] = {};
    for (const x of rows) states[x.state] = (states[x.state] ?? 0) + 1;
    const { nextPopAt, lastPopAt } = popBounds(rows);
    return {
      structureId,
      moonId: newest.moonId,
      ...(newest.sourceCorporationId !== undefined
        ? { sourceCorporationId: newest.sourceCorporationId }
        : {}),
      extractionCount: rows.length,
      states,
      ...(nextPopAt !== undefined ? { nextPopAt } : {}),
      ...(lastPopAt !== undefined ? { lastPopAt } : {}),
      tax: rows.reduce((s, x) => s + x.tax, 0),
    };
  });
}

/** One refinery's Extractions, newest first. */
export function refineryExtractions(
  extractions: readonly ExtractionRow[],
  structureId: number
): ExtractionRow[] {
  return extractions.filter((x) => x.structureId === structureId).sort(newestFirst);
}

/**
 * The refinery an old moon link (`/corp/moons/moons/:moonId`) opens: the one of the moon's
 * newest Extraction. Undefined when the book holds no Extraction at that moon.
 */
export function newestRefineryOnMoon(
  extractions: readonly ExtractionRow[],
  moonId: number
): number | undefined {
  return [...extractions].filter((x) => x.moonId === moonId).sort(newestFirst)[0]?.structureId;
}
