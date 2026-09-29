import type { CsvColumn } from './csv';
import { formatDateTime, guardFormula, toCell, type ExportValue } from './exportCells';

/**
 * Tab-separated text for the clipboard. Google Sheets (and Excel) split a
 * pasted block on tabs and newlines and parse each cell as if typed, so
 * numbers and `YYYY-MM-DD HH:MM:SS` dates paste as real values. No quoting
 * exists in this format, so a tab or line break inside a cell is flattened
 * to a space rather than allowed to split the row.
 */
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
      return guardFormula(cell.value.replace(/[\t\r\n]+/g, ' '));
  }
}

export function toTsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((c) => renderField(c.header)).join('\t');
  const lines = rows.map((row) => columns.map((c) => renderField(c.value(row))).join('\t'));
  return `${[header, ...lines].join('\n')}\n`;
}
