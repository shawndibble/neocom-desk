import { toCsv, csvFilename, exportFilename, slugifyForFilename, type CsvColumn } from './csv';
import { downloadBlob, downloadTextFile } from './download';
import { writeToClipboard } from './clipboard';
import { toTsv } from './tsv';

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
  | 'corp-wallet-transactions'
  | 'assets'
  | 'corp-assets'
  | 'contracts'
  | 'contacts'
  // The Across tab's rows are a different shape (one row per contact across
  // every character, not one row per contact on this one) and must never
  // collide with the Character tab's own file — same reasoning as
  // corp-vs-personal above.
  | 'contacts-across'
  | 'orders-open'
  | 'orders-history'
  | 'mail'
  | 'calendar'
  | 'market-sell'
  | 'market-buy'
  | 'market-variations'
  | 'market-compare'
  | 'market-appraisal'
  | 'market-compare-attributes'
  | 'market-price-history'
  | 'market-scope-orders'
  | 'appraisal-shared'
  | 'hauling'
  | 'bpc-sourcing'
  | 'contract-search'
  | 'courier-contracts'
  | 'contract-items'
  | 'fitting-variations'
  | 'fitting-compare'
  | 'fitting-compare-modules'
  | 'build-group-materials'
  | 'build-plan-compare'
  | 'build-plan-runs'
  | 'industry-opportunities'
  | 'market-wide-opportunities'
  | 'production-log-items'
  | 'production-log-runs'
  | 'use-or-sell'
  | 'mining-overview'
  | 'mining-tax'
  | 'mining-yield-ores'
  | 'mining-yield-refines'
  | 'pi-chain'
  | 'pi-sensitivity'
  | 'characters'
  | 'clones'
  | 'employment-history'
  | 'lp-offers'
  | 'lp-offer-materials'
  | 'activity-log'
  | 'data-age'
  | 'skill-compare'
  | 'wallet-balances'
  | 'loyalty-points';

/** Every surface exports in every format; the name reads better at the menu. */
export type ExportSurface = CsvSurface;

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
  downloadTextFile(
    csvFilename(exportBase(surface, qualifier), now, { partial: truncated }),
    toCsv(rows, columns)
  );
}

/**
 * The formats `TableActionsMenu` offers. `clipboard` is tab-separated text, which
 * Google Sheets and Excel split into cells on paste; `xlsx` sidesteps every
 * CSV import dialog.
 */
export type ExportFormat = 'csv' | 'xlsx' | 'clipboard';

export interface ExportOptions {
  now?: Date;
  truncated?: boolean;
  qualifier?: string;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function exportBase(surface: ExportSurface, qualifier?: string): string {
  return qualifier ? `${surface}-${slugifyForFilename(qualifier)}` : surface;
}

/** One entry point for every format, so every table exports identically. */
export async function exportRows<T>(
  format: ExportFormat,
  surface: ExportSurface,
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  { now = new Date(), truncated = false, qualifier }: ExportOptions = {}
): Promise<void> {
  switch (format) {
    case 'csv':
      downloadCsv(surface, rows, columns, now, truncated, qualifier);
      return;
    case 'clipboard':
      await writeToClipboard(toTsv(rows, columns));
      return;
    case 'xlsx': {
      // Loaded on demand: the zip writer has no business in the main bundle.
      const { toXlsx } = await import('./xlsx');
      const base = exportBase(surface, qualifier);
      const bytes = toXlsx(rows, columns, base);
      downloadBlob(
        exportFilename(base, now, 'xlsx', { partial: truncated }),
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: XLSX_MIME })
      );
      return;
    }
  }
}
