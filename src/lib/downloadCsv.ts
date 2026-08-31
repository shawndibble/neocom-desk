import { toCsv, csvFilename, type CsvColumn } from './csv';
import { downloadTextFile } from './download';

/**
 * The export surfaces, closed so a mistyped filename can't ship. Adding a
 * surface is a deliberate edit here, not a string literal at a call site.
 */
export type CsvSurface = 'skills' | 'skill-queue' | 'build-materials' | 'industry-jobs';

/**
 * Serialize and hand the browser a file. Composes the pure serializer with
 * the DOM trigger so neither has to know about the other — `csv.ts` stays
 * unit-testable without a DOM, `download.ts` stays useful for non-CSV files.
 *
 * `now` is injected so a caller's test can pin the filename instead of
 * freezing the clock.
 */
export function downloadCsv<T>(
  surface: CsvSurface,
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  now: Date = new Date()
): void {
  downloadTextFile(csvFilename(surface, now), toCsv(rows, columns));
}
