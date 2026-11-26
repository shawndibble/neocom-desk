import type { CsvColumn } from './csv';
import { formatDateTime, guardFormula, toCell, type ExportValue } from './exportCells';

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
