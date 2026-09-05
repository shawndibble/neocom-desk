import { toCsv, csvFilename, slugifyForFilename, type CsvColumn } from './csv';
import { downloadTextFile } from './download';

/**
 * The export surfaces, closed so a mistyped filename can't ship. Adding a
 * surface is a deliberate edit here, not a string literal at a call site.
 */
export type CsvSurface =
  | 'skills'
  | 'skill-queue'
  | 'build-materials'
  | 'industry-jobs'
  // Corp-owned exports get their own surface rather than sharing the personal
  // one: the two files hold different owners' rows and must not land in a
  // downloads folder under the same name (issue #298).
  | 'corp-industry-jobs'
  | 'corp-members'
  | 'wallet-journal'
  | 'corp-wallet-journal'
  | 'wallet-transactions'
  | 'assets'
  | 'contracts'
  | 'orders-open'
  | 'orders-history'
  | 'mail'
  | 'calendar'
  | 'market-sell'
  | 'market-buy'
  | 'market-variations'
  | 'market-compare';

/**
 * Serialize and hand the browser a file. Composes the pure serializer with
 * the DOM trigger so neither has to know about the other — `csv.ts` stays
 * unit-testable without a DOM, `download.ts` stays useful for non-CSV files.
 *
 * `now` is injected so a caller's test can pin the filename instead of
 * freezing the clock. `truncated` marks a fetch that stopped short (pages
 * missing/capped) — the filename gets a `-partial` suffix so the file never
 * looks like the complete list just because it opens fine. `qualifier` folds
 * a free-text distinguisher (a corp wallet division's name) into the
 * filename, slugified — without it, exporting two divisions back to back
 * overwrites the same file (issue #413).
 */
export function downloadCsv<T>(
  surface: CsvSurface,
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  now: Date = new Date(),
  truncated = false,
  qualifier?: string
): void {
  const base = qualifier ? `${surface}-${slugifyForFilename(qualifier)}` : surface;
  downloadTextFile(csvFilename(base, now, { partial: truncated }), toCsv(rows, columns));
}
