import type { AnyXlsxSheet } from './xlsx';
import { toCsv, csvFilename, exportFilename, slugifyForFilename, type CsvColumn } from './csv';
import { downloadBlob, downloadTextFile } from './download';
import { writeToClipboard } from './clipboard';
import { toTsv } from './tsv';

export type CsvSurface =
  | 'skills'
  | 'skill-queue'
  | 'build-materials'
  | 'industry-jobs'
  | 'corp-industry-jobs'
  | 'corp-members'
  | 'wallet-journal'
  | 'corp-wallet-journal'
  | 'wallet-transactions'
  | 'assets'
  | 'my-ships'
  | 'corp-assets'
  | 'contracts'
  | 'contacts'
  | 'npc-standings'
  | 'stock-targets'
  | 'contacts-across'
  | 'orders-open'
  | 'mail'
  | 'calendar'
  | 'market-sell'
  | 'market-buy'
  | 'market-variations'
  | 'market-compare'
  | 'market-appraisal'
  | 'market-compare-attributes'
  | 'market-compare-hubs'
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
  | 'industry-job-history'
  | 'industry-owned-blueprints'
  | 'market-wide-opportunities'
  | 'production-log-items'
  | 'production-log-runs'
  | 'use-or-sell'
  | 'mining-overview'
  | 'mining-tax'
  | 'mining-yield-ores'
  | 'mining-yield-refines'
  | 'pi-plan-flow'
  | 'pi-plan-hauling'
  | 'characters'
  | 'clones'
  | 'employment-history'
  | 'lp-offers'
  | 'lp-offer-materials'
  | 'activity-log'
  | 'data-age'
  | 'skill-compare'
  | 'wallet-balances'
  | 'mining-tax-payee-ledger';

export type ExportSurface = CsvSurface;

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

export type ExportFormat = 'csv' | 'xlsx' | 'clipboard';

export interface ExportOptions {
  now?: Date;
  truncated?: boolean;
  qualifier?: string;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type WorkbookSurface = 'corp-tax-book' | 'corp-srp';

function exportBase(surface: ExportSurface | WorkbookSurface, qualifier?: string): string {
  return qualifier ? `${surface}-${slugifyForFilename(qualifier)}` : surface;
}

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
    case 'xlsx':
      await downloadWorkbook(surface, [{ name: exportBase(surface, qualifier), rows, columns }], {
        now,
        truncated,
        qualifier,
      });
      return;
  }
}

export interface WorkbookDownload {
  filename: string;
  sheets: number;
  rows: number;
}

export async function downloadWorkbook(
  surface: ExportSurface | WorkbookSurface,
  sheets: readonly AnyXlsxSheet[],
  { now = new Date(), truncated = false, qualifier }: ExportOptions = {}
): Promise<WorkbookDownload> {
  const { buildWorkbook } = await import('./xlsxBuild');
  const filename = exportFilename(exportBase(surface, qualifier), now, 'xlsx', {
    partial: truncated,
  });
  const bytes = await buildWorkbook(sheets);
  downloadBlob(filename, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: XLSX_MIME }));
  return {
    filename,
    sheets: sheets.length,
    rows: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
  };
}
