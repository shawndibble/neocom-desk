/**
 * Moons from Extractions (issue #6299): the book knows a moon from its first Extraction
 * (decision 20261115-173527), so a moon is every Extraction sharing a `moonId`.
 */
import type { ExtractionRow } from './bookView';
import type { ExtractionState } from './extraction';

export interface MoonRow {
  moonId: number;
  /** The refinery and owner of the moon's newest Extraction. */
  structureId: number;
  sourceCorporationId?: number;
  extractionCount: number;
  states: Partial<Record<ExtractionState, number>>;
  /** The soonest chunk still to pop. */
  nextPopAt?: string;
  /** The latest chunk that popped (not cancelled, not still to come). */
  lastPopAt?: string;
  tax: number;
}

const newestFirst = (a: ExtractionRow, b: ExtractionRow) => b.startedAt.localeCompare(a.startedAt);

/** One row per moon, in no particular order (the table sorts). */
export function moonRows(extractions: readonly ExtractionRow[]): MoonRow[] {
  const byMoon = new Map<number, ExtractionRow[]>();
  for (const x of extractions) {
    const held = byMoon.get(x.moonId);
    if (held) held.push(x);
    else byMoon.set(x.moonId, [x]);
  }
  return [...byMoon].map(([moonId, rows]) => {
    const [newest] = [...rows].sort(newestFirst);
    const states: MoonRow['states'] = {};
    for (const x of rows) states[x.state] = (states[x.state] ?? 0) + 1;
    const upcoming = rows
      .filter((x) => x.state === 'extracting')
      .map((x) => x.chunkArrivalAt)
      .sort();
    const popped = rows
      .filter((x) => x.state !== 'cancelled' && x.state !== 'extracting')
      .map((x) => x.chunkArrivalAt)
      .sort();
    return {
      moonId,
      structureId: newest.structureId,
      ...(newest.sourceCorporationId !== undefined
        ? { sourceCorporationId: newest.sourceCorporationId }
        : {}),
      extractionCount: rows.length,
      states,
      ...(upcoming[0] !== undefined ? { nextPopAt: upcoming[0] } : {}),
      ...(popped.length > 0 ? { lastPopAt: popped[popped.length - 1] } : {}),
      tax: rows.reduce((s, x) => s + x.tax, 0),
    };
  });
}

/** One moon's Extractions, newest first. */
export function moonExtractions(
  extractions: readonly ExtractionRow[],
  moonId: number
): ExtractionRow[] {
  return extractions.filter((x) => x.moonId === moonId).sort(newestFirst);
}
