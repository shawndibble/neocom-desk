import type { ExtractionRow } from './bookView';
import type { ExtractionState } from './extraction';

export interface RefineryListRow {
  structureId: number;
  moonId: number;
  sourceCorporationId?: number;
  extractionCount: number;
  states: Partial<Record<ExtractionState, number>>;
  nextPopAt?: string;
  lastPopAt?: string;
  tax: number;
}

export const newestFirst = (a: ExtractionRow, b: ExtractionRow) =>
  b.startedAt.localeCompare(a.startedAt);

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

export function refineryExtractions(
  extractions: readonly ExtractionRow[],
  structureId: number
): ExtractionRow[] {
  return extractions.filter((x) => x.structureId === structureId).sort(newestFirst);
}

export function newestRefineryOnMoon(
  extractions: readonly ExtractionRow[],
  moonId: number
): number | undefined {
  return [...extractions].filter((x) => x.moonId === moonId).sort(newestFirst)[0]?.structureId;
}
