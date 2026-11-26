import type { Translate } from './translate';
import { formatDateTime, guardFormula, toCell, type ExportValue } from './exportCells';

export type CsvTranslate = Translate;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => ExportValue;
}

const BOM = '\uFEFF';
const DELIMITER = ',';

function renderField(value: ExportValue): string {
  const cell = toCell(value);
  switch (cell.kind) {
    case 'empty':
      return '';
    case 'number':
      return String(cell.value);
    case 'date':
      return formatDateTime(cell.value);
    case 'text':
      return `"${guardFormula(cell.value).replace(/"/g, '""')}"`;
  }
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((c) => renderField(c.header)).join(DELIMITER);
  const dataLines = rows.map((row) =>
    columns.map((c) => renderField(c.value(row))).join(DELIMITER)
  );
  return `${BOM}${[header, ...dataLines].join('\r\n')}\r\n`;
}

export function csvFilename(base: string, date: Date, options?: { partial?: boolean }): string {
  return exportFilename(base, date, 'csv', options);
}

export function exportFilename(
  base: string,
  date: Date,
  extension: string,
  options?: { partial?: boolean }
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const suffix = options?.partial ? '-partial' : '';
  return `neocom-${base}-${stamp}${suffix}.${extension}`;
}

export function slugifyForFilename(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'unnamed';
}
